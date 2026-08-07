import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CORE_SCHEMA = ROOT / "supabase" / "migrations" / "202607220001_core_schema.sql"
PRIVATE_STORAGE = ROOT / "supabase" / "migrations" / "202607220004_private_storage.sql"
SCHEMA_CONTRACT = ROOT / "supabase" / "tests" / "schema_contract.sql"
STORAGE_CONTRACT = ROOT / "supabase" / "tests" / "storage_contract.sql"

EXPECTED_TABLES = {
    "audit_logs",
    "contacts",
    "event_participants",
    "events",
    "experiences",
    "merge_tasks",
    "organizations",
    "outreach_records",
    "paper_authors",
    "papers",
    "person_external_ids",
    "person_position_matches",
    "person_tags",
    "persons",
    "positions",
    "project_contributors",
    "projects",
    "relationship_evidence",
    "relationships",
    "source_records",
    "tags",
}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8").lower()


def test_core_schema_declares_every_business_table():
    sql = read(CORE_SCHEMA)
    actual = set(re.findall(r"create table public\.([a-z_]+)", sql, re.I))
    assert actual == EXPECTED_TABLES | {"profiles"}
    assert "create table public.users" not in sql


def test_profile_and_legacy_owner_contracts_use_supabase_auth():
    sql = read(CORE_SCHEMA)
    assert "references auth.users(id) on delete cascade" in sql
    assert "username_hash text not null unique" in sql
    assert "check (username_hash ~ '^[0-9a-f]{64}$')" in sql
    assert "role in ('admin','leader','consultant','operator')" in sql
    assert "status in ('active','disabled')" in sql
    assert "references public.profiles(id)" in sql
    assert "references public.users(id)" not in sql


def test_schema_contract_is_transactional_and_checks_no_public_users():
    sql = read(SCHEMA_CONTRACT).strip()
    assert sql.startswith("begin;")
    assert sql.endswith("rollback;")
    assert "public.users" in sql
    assert "raise exception" in sql


def test_private_storage_is_disabled_for_browser_access():
    migration = read(PRIVATE_STORAGE)
    contract = read(STORAGE_CONTRACT).strip()
    assert "private-documents" in migration
    assert "20971520" in migration
    assert "application/pdf" in migration
    assert "application/vnd.openxmlformats-officedocument.wordprocessingml.document" in migration
    assert "create policy" not in migration
    assert contract.startswith("begin;")
    assert contract.endswith("rollback;")
