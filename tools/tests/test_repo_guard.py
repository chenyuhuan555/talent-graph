from __future__ import annotations

import subprocess
from pathlib import Path

from tools.repo_guard import scan_paths, scan_repository, scan_text


def git(repo: Path, *args: str) -> None:
    subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=True,
    )


def test_rejects_sqlite_and_generated_deploy_paths() -> None:
    findings = scan_paths(
        [
            "backend/talent_graph.db",
            "deploy/persons.json",
            "frontend/app/page.tsx",
        ]
    )

    assert [(item.code, item.path) for item in findings] == [
        ("forbidden-path", "backend/talent_graph.db"),
        ("forbidden-path", "deploy/persons.json"),
    ]


def test_rejects_secret_values_but_allows_public_variable_names() -> None:
    synthetic_secret = "sb_" + "secret_" + "test_value"
    findings = scan_text(
        "config.txt",
        f"SUPABASE_SECRET_KEY={synthetic_secret}\n"
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=variable_reference_only\n",
    )

    assert [(item.code, item.path) for item in findings] == [
        ("secret-value", "config.txt")
    ]


def test_allows_migrations_and_synthetic_test_fixtures() -> None:
    assert (
        scan_paths(
            [
                "supabase/migrations/202607220001_core_schema.sql",
                "tools/tests/fixtures/empty.json",
            ]
        )
        == []
    )


def test_history_scan_finds_removed_forbidden_blob(tmp_path: Path) -> None:
    repo = tmp_path / "repo"
    repo.mkdir()
    git(repo, "init", "-b", "main")
    git(repo, "config", "user.name", "Repo Guard Test")
    git(repo, "config", "user.email", "repo-guard@example.invalid")
    forbidden = repo / "persons.json"
    forbidden.write_text('{"name":"sensitive fixture"}', encoding="utf-8")
    git(repo, "add", "persons.json")
    git(repo, "commit", "-m", "add forbidden fixture")
    forbidden.unlink()
    git(repo, "add", "-u")
    git(repo, "commit", "-m", "remove forbidden fixture")

    findings = scan_repository(repo, staged=False, artifact=None, history=True)

    assert any(
        item.code == "forbidden-path" and item.path.endswith("persons.json")
        for item in findings
    )
