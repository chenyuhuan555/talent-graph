import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
MIGRATION = ROOT / "supabase" / "migrations" / "202607220003_read_api.sql"
CONTRACT = ROOT / "supabase" / "tests" / "read_api_contract.sql"

REQUIRED_FUNCTIONS = {
    "dashboard_summary",
    "discover_talent",
    "search_persons",
    "person_detail",
    "person_experiences",
    "person_papers",
    "person_projects",
    "person_relationships",
    "person_position_matches",
    "relationship_graph",
    "relationship_evidence_for",
    "organizations_search",
    "organization_people",
    "positions_search",
    "position_matches",
    "outreach_queue",
    "merge_task_list",
    "merge_people",
    "export_business_snapshot",
}


def read(path: Path) -> str:
    return path.read_text(encoding="utf-8").lower()


def function_names(sql: str) -> set[str]:
    return set(
        re.findall(r"create(?: or replace)? function public\.([a-z_]+)\(", sql, re.I)
    )


def test_required_bounded_api_is_declared():
    sql = read(MIGRATION)
    assert REQUIRED_FUNCTIONS <= function_names(sql)
    assert "update_person_if_current" in function_names(sql)
    assert "least(100, greatest(1, page_size))" in sql
    assert "least(50, greatest(1, max_nodes))" in sql


def test_privileged_functions_use_fixed_search_path_and_no_dynamic_sql():
    sql = read(MIGRATION)
    assert sql.count("security definer set search_path = ''") >= len(REQUIRED_FUNCTIONS)
    assert "execute format" not in sql
    assert "execute query" not in sql
    assert "public.is_active_member()" in sql
    assert "grant execute on function" in sql
    assert " from anon" in sql


def test_optimistic_update_has_allowlist_and_stable_conflict_error():
    sql = read(MIGRATION)
    block = sql.split("function public.update_person_if_current(", 1)[1]
    assert "expected_updated_at" in block
    assert "unknown_patch_key" in block
    assert "record_conflict" in block
    for key in (
        "chinese_name",
        "english_name",
        "current_position",
        "location",
        "primary_domain",
        "talent_level",
        "review_status",
        "outreach_status",
    ):
        assert f"'{key}'" in block


def test_merge_and_export_are_role_limited_and_audited():
    sql = read(MIGRATION)
    merge = sql.split("function public.merge_people(", 1)[1].split("$$;", 1)[0]
    export = sql.split("function public.export_business_snapshot(", 1)[1].split("$$;", 1)[0]
    assert "('admin', 'operator')" in merge
    assert "write_audit_log('merge'" in merge
    assert "for relationship_row in" in merge
    assert "update public.relationship_evidence" in merge
    assert "('admin', 'leader')" in export
    assert "write_audit_log('export'" in export


def test_missing_roles_fail_closed_in_privileged_functions():
    sql = read(MIGRATION)
    for function in (
        "merge_task_list",
        "update_person_if_current",
        "merge_people",
        "export_business_snapshot",
    ):
        block = sql.split(f"function public.{function}(", 1)[1].split("$$;", 1)[0]
        assert "coalesce(" in block


def test_read_api_contract_is_transactional_and_checks_limits():
    sql = read(CONTRACT).strip()
    assert sql.startswith("begin;")
    assert sql.endswith("rollback;")
    assert "record_conflict" in sql
    assert "max_nodes" in sql
    assert "page_size" in sql
    assert "raise exception" in sql
