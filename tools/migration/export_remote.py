from __future__ import annotations

import gzip
import hashlib
import json
import os
from datetime import date, datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import psycopg
from psycopg.rows import dict_row

from tools.migration.migrate import TABLE_ORDER


EXPORT_TABLES = tuple(TABLE_ORDER) + ("profiles",)


def _json_default(value: Any) -> str:
    if isinstance(value, (date, datetime, Decimal, UUID)):
        return str(value)
    raise TypeError(f"unsupported_json_type:{type(value).__name__}")


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def export_remote(connection: psycopg.Connection, output_root: Path) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    export_directory = output_root / f"remote-{stamp}-{uuid4().hex[:8]}"
    export_directory.mkdir(parents=True, exist_ok=False)
    manifest: dict[str, Any] = {"created_at": datetime.now(timezone.utc).isoformat(), "tables": {}}

    for table in EXPORT_TABLES:
        path = export_directory / f"{table}.jsonl.gz"
        count = 0
        with connection.cursor(name=f"export_{table}", row_factory=dict_row) as cursor:
            cursor.execute(f'select * from public."{table}" order by id')
            with gzip.open(path, "wt", encoding="utf-8", newline="\n") as stream:
                for row in cursor:
                    stream.write(json.dumps(row, ensure_ascii=False, sort_keys=True, default=_json_default))
                    stream.write("\n")
                    count += 1
        manifest["tables"][table] = {
            "count": count,
            "file": path.name,
            "sha256": _sha256(path),
        }

    manifest_path = export_directory / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n",
        encoding="utf-8",
    )
    return manifest_path


def main() -> int:
    database_url = os.environ.get("SUPABASE_DB_URL")
    if not database_url:
        raise SystemExit("SUPABASE_DB_URL is required")
    with psycopg.connect(database_url) as connection:
        manifest = export_remote(connection, Path("backups/remote"))
    print(json.dumps({"manifest": str(manifest)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
