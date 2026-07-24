from __future__ import annotations

from typing import Any

from tools.migration.translate_existing import (
    Tally,
    admin_jwt_from_credentials,
    chunk,
    next_cursor,
    run,
    to_items,
)
from tools.migration.bootstrap_admin import derive_internal_identity


def test_admin_jwt_from_credentials_uses_internal_email_and_publishable_key():
    calls = []

    def request_json(url, headers, payload):
        calls.append((url, headers, payload))
        return {"access_token": "jwt-token"}

    assert admin_jwt_from_credentials(
        "https://project.supabase.co",
        "publishable-key",
        "yuhuanchen",
        "password",
        request_json=request_json,
    ) == "jwt-token"
    _, email = derive_internal_identity("yuhuanchen")
    assert calls == [(
        "https://project.supabase.co/auth/v1/token?grant_type=password",
        {"apikey": "publishable-key", "Content-Type": "application/json"},
        {"email": email, "password": "password"},
    )]


class FakeCursor:
    def __init__(self, rows: list[dict[str, Any]]):
        self._rows = rows

    def fetchall(self) -> list[dict[str, Any]]:
        return self._rows


class FakeConn:
    """Returns queued result pages and records the params of each query."""

    def __init__(self, pages: list[list[dict[str, Any]]]):
        self._pages = list(pages)
        self.calls: list[dict[str, Any]] = []

    def execute(self, _query: str, params: dict[str, Any]) -> FakeCursor:
        self.calls.append(dict(params))
        page = self._pages.pop(0) if self._pages else []
        return FakeCursor(page)


def test_chunk_never_exceeds_max_batch():
    items = list(range(25))
    batches = chunk(items, 20)
    assert [len(b) for b in batches] == [20, 5]
    assert all(len(b) <= 20 for b in batches)


def test_to_items_tags_content_type():
    rows = [{"id": "a"}, {"id": "b"}]
    assert to_items(rows, "organization") == [
        {"content_type": "organization", "id": "a"},
        {"content_type": "organization", "id": "b"},
    ]


def test_tally_counts_each_status():
    tally = Tally()
    tally.add([
        {"id": "a", "status": "completed"},
        {"id": "b", "status": "failed", "error": "timeout"},
        {"id": "c", "status": "skipped"},
    ])
    assert tally.as_dict() == {"total": 3, "completed": 1, "failed": 1, "skipped": 1}
    assert tally.failures == ["b:timeout"]


def test_next_cursor_advances_to_last_row_and_holds_on_empty():
    assert next_cursor([{"id": "a"}, {"id": "b"}], "zero") == "b"
    assert next_cursor([], "keep") == "keep"


def test_run_processes_all_pages_and_advances_keyset_cursor():
    conn = FakeConn([[{"id": "a"}, {"id": "b"}], [{"id": "c"}], []])
    seen: list[list[str]] = []

    def translate(items: list[dict[str, str]]) -> list[dict[str, Any]]:
        seen.append([i["id"] for i in items])
        return [{"id": i["id"], "content_type": i["content_type"], "status": "completed"} for i in items]

    tally = run(
        conn, translate,
        content_type="organization", query="Q",
        sleep=lambda _: None, log=lambda _: None,
    )

    assert tally.as_dict() == {"total": 3, "completed": 3, "failed": 0, "skipped": 0}
    assert seen == [["a", "b"], ["c"]]
    # Keyset cursor advances so failed items never cause an infinite loop.
    assert conn.calls[0]["cursor"] != conn.calls[1]["cursor"]
    assert conn.calls[1]["cursor"] == "b"


def test_run_continues_after_a_single_item_failure():
    conn = FakeConn([[{"id": "a"}, {"id": "b"}], []])

    def translate(items: list[dict[str, str]]) -> list[dict[str, Any]]:
        return [
            {"id": items[0]["id"], "content_type": items[0]["content_type"], "status": "failed", "error": "timeout"},
            {"id": items[1]["id"], "content_type": items[1]["content_type"], "status": "completed"},
        ]

    tally = run(
        conn, translate,
        content_type="paper", query="Q",
        sleep=lambda _: None, log=lambda _: None,
    )
    assert tally.completed == 1
    assert tally.failed == 1
    assert tally.total == 2
