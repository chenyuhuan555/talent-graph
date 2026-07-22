import hashlib
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BROWSER_IDENTITY = ROOT / "frontend" / "lib" / "auth" / "identity.ts"
EDGE_IDENTITY = ROOT / "supabase" / "functions" / "_shared" / "username.ts"
MANAGE_MEMBER = ROOT / "supabase" / "functions" / "manage-member" / "index.ts"

VECTORS = [
    (" Alice ", "alice"),
    ("ＡＤＭＩＮ", "admin"),
    ("顾问01", "顾问01"),
]


def expected_email(normalized: str) -> str:
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"{digest}@talent-graph.invalid"


def run_typescript_vectors(module: Path) -> list[dict[str, str]]:
    script = f"""
      const identity = await import({json.dumps(module.as_uri())});
      const vectors = {json.dumps([item[0] for item in VECTORS], ensure_ascii=False)};
      const result = [];
      for (const input of vectors) {{
        result.push({{
          normalized: identity.normalizeUsername(input),
          email: await identity.usernameToInternalEmail(input),
        }});
      }}
      console.log(JSON.stringify(result));
    """
    completed = subprocess.run(
        ["node", "--input-type=module", "--eval", script],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    return json.loads(completed.stdout)


def test_browser_and_edge_identity_vectors_match_python():
    expected = [
        {"normalized": normalized, "email": expected_email(normalized)}
        for _, normalized in VECTORS
    ]
    assert run_typescript_vectors(BROWSER_IDENTITY) == expected
    assert run_typescript_vectors(EDGE_IDENTITY) == expected


def test_member_management_fails_closed_and_keeps_identity_private():
    source = MANAGE_MEMBER.read_text(encoding="utf-8")
    lowered = source.lower()
    for action in ("create", "disable", "set_role"):
        assert f"'{action}'" in source
    assert "auth.getUser" in source
    assert ".from('profiles')" in source
    assert "role !== 'admin'" in source
    assert "status !== 'active'" in source
    assert "auth.admin.createUser" in source
    assert "email_confirm: true" in source
    assert "ALLOWED_ORIGINS" in source
    assert "http://localhost:3000" in source
    assert "Access-Control-Allow-Methods" in source
    assert "POST, OPTIONS" in source
    assert "console.log" not in lowered
    assert "console.error" not in lowered
    response_arguments = re.findall(r"return jsonResponse\((.*?)\);", source, re.S)
    assert response_arguments
    assert all("internalEmail" not in argument for argument in response_arguments)
    assert "member: { ...profile" not in source
    assert "targetProfile" in source
    assert "auditError" in source
    assert "await adminClient.from('profiles').delete()" in source
