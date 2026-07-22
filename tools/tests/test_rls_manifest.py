import re
from pathlib import Path

from test_schema_manifest import EXPECTED_TABLES


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "202607220002_auth_rls.sql"
CONTRACT = ROOT / "supabase" / "tests" / "rls_contract.sql"

REQUIRED_HELPERS = {
    "is_active_member",
    "current_app_role",
    "is_admin",
    "can_view_full_contact",
    "masked_contacts_for_person",
    "write_audit_log",
}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8").lower()


def test_every_exposed_table_enables_rls():
    sql = read(MIGRATION)
    enabled = set(
        re.findall(
            r"alter table public\.([a-z_]+) enable row level security", sql, re.I
        )
    )
    assert enabled == EXPECTED_TABLES | {"profiles"}


def test_security_helpers_are_fixed_and_do_not_trust_jwt_roles():
    sql = read(MIGRATION)
    functions = set(
        re.findall(r"create(?: or replace)? function public\.([a-z_]+)\(", sql, re.I)
    )
    assert REQUIRED_HELPERS <= functions
    for helper in REQUIRED_HELPERS:
        block = sql.split(f"function public.{helper}(", 1)[1].split(";", 1)[0]
        assert "security definer" in block
        assert "set search_path = ''" in block
    assert "auth.uid()" in sql
    assert "raw_app_meta_data" not in sql
    assert "user_metadata" not in sql


def test_anonymous_and_raw_contact_access_are_revoked():
    sql = read(MIGRATION)
    assert "revoke all on all tables in schema public from anon" in sql
    assert "revoke all on all functions in schema public from anon" in sql
    assert "grant select on public.contacts" not in sql
    assert "contact_value_encrypted" in sql
    assert "grant execute on function public.masked_contacts_for_person(uuid)" in sql


def test_role_policies_and_sensitive_audit_actions_are_declared():
    sql = read(MIGRATION)
    for role in ("admin", "leader", "consultant", "operator"):
        assert f"'{role}'" in sql
    for action in (
        "view_full_contact",
        "member_change",
        "merge",
        "export",
        "destructive_action",
        "migration",
        "restore",
    ):
        assert f"'{action}'" in sql
    assert "insert into public.audit_logs" in sql
    assert "actor_id" not in sql


def test_rls_contract_is_transactional_and_covers_denials():
    sql = read(CONTRACT).strip()
    assert sql.startswith("begin;")
    assert sql.endswith("rollback;")
    assert "operator" in sql
    assert "disabled" in sql
    assert "raw-contact-sentinel" in sql
    assert "raise exception" in sql
