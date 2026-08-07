from datetime import datetime, timezone
from uuid import UUID, uuid4

from tools.migration.transform import (
    LEGACY_CONSULTANT_ID,
    LEGACY_LEADER_ID,
    OwnerMapper,
    normalize_bool,
    normalize_json,
    normalize_timestamp,
    normalize_uuid,
    transform_row,
)


ADMIN_ID = "11111111-1111-4111-8111-111111111111"


def test_sqlite_values_transform_deterministically():
    value = uuid4()
    assert normalize_uuid(value.bytes) == value
    assert normalize_uuid(value.hex) == value
    assert normalize_uuid(str(value)) == value
    assert normalize_bool(0) is False
    assert normalize_bool(1) is True
    assert normalize_timestamp("2026-07-22 10:30:00") == datetime(
        2026, 7, 22, 10, 30, tzinfo=timezone.utc
    )
    assert normalize_json('{"b": 2, "a": 1}') == '{"a":1,"b":2}'


def test_legacy_owners_map_to_new_admin():
    mapper = OwnerMapper(admin_id=UUID(ADMIN_ID))
    assert mapper.person_owner(UUID(LEGACY_CONSULTANT_ID)) == UUID(ADMIN_ID)
    assert mapper.position_owner(UUID(LEGACY_LEADER_ID)) == UUID(ADMIN_ID)
    assert mapper.audit_user(UUID(LEGACY_LEADER_ID)) == UUID(ADMIN_ID)


def test_external_platform_identifiers_remain_text():
    row = transform_row(
        "source_records",
        {
            "id": "5020010b1ca7487296ebb63ab5026118",
            "external_record_id": "OA-001",
            "external_id": "openalex:W123",
            "arxiv_id": "2401.12345",
            "openalex_id": "W123",
        },
        None,
    )
    assert row["external_record_id"] == "OA-001"
    assert row["external_id"] == "openalex:W123"
    assert row["arxiv_id"] == "2401.12345"
    assert row["openalex_id"] == "W123"


def test_truncated_json_text_is_preserved_instead_of_blocking_migration():
    truncated = '{"title":"incomplete'
    row = transform_row(
        "source_records",
        {"id": "5020010b1ca7487296ebb63ab5026118", "raw_data": truncated},
        None,
    )
    assert row["raw_data"] == truncated
