from unittest.mock import Mock
from pathlib import Path

import pytest

from tools.migration.bootstrap_admin import build_parser, derive_internal_identity
from tools.migration.export_remote import EXPORT_TABLES
from tools.migration.migrate import TABLE_ORDER, migrate_database, validate_replace
from tools.migration.run_sql_contracts import contract_paths, validate_contract


def test_table_order_excludes_identity_tables_and_delete_order_is_reversed():
    assert len(TABLE_ORDER) == 21
    assert "profiles" not in TABLE_ORDER
    assert "users" not in TABLE_ORDER
    assert list(reversed(TABLE_ORDER))[0] == "audit_logs"


def test_replace_requires_exact_project_confirmation():
    with pytest.raises(ValueError, match="project_confirmation_required"):
        validate_replace(True, "wrong-ref", "expected-ref")
    validate_replace(True, "expected-ref", "expected-ref")
    validate_replace(False, None, "expected-ref")


def test_dry_run_transforms_without_writing(tmp_path):
    source = tmp_path / "fixture.db"
    import sqlite3

    with sqlite3.connect(source) as connection:
        connection.execute("create table organizations (id text primary key, name text)")
        connection.execute(
            "insert into organizations values (?, ?)",
            ("11111111111141118111111111111111", "Fixture"),
        )
    destination = Mock()

    counts = migrate_database(source, destination, admin_id=None, dry_run=True)

    assert counts["organizations"] == 1
    destination.execute.assert_not_called()


def test_bootstrap_never_accepts_password_arguments():
    destinations = {action.dest for action in build_parser()._actions}
    assert "password" not in destinations
    username_hash, email = derive_internal_identity(" ＡＤＭＩＮ ")
    assert len(username_hash) == 64
    assert email == f"{username_hash}@talent-graph.invalid"


def test_remote_export_excludes_auth_and_password_material():
    assert set(EXPORT_TABLES) == set(TABLE_ORDER) | {"profiles"}
    assert "users" not in EXPORT_TABLES
    assert all("password" not in table for table in EXPORT_TABLES)


def test_sql_contract_runner_requires_transactional_rollback(tmp_path):
    paths = contract_paths(Path("supabase/tests"))
    assert [path.name for path in paths] == [
        "schema_contract.sql",
        "storage_contract.sql",
        "rls_contract.sql",
        "read_api_contract.sql",
    ]
    invalid = tmp_path / "invalid.sql"
    invalid.write_text("begin; select 1; commit;", encoding="utf-8")
    with pytest.raises(ValueError, match="rollback"):
        validate_contract(invalid)


def test_role_verification_always_has_cleanup_block():
    source = Path("tools/migration/verify_roles.py").read_text(encoding="utf-8")
    assert "finally:" in source
    assert "deleteUser" in source or "delete_user" in source
    assert "status.*disabled" not in source
