from __future__ import annotations

import hashlib
import json
import os
import secrets
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


@dataclass
class Credentials:
    url: str
    publishable_key: str
    secret_key: str


def request_json(
    url: str,
    method: str,
    api_key: str,
    payload: dict[str, Any] | None = None,
    token: str | None = None,
    *,
    expected_failure: bool = False,
) -> dict[str, Any]:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=data, method=method)
    request.add_header("apikey", api_key)
    request.add_header("Authorization", f"Bearer {token or api_key}")
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read()
    except urllib.error.HTTPError as error:
        error.read()
        if expected_failure:
            return {"denied": True, "status": error.code}
        raise RuntimeError("supabase_request_failed") from error
    if expected_failure:
        raise AssertionError("disabled_role_retained_access")
    return json.loads(body) if body else {}


def create_user(credentials: Credentials, role: str) -> tuple[str, str, str]:
    seed = secrets.token_hex(16)
    username_hash = hashlib.sha256(f"role-check-{role}-{seed}".encode()).hexdigest()
    email = f"{username_hash}@talent-graph.invalid"
    password = f"Tg!{secrets.token_urlsafe(24)}"
    user = request_json(
        f"{credentials.url}/auth/v1/admin/users", "POST", credentials.secret_key,
        {"email": email, "password": password, "email_confirm": True},
    )
    user_id = user["id"]
    request_json(
        f"{credentials.url}/rest/v1/profiles", "POST", credentials.secret_key,
        {
            "id": user_id, "username_hash": username_hash,
            "display_name": f"Temporary {role}", "role": role, "status": "active",
        },
    )
    return user_id, email, password


def delete_user(credentials: Credentials, user_id: str) -> None:
    query = urllib.parse.urlencode({"id": f"eq.{user_id}"})
    request_json(f"{credentials.url}/rest/v1/profiles?{query}", "DELETE", credentials.secret_key)
    request_json(
        f"{credentials.url}/auth/v1/admin/users/{user_id}", "DELETE", credentials.secret_key
    )


def main() -> int:
    credentials = Credentials(
        url=os.environ.get("SUPABASE_URL", "").rstrip("/"),
        publishable_key=os.environ.get("SUPABASE_PUBLISHABLE_KEY", ""),
        secret_key=os.environ.get("SUPABASE_SECRET_KEY", ""),
    )
    if not all((credentials.url, credentials.publishable_key, credentials.secret_key)):
        raise SystemExit("Supabase role verification environment is incomplete")

    created_ids: list[str] = []
    try:
        for role in ("leader", "consultant", "operator"):
            user_id, email, password = create_user(credentials, role)
            created_ids.append(user_id)
            session = request_json(
                f"{credentials.url}/auth/v1/token?grant_type=password", "POST",
                credentials.publishable_key, {"email": email, "password": password},
            )
            access_token = session["access_token"]
            request_json(
                f"{credentials.url}/rest/v1/rpc/dashboard_summary", "POST",
                credentials.publishable_key, {}, access_token,
            )
            query = urllib.parse.urlencode({"id": f"eq.{user_id}"})
            request_json(
                f"{credentials.url}/rest/v1/profiles?{query}", "PATCH",
                credentials.secret_key, {"status": "disabled"},
            )
            request_json(
                f"{credentials.url}/rest/v1/rpc/dashboard_summary", "POST",
                credentials.publishable_key, {}, access_token, expected_failure=True,
            )
        print(json.dumps({"roles_verified": 3, "disabled_access_denied": True}))
        return 0
    finally:
        for user_id in reversed(created_ids):
            try:
                delete_user(credentials, user_id)
            except Exception:
                pass


if __name__ == "__main__":
    raise SystemExit(main())
