from __future__ import annotations

import argparse
import getpass
import hashlib
import json
import os
import unicodedata
import urllib.error
import urllib.request
from typing import Any


def build_parser() -> argparse.ArgumentParser:
    return argparse.ArgumentParser(description="Interactively create the first administrator")


def derive_internal_identity(username: str) -> tuple[str, str]:
    normalized = unicodedata.normalize("NFKC", username).strip().lower()
    if not normalized:
        raise ValueError("username_required")
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return digest, f"{digest}@talent-graph.invalid"


def _request(
    url: str,
    method: str,
    key: str,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(url, data=body, method=method)
    request.add_header("apikey", key)
    if not key.startswith("sb_"):
        request.add_header("Authorization", f"Bearer {key}")
    request.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            content = response.read()
    except urllib.error.HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")[:512]
        raise RuntimeError(f"supabase_request_failed:{error.code}:{details}") from error
    return json.loads(content) if content else {}


def main() -> int:
    build_parser().parse_args()
    supabase_url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    secret_key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get(
        "SUPABASE_SERVICE_ROLE_KEY", ""
    )
    if not supabase_url or not secret_key:
        raise SystemExit("SUPABASE_URL and SUPABASE_SECRET_KEY are required")

    username = input("管理员用户名: ")
    display_name = input("管理员姓名: ").strip()
    department = input("部门（可留空）: ").strip() or None
    password = getpass.getpass("新密码（至少 12 位）: ")
    confirmation = getpass.getpass("再次输入新密码: ")
    user_id: str | None = None
    try:
        if password != confirmation:
            raise ValueError("password_confirmation_mismatch")
        if len(password) < 12 or len(password) > 128:
            raise ValueError("password_length_invalid")
        if not display_name or len(display_name) > 128:
            raise ValueError("display_name_invalid")
        username_hash, internal_email = derive_internal_identity(username)
        created = _request(
            f"{supabase_url}/auth/v1/admin/users",
            "POST",
            secret_key,
            {"email": internal_email, "password": password, "email_confirm": True},
        )
        user_id = created.get("id")
        if not user_id:
            raise RuntimeError("auth_user_creation_failed")
        try:
            _request(
                f"{supabase_url}/rest/v1/profiles",
                "POST",
                secret_key,
                {
                    "id": user_id,
                    "username_hash": username_hash,
                    "display_name": display_name,
                    "department": department,
                    "role": "admin",
                    "status": "active",
                },
            )
        except Exception:
            _request(f"{supabase_url}/auth/v1/admin/users/{user_id}", "DELETE", secret_key)
            raise
        print(json.dumps({"admin_id": user_id, "status": "created"}))
        return 0
    finally:
        password = ""
        confirmation = ""
        username = ""


if __name__ == "__main__":
    raise SystemExit(main())
