"""Admin batch translation of existing organization and paper names.

This tool translates the *existing* Supabase content that predates the name
translation feature. It never contacts DeepSeek directly and never writes
translations itself: it only reads which records still need a translation and
then calls the authenticated ``translate-content`` Edge Function, which holds the
DeepSeek key server-side and re-reads the authoritative source text.

Safety / behaviour (per the name-translation design):
  * Only schools/companies with ``name_zh is null`` and papers with
    ``title_zh is null`` are considered.
  * Records are processed in batches of at most 20.
  * Resumable: because a successful translation sets ``name_zh`` / ``title_zh``,
    a re-run naturally skips finished records; within a run a keyset cursor on
    ``id`` guarantees forward progress even when items fail.
  * A single item failure never aborts the batch or the run.
  * There is no default ``--replace`` and nothing is ever cleared/deleted.

Environment:
  SUPABASE_DB_URL         Postgres connection string (read-only usage here).
  SUPABASE_FUNCTIONS_URL  Base URL for Edge Functions, e.g.
                          https://<ref>.functions.supabase.co
                          (falls back to deriving from SUPABASE_URL).
  TALENT_ADMIN_JWT        An *admin* user access token (JWT). The Edge Function
                          requires an admin role for batch translation.
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Any, Callable, Iterable, Sequence

from tools.migration.bootstrap_admin import derive_internal_identity

MAX_BATCH = 20
TRANSLATABLE_ORG_TYPES = ("university", "company", "school", "college")

# Keyset-paginated queries. name_zh / title_zh being null is the "needs work"
# predicate; ordering by id lets us advance past items that failed this run.
ORG_QUERY = (
    "select id::text as id from public.organizations "
    "where name_zh is null and deleted_at is null "
    "and organization_type = any(%(types)s) and id > %(cursor)s "
    "order by id limit %(limit)s"
)
PAPER_QUERY = (
    "select id::text as id from public.papers "
    "where title_zh is null and id > %(cursor)s "
    "order by id limit %(limit)s"
)

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


# --------------------------------------------------------------------------- #
# Pure helpers (unit-tested without any network or database).
# --------------------------------------------------------------------------- #
def chunk(items: Sequence[Any], size: int = MAX_BATCH) -> list[list[Any]]:
    """Split a sequence into batches of at most ``size`` (>= 1)."""
    if size < 1:
        raise ValueError("size must be >= 1")
    return [list(items[i : i + size]) for i in range(0, len(items), size)]


def to_items(rows: Iterable[dict[str, Any]], content_type: str) -> list[dict[str, str]]:
    """Turn queried rows into translate-content request items."""
    return [{"content_type": content_type, "id": str(row["id"])} for row in rows]


@dataclass
class Tally:
    total: int = 0
    completed: int = 0
    failed: int = 0
    skipped: int = 0
    failures: list[str] = field(default_factory=list)

    def add(self, results: Iterable[dict[str, Any]]) -> None:
        for result in results:
            self.total += 1
            status = result.get("status")
            if status == "completed":
                self.completed += 1
            elif status == "skipped":
                self.skipped += 1
            else:
                self.failed += 1
                rid = result.get("id", "?")
                self.failures.append(f"{rid}:{result.get('error', 'translation_failed')}")

    def as_dict(self) -> dict[str, Any]:
        return {
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "skipped": self.skipped,
        }


def next_cursor(rows: Sequence[dict[str, Any]], previous: str) -> str:
    """Return the id to resume from after processing ``rows``.

    Advancing the cursor even when items fail is what prevents an infinite loop
    on records that DeepSeek could not translate.
    """
    if not rows:
        return previous
    return str(rows[-1]["id"])


# --------------------------------------------------------------------------- #
# I/O (kept thin so the orchestration logic above stays testable).
# --------------------------------------------------------------------------- #
def functions_base_url() -> str:
    base = os.environ.get("SUPABASE_FUNCTIONS_URL", "").strip()
    if base:
        return base.rstrip("/")
    supabase_url = os.environ.get("SUPABASE_URL", "").strip()
    if supabase_url and ".supabase.co" in supabase_url:
        # https://<ref>.supabase.co -> https://<ref>.functions.supabase.co
        return supabase_url.rstrip("/").replace(".supabase.co", ".functions.supabase.co")
    raise SystemExit("SUPABASE_FUNCTIONS_URL or SUPABASE_URL is required")


def _auth_request_json(url: str, headers: dict[str, str], payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, method="POST", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return dict(json.loads(response.read().decode("utf-8")))
    except (urllib.error.HTTPError, urllib.error.URLError, ValueError) as error:
        details = ""
        if isinstance(error, urllib.error.HTTPError):
            details = error.read().decode("utf-8", errors="replace")
        raise SystemExit(f"admin_login_failed:{details or error}") from error


def admin_jwt_from_credentials(
    supabase_url: str,
    publishable_key: str,
    username: str,
    password: str,
    *,
    request_json: Callable[[str, dict[str, str], dict[str, Any]], dict[str, Any]] = _auth_request_json,
) -> str:
    _, email = derive_internal_identity(username)
    response = request_json(
        f"{supabase_url.rstrip('/')}/auth/v1/token?grant_type=password",
        {"apikey": publishable_key, "Content-Type": "application/json"},
        {"email": email, "password": password},
    )
    token = str(response.get("access_token", "")).strip()
    if not token:
        raise SystemExit("admin_login_failed:access_token_missing")
    return token


def http_translate(url: str, jwt: str, items: list[dict[str, str]]) -> list[dict[str, Any]]:
    """POST a batch to the translate-content Edge Function and return its items.

    A transport-level failure is turned into a per-item 'failed' result so the
    caller can keep going instead of aborting the whole run.
    """
    payload = json.dumps({"items": items}).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=payload,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {jwt}",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            body = json.loads(response.read().decode("utf-8"))
            return list(body.get("items", []))
    except (urllib.error.URLError, TimeoutError, ValueError) as error:
        reason = getattr(error, "reason", None) or error.__class__.__name__
        return [
            {"id": item["id"], "content_type": item["content_type"],
             "status": "failed", "error": f"transport_error:{reason}"}
            for item in items
        ]


def _fetch(conn: Any, query: str, params: dict[str, Any]) -> list[dict[str, Any]]:
    return list(conn.execute(query, params).fetchall())


def run(
    conn: Any,
    translate: Callable[[list[dict[str, str]]], list[dict[str, Any]]],
    *,
    content_type: str,
    query: str,
    max_batch: int = MAX_BATCH,
    query_params: dict[str, Any] | None = None,
    sleep: Callable[[float], None] = time.sleep,
    log: Callable[[str], None] = print,
) -> Tally:
    """Translate all pending records of one content type. Resumable + fault
    tolerant: never aborts the run because of a single item / batch failure."""
    tally = Tally()
    cursor = ZERO_UUID
    while True:
        params = {"cursor": cursor, "limit": max_batch, **(query_params or {})}
        rows = _fetch(conn, query, params)
        if not rows:
            break
        cursor = next_cursor(rows, cursor)
        for batch in chunk(rows, max_batch):
            results = translate(to_items(batch, content_type))
            tally.add(results)
            log(
                f"[{content_type}] {tally.completed + tally.failed + tally.skipped}"
                f" 已处理 · 成功 {tally.completed} · 失败 {tally.failed} · 跳过 {tally.skipped}"
            )
            sleep(0.2)
    return tally


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch-translate existing organization and paper names")
    parser.add_argument(
        "--content-type",
        choices=("organization", "paper", "all"),
        default="all",
        help="Which content to translate (default: all).",
    )
    parser.add_argument("--max-batch", type=int, default=MAX_BATCH)
    parser.add_argument("--json-output", type=str, default="")
    parser.add_argument(
        "--prompt-admin",
        action="store_true",
        help="Prompt for admin username/password and obtain a short-lived access token without displaying or saving it.",
    )
    args = parser.parse_args()

    if args.max_batch < 1 or args.max_batch > MAX_BATCH:
        raise SystemExit(f"--max-batch must be between 1 and {MAX_BATCH}")

    database_url = os.environ.get("SUPABASE_DB_URL")
    if not database_url:
        raise SystemExit("SUPABASE_DB_URL is required")
    jwt = os.environ.get("TALENT_ADMIN_JWT", "").strip()
    if args.prompt_admin:
        supabase_url = os.environ.get("SUPABASE_URL", "").strip()
        publishable_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
        if not supabase_url or not publishable_key:
            raise SystemExit("--prompt-admin requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY")
        username = input("管理员用户名: ").strip()
        password = getpass.getpass("管理员密码（输入时不会显示）: ")
        try:
            jwt = admin_jwt_from_credentials(supabase_url, publishable_key, username, password)
        finally:
            password = ""
    if not jwt:
        raise SystemExit("TALENT_ADMIN_JWT (admin access token) is required, or use --prompt-admin")

    url = f"{functions_base_url()}/translate-content"

    # Imported lazily so the pure functions above can be tested without psycopg.
    import psycopg
    from psycopg.rows import dict_row

    def translate(items: list[dict[str, str]]) -> list[dict[str, Any]]:
        return http_translate(url, jwt, items)

    summary: dict[str, Any] = {}
    with psycopg.connect(database_url, row_factory=dict_row) as conn:
        if args.content_type in ("organization", "all"):
            summary["organization"] = run(
                conn, translate,
                content_type="organization", query=ORG_QUERY,
                max_batch=args.max_batch,
                query_params={"types": list(TRANSLATABLE_ORG_TYPES)},
            ).as_dict()
        if args.content_type in ("paper", "all"):
            summary["paper"] = run(
                conn, translate,
                content_type="paper", query=PAPER_QUERY,
                max_batch=args.max_batch,
            ).as_dict()

    payload = json.dumps(summary, ensure_ascii=False, indent=2)
    if args.json_output:
        with open(args.json_output, "w", encoding="utf-8") as handle:
            handle.write(payload + "\n")
    print(payload)
    has_failures = any(section.get("failed", 0) for section in summary.values())
    return 1 if has_failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
