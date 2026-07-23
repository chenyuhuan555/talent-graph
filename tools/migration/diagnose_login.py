from __future__ import annotations

import getpass
import json
import os
import urllib.error
import urllib.request
from typing import Any

from tools.migration.bootstrap_admin import derive_internal_identity


def request_json(
    url: str,
    method: str,
    key: str,
    payload: dict[str, Any] | None = None,
    bearer: str | None = None,
) -> Any:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, method=method)
    request.add_header("apikey", key)
    request.add_header("Content-Type", "application/json")
    if bearer:
        request.add_header("Authorization", f"Bearer {bearer}")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            content = response.read()
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"supabase_request_failed:{error.code}") from error
    return json.loads(content) if content else {}


def main() -> int:
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    publishable_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")
    if not supabase_url or not publishable_key:
        raise SystemExit("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required")

    username = input("管理员用户名: ")
    password = getpass.getpass("密码: ")
    try:
        _, email = derive_internal_identity(username)
        session = request_json(
            f"{supabase_url}/auth/v1/token?grant_type=password",
            "POST",
            publishable_key,
            {"email": email, "password": password},
        )
        token = session.get("access_token")
        user_id = session.get("user", {}).get("id")
        if not token or not user_id:
            raise RuntimeError("auth_login_failed")
        profiles = request_json(
            f"{supabase_url}/rest/v1/profiles?id=eq.{user_id}&select=id,status,role",
            "GET",
            publishable_key,
            bearer=token,
        )
        if len(profiles) != 1 or profiles[0].get("status") != "active":
            raise RuntimeError("profile_access_failed")
        print(json.dumps({"status": "login_ready", "role": profiles[0].get("role")}))
        return 0
    finally:
        password = ""
        username = ""


if __name__ == "__main__":
    raise SystemExit(main())
