from __future__ import annotations

import argparse
import json
import os
import sqlite3
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Iterable

import psycopg
from psycopg.rows import dict_row

from tools.migration.migrate import TABLE_ORDER


SAMPLE_TABLES = (
    "persons", "organizations", "papers", "positions", "relationships",
    "relationship_evidence",
)


def compare_counts(source: dict[str, int], target: dict[str, int]) -> dict[str, dict[str, int]]:
    return {
        table: {"source": source.get(table, 0), "target": target.get(table, 0)}
        for table in sorted(set(source) | set(target))
        if source.get(table, 0) != target.get(table, 0)
    }


def find_duplicate_ids(rows: Iterable[dict[str, Any]]) -> list[str]:
    seen: set[str] = set()
    duplicates: set[str] = set()
    for row in rows:
        value = str(row["id"])
        if value in seen:
            duplicates.add(value)
        seen.add(value)
    return sorted(duplicates)


@dataclass
class VerificationReport:
    count_mismatches: dict[str, dict[str, int]] = field(default_factory=dict)
    duplicate_ids: dict[str, list[str]] = field(default_factory=dict)
    orphans: dict[str, list[str]] = field(default_factory=dict)
    owner_mismatches: list[str] = field(default_factory=list)
    sample_mismatches: dict[str, list[str]] = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not any((
            self.count_mismatches, self.duplicate_ids, self.orphans,
            self.owner_mismatches, self.sample_mismatches,
        ))

    def to_dict(self) -> dict[str, Any]:
        return {"ok": self.ok, **asdict(self)}


def _sqlite_counts(connection: sqlite3.Connection) -> dict[str, int]:
    return {
        table: connection.execute(f'select count(*) from "{table}"').fetchone()[0]
        for table in TABLE_ORDER
    }


def verify_live(snapshot: Path, target: psycopg.Connection, admin_id: str) -> VerificationReport:
    report = VerificationReport()
    with sqlite3.connect(f"file:{snapshot.resolve(strict=True).as_posix()}?mode=ro", uri=True) as source:
        source.row_factory = sqlite3.Row
        source_counts = _sqlite_counts(source)
        target_counts = {
            table: target.execute(f'select count(*) as count from public."{table}"').fetchone()["count"]
            for table in TABLE_ORDER
        }
        report.count_mismatches = compare_counts(source_counts, target_counts)
        for table in TABLE_ORDER:
            duplicates = target.execute(
                f'select id::text from public."{table}" group by id having count(*) > 1 order by id'
            ).fetchall()
            if duplicates:
                report.duplicate_ids[table] = [row["id"] for row in duplicates]

        owner_rows = target.execute(
            "select id::text from public.persons where owner_user_id is not null and owner_user_id <> %s "
            "union all select id::text from public.positions where owner_user_id is not null and owner_user_id <> %s",
            (admin_id, admin_id),
        ).fetchall()
        report.owner_mismatches = sorted(row["id"] for row in owner_rows)

        orphan_queries = {
            "persons.current_organization_id": (
                "select p.id::text from public.persons p left join public.organizations o "
                "on o.id=p.current_organization_id where p.current_organization_id is not null and o.id is null"
            ),
            "relationships.person_a_id": (
                "select r.id::text from public.relationships r left join public.persons p "
                "on p.id=r.person_a_id where p.id is null"
            ),
            "relationships.person_b_id": (
                "select r.id::text from public.relationships r left join public.persons p "
                "on p.id=r.person_b_id where p.id is null"
            ),
            "relationship_evidence.relationship_id": (
                "select e.id::text from public.relationship_evidence e left join public.relationships r "
                "on r.id=e.relationship_id where r.id is null"
            ),
        }
        for name, query in orphan_queries.items():
            rows = target.execute(query).fetchall()
            if rows:
                report.orphans[name] = sorted(row["id"] for row in rows)

        for table in SAMPLE_TABLES:
            source_ids = [
                str(row[0]) for row in source.execute(
                    f'select id from "{table}" order by id limit 5'
                )
            ]
            if not source_ids:
                continue
            target_ids = [
                row["id"] for row in target.execute(
                    f'select id::text from public."{table}" where id = any(%s) order by id',
                    (source_ids,),
                ).fetchall()
            ]
            expected = sorted(str(__import__("uuid").UUID(value)) for value in source_ids)
            if target_ids != expected:
                report.sample_mismatches[table] = expected
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Verify a completed migration")
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--admin-id", required=True)
    parser.add_argument("--json-output", type=Path)
    args = parser.parse_args()
    database_url = os.environ.get("SUPABASE_DB_URL")
    if not database_url:
        raise SystemExit("SUPABASE_DB_URL is required")
    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        report = verify_live(args.snapshot, connection, args.admin_id)
    payload = json.dumps(report.to_dict(), ensure_ascii=False, sort_keys=True, indent=2)
    if args.json_output:
        args.json_output.write_text(payload + "\n", encoding="utf-8")
    print(payload)
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
