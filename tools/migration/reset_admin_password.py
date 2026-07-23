from __future__ import annotations

import getpass
import json
import os

from tools.migration.bootstrap_admin import _request, derive_internal_identity


def main() -> int:
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    secret_key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY", ""
    )
    if not supabase_url or not secret_key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SECRET_KEY are required")

    username = input("管理员用户名: ")
    password = getpass.getpass("新密码（至少 12 位）: ")
    confirmation = getpass.getpass("再次输入新密码: ")
    try:
        if password != confirmation:
            raise ValueError("password_confirmation_mismatch")
        if len(password) < 12 or len(password) > 128:
            raise ValueError("password_length_invalid")
        username_hash, _ = derive_internal_identity(username)
        profiles = _request(
            f"{supabase_url}/rest/v1/profiles?username_hash=eq.{username_hash}&select=id,status",
            "GET",
            secret_key,
        )
        if len(profiles) != 1 or profiles[0].get("status") != "active":
            raise RuntimeError("active_admin_not_found")
        admin_id = profiles[0]["id"]
        _request(
            f"{supabase_url}/auth/v1/admin/users/{admin_id}",
            "PUT",
            secret_key,
            {"password": password},
        )
        print(json.dumps({"admin_id": admin_id, "status": "password_reset"}))
        return 0
    finally:
        password = ""
        confirmation = ""
        username = ""


if __name__ == "__main__":
    raise SystemExit(main())
