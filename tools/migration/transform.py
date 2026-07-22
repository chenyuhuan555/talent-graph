from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from unicodedata import normalize
from uuid import UUID


LEGACY_ADMIN_ID = "77d7a034-9e7f-4769-a5d6-5bf5c647ec2a"
LEGACY_CONSULTANT_ID = "c2467ee4-83f4-43ee-947f-357e47293edf"
LEGACY_DEMO_ID = "24871dc1-71d4-43cc-9447-6227748d3c2b"
LEGACY_LEADER_ID = "bc227f69-3a8c-4645-9c52-35c62aa71ba8"
LEGACY_OPERATOR_ID = "d82621f5-8c32-4e3e-bf58-1f0acc7f2b37"
LEGACY_USER_IDS = {
    UUID(value)
    for value in (
        LEGACY_ADMIN_ID,
        LEGACY_CONSULTANT_ID,
        LEGACY_DEMO_ID,
        LEGACY_LEADER_ID,
        LEGACY_OPERATOR_ID,
    )
}

BOOLEAN_COLUMNS = {
    "ai_generated", "can_introduce", "is_current", "is_do_not_contact",
    "is_inferred", "is_public", "is_valid", "is_verified", "verified",
    "willing_to_refer",
}
JSON_TEXT_COLUMNS = {
    "after_data", "aliases", "before_data", "conflict_fields", "domains",
    "exclusion_conditions", "matching_evidence", "match_reasons",
    "questions_to_confirm", "raw_data", "risks", "secondary_domains",
    "summary", "target_companies", "target_schools",
}
USER_REFERENCE_COLUMNS = {
    "created_by", "owner_user_id", "reviewed_by", "user_id",
}
TEXT_IDENTIFIER_COLUMNS = {
    "arxiv_id", "external_id", "external_record_id", "openalex_id",
}


def normalize_uuid(value: Any) -> UUID | None:
    if value is None or value == "":
        return None
    if isinstance(value, UUID):
        return value
    if isinstance(value, bytes):
        return UUID(bytes=value)
    return UUID(str(value))


def normalize_bool(value: Any) -> bool | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return value
    if value in (0, "0", "false", "False"):
        return False
    if value in (1, "1", "true", "True"):
        return True
    raise ValueError(f"invalid_boolean:{value!r}")


def normalize_timestamp(value: Any) -> datetime | None:
    if value is None or value == "":
        return None
    if isinstance(value, datetime):
        parsed = value
    else:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def normalize_json(value: Any) -> str | None:
    if value is None or value == "":
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return value
    else:
        parsed = value
    return json.dumps(parsed, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


@dataclass(frozen=True)
class OwnerMapper:
    admin_id: UUID

    def _map(self, value: UUID | None) -> UUID | None:
        if value is None:
            return None
        return self.admin_id if value in LEGACY_USER_IDS else value

    def person_owner(self, value: UUID | None) -> UUID | None:
        return self._map(value)

    def position_owner(self, value: UUID | None) -> UUID | None:
        return self._map(value)

    def audit_user(self, value: UUID | None) -> UUID | None:
        return self._map(value)


def transform_row(
    table: str,
    row: dict[str, Any],
    owner_mapper: OwnerMapper | None,
) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for column, value in row.items():
        if column == "is_corresponding":
            result[column] = None if value is None else str(value).lower()
        elif column in BOOLEAN_COLUMNS:
            result[column] = normalize_bool(value)
        elif column == "id" or (
            column.endswith("_id") and column not in TEXT_IDENTIFIER_COLUMNS
        ):
            converted = normalize_uuid(value)
            if column in USER_REFERENCE_COLUMNS and owner_mapper:
                converted = owner_mapper._map(converted)
            result[column] = converted
        elif column.endswith("_at") or column in {"created_at", "updated_at", "deleted_at"}:
            result[column] = normalize_timestamp(value)
        elif column in JSON_TEXT_COLUMNS and value not in (None, ""):
            result[column] = normalize_json(value)
        else:
            result[column] = value
    return result


def normalize_username(value: str) -> str:
    return normalize("NFKC", value).strip().lower()
