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


def test_password_reset_updates_only_the_matching_active_account(monkeypatch, capsys):
    from tools.migration import reset_admin_password

    calls = []

    def request(url, method, key, payload=None):
        calls.append((url, method, key, payload))
        if method == "GET":
            return [{"id": "admin-id", "status": "active"}]
        return {}

    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "test-secret")
    monkeypatch.setattr(reset_admin_password, "_request", request)
    monkeypatch.setattr("builtins.input", lambda prompt: "Admin")
    monkeypatch.setattr(reset_admin_password.getpass, "getpass", lambda prompt: "new-password-12")

    assert reset_admin_password.main() == 0
    assert calls[0][1] == "GET"
    assert calls[1] == (
        "https://project.supabase.co/auth/v1/admin/users/admin-id",
        "PUT",
        "test-secret",
        {"password": "new-password-12"},
    )
    assert '"status": "password_reset"' in capsys.readouterr().out


def test_password_reset_accepts_an_eight_character_password(monkeypatch):
    from tools.migration import reset_admin_password

    def request(url, method, key, payload=None):
        if method == "GET":
            return [{"id": "admin-id", "status": "active"}]
        return {}

    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "test-secret")
    monkeypatch.setattr(reset_admin_password, "_request", request)
    monkeypatch.setattr("builtins.input", lambda prompt: "Admin")
    monkeypatch.setattr(reset_admin_password.getpass, "getpass", lambda prompt: "passw0rd")

    assert reset_admin_password.main() == 0


def test_login_diagnosis_checks_the_same_auth_and_profile_steps_as_the_browser(monkeypatch, capsys):
    from tools.migration import diagnose_login

    calls = []

    def request(url, method, key, payload=None, bearer=None):
        calls.append((url, method, key, payload, bearer))
        if "auth/v1/token" in url:
            return {"access_token": "session-token", "user": {"id": "admin-id"}}
        if "dashboard_summary" in url:
            return {"persons": 12, "organizations": 3, "relationships": 8, "positions": 1}
        return [{"id": "admin-id", "status": "active", "role": "admin"}]

    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "test-publishable")
    monkeypatch.setattr(diagnose_login, "request_json", request)
    monkeypatch.setattr("builtins.input", lambda prompt: "Admin")
    monkeypatch.setattr(diagnose_login.getpass, "getpass", lambda prompt: "passw0rd")

    assert diagnose_login.main() == 0
    assert calls[0][0] == "https://project.supabase.co/auth/v1/token?grant_type=password"
    assert calls[0][3]["password"] == "passw0rd"
    assert calls[1][4] == "session-token"
    output = capsys.readouterr().out
    assert '"status": "login_ready"' in output
    assert '"persons": 12' in output


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
