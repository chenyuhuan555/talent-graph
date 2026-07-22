from __future__ import annotations

import argparse
import os
import sqlite3
from pathlib import Path
from typing import Any
from uuid import UUID

import psycopg

from tools.migration.transform import OwnerMapper, transform_row


TABLE_ORDER = [
    "organizations", "source_records", "persons", "papers", "projects", "events",
    "positions", "tags", "experiences", "person_external_ids", "paper_authors",
    "project_contributors", "event_participants", "relationships",
    "relationship_evidence", "contacts", "outreach_records",
    "person_position_matches", "person_tags", "merge_tasks", "audit_logs",
]
SELF_PARENT_TABLES = {"organizations", "tags"}


def validate_replace(replace: bool, confirmation: str | None, project_ref: str) -> None:
    if replace and (not project_ref or confirmation != project_ref):
        raise ValueError("project_confirmation_required")


def _rows(connection: sqlite3.Connection, table: str) -> list[dict[str, Any]]:
    connection.row_factory = sqlite3.Row
    rows = [dict(row) for row in connection.execute(f'select * from "{table}"')]
    if table in SELF_PARENT_TABLES:
        pending = {row["id"]: row for row in rows}
        ordered: list[dict[str, Any]] = []
        while pending:
            ready = [
                row for row in pending.values()
                if not row.get("parent_id") or row["parent_id"] not in pending
            ]
            if not ready:
                raise ValueError(f"cyclic_parent_reference:{table}")
            for row in sorted(ready, key=lambda item: str(item["id"])):
                ordered.append(row)
                pending.pop(row["id"])
        return ordered
    return rows


def migrate_database(
    source: Path,
    destination: Any,
    admin_id: UUID | None,
    *,
    dry_run: bool,
    replace: bool = False,
) -> dict[str, int]:
    mapper = OwnerMapper(admin_id) if admin_id else None
    counts: dict[str, int] = {}
    source_uri = f"file:{source.resolve(strict=True).as_posix()}?mode=ro"
    with sqlite3.connect(source_uri, uri=True) as sqlite_connection:
        existing = {
            row[0]
            for row in sqlite_connection.execute(
                "select name from sqlite_master where type='table'"
            )
        }
        prepared: dict[str, list[dict[str, Any]]] = {}
        for table in TABLE_ORDER:
            rows = _rows(sqlite_connection, table) if table in existing else []
            prepared[table] = [transform_row(table, row, mapper) for row in rows]
            counts[table] = len(rows)

    if dry_run:
        return counts

    if replace:
        for table in reversed(TABLE_ORDER):
            destination.execute(f'delete from public."{table}"')

    for table in TABLE_ORDER:
        rows = prepared[table]
        if not rows:
            continue
        columns = list(rows[0])
        column_sql = ", ".join(f'"{column}"' for column in columns)
        placeholders = ", ".join(["%s"] * len(columns))
        statement = f'insert into public."{table}" ({column_sql}) values ({placeholders})'
        for row in rows:
            destination.execute(statement, [row[column] for column in columns])
    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Migrate a verified SQLite snapshot")
    parser.add_argument("snapshot", type=Path)
    parser.add_argument("--admin-id", type=UUID, required=True)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--replace", action="store_true")
    parser.add_argument("--confirm-project-ref")
    args = parser.parse_args()
    project_ref = os.environ.get("SUPABASE_PROJECT_REF", "")
    validate_replace(args.replace, args.confirm_project_ref, project_ref)
    if args.dry_run:
        counts = migrate_database(args.snapshot, None, args.admin_id, dry_run=True)
    else:
        database_url = os.environ.get("SUPABASE_DB_URL")
        if not database_url:
            raise SystemExit("SUPABASE_DB_URL is required")
        with psycopg.connect(database_url) as connection:
            counts = migrate_database(
                args.snapshot, connection, args.admin_id,
                dry_run=False, replace=args.replace,
            )
    print(counts)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
