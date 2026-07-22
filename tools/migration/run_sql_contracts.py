from __future__ import annotations

import os
from pathlib import Path

import psycopg


CONTRACT_NAMES = (
    "schema_contract.sql",
    "storage_contract.sql",
    "rls_contract.sql",
    "read_api_contract.sql",
)


def contract_paths(directory: Path) -> list[Path]:
    return [directory / name for name in CONTRACT_NAMES]


def validate_contract(path: Path) -> str:
    sql = path.read_text(encoding="utf-8").strip()
    if not sql.lower().startswith("begin;") or not sql.lower().endswith("rollback;"):
        raise ValueError(f"contract_requires_begin_and_rollback:{path.name}")
    return sql


def main() -> int:
    database_url = os.environ.get("SUPABASE_DB_URL")
    if not database_url:
        raise SystemExit("SUPABASE_DB_URL is required")
    paths = contract_paths(Path("supabase/tests"))
    with psycopg.connect(database_url, autocommit=True) as connection:
        for path in paths:
            connection.execute(validate_contract(path))
            print(f"passed: {path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
