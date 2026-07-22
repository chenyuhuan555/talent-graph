from __future__ import annotations

import argparse
import re
import subprocess
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Iterable


FORBIDDEN_ROOTS = {
    ".workbuddy",
    "backend",
    "data_pipeline",
    "deploy",
    "deploy_final",
    "deploy_lite",
    "deploy_test",
    "backups",
    "exports",
    "reports",
    "uploads",
}
FORBIDDEN_EXACT = {"docker-compose.yml", "FEATURES.md", "frontend/Dockerfile"}
FORBIDDEN_JSON_NAMES = {"persons.json", "details.json", "dashboard.json", "sync.json"}
SECRET_PATTERNS = (
    re.compile(r"sb_secret_[A-Za-z0-9_-]{8,}"),
    re.compile(r"postgres(?:ql)?://[^\s:/]+:[^\s/@]+@[^\s]+", re.IGNORECASE),
    re.compile(r"\bdemo123456\b"),
)


@dataclass(frozen=True)
class Finding:
    code: str
    path: str
    detail: str


def _normalized(path: str) -> str:
    return path.replace("\\", "/").removeprefix("./")


def _is_forbidden_path(path: str) -> bool:
    normalized = _normalized(path)
    pure = PurePosixPath(normalized)
    parts = pure.parts
    if not parts:
        return False
    if parts[0] in FORBIDDEN_ROOTS or normalized in FORBIDDEN_EXACT:
        return True
    if pure.name in FORBIDDEN_JSON_NAMES:
        return True
    lower_name = pure.name.lower()
    if lower_name.endswith((".db", ".sqlite", ".sqlite3")):
        return True
    if ".db-" in lower_name or ".sqlite-" in lower_name:
        return True
    if lower_name.startswith(".env") and lower_name != ".env.example":
        return True
    return False


def scan_paths(paths: Iterable[str]) -> list[Finding]:
    findings: list[Finding] = []
    for path in paths:
        normalized = _normalized(path)
        if _is_forbidden_path(normalized):
            findings.append(Finding("forbidden-path", normalized, "path is not public-safe"))
    return findings


def scan_text(path: str, text: str) -> list[Finding]:
    for pattern in SECRET_PATTERNS:
        if pattern.search(text):
            return [Finding("secret-value", _normalized(path), "credential-like value found")]
    return []


def _git(repo: Path, *args: str, text: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
        text=text,
    )


def tracked_paths(repo: Path, staged: bool) -> list[str]:
    args = ("diff", "--cached", "--name-only", "--diff-filter=ACMR") if staged else ("ls-files",)
    output = _git(repo, *args).stdout
    return [line for line in output.splitlines() if line]


def _scan_bytes(path: str, data: bytes) -> list[Finding]:
    if b"\0" in data[:8192]:
        return []
    return scan_text(path, data.decode("utf-8", errors="ignore"))


def _scan_working_paths(repo: Path, paths: Iterable[str]) -> list[Finding]:
    path_list = list(paths)
    findings = scan_paths(path_list)
    for relative in path_list:
        file_path = repo / relative
        if file_path.is_file():
            findings.extend(_scan_bytes(relative, file_path.read_bytes()))
    return findings


def _scan_history(repo: Path) -> list[Finding]:
    findings: list[Finding] = []
    seen: set[tuple[str, str]] = set()
    output = _git(repo, "rev-list", "--objects", "--all").stdout
    for line in output.splitlines():
        object_id, separator, path = line.partition(" ")
        if not separator or not path:
            continue
        key = (object_id, path)
        if key in seen:
            continue
        seen.add(key)
        if _git(repo, "cat-file", "-t", object_id).stdout.strip() != "blob":
            continue
        findings.extend(scan_paths([path]))
        data = _git(repo, "cat-file", "blob", object_id, text=False).stdout
        findings.extend(_scan_bytes(path, data))
    return findings


def scan_repository(
    repo: Path,
    staged: bool,
    artifact: Path | None,
    history: bool = False,
) -> list[Finding]:
    repo = repo.resolve()
    findings = _scan_history(repo) if history else _scan_working_paths(repo, tracked_paths(repo, staged))
    if artifact is not None:
        artifact_path = artifact if artifact.is_absolute() else repo / artifact
        if artifact_path.exists():
            relative_paths = [
                file.relative_to(repo).as_posix()
                for file in artifact_path.rglob("*")
                if file.is_file()
            ]
            findings.extend(_scan_working_paths(repo, relative_paths))
    return list(dict.fromkeys(findings))


def main() -> int:
    parser = argparse.ArgumentParser(description="Reject business data and credentials from public Git content.")
    parser.add_argument("--repo", type=Path, default=Path.cwd())
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--tracked", action="store_true")
    mode.add_argument("--staged", action="store_true")
    mode.add_argument("--history", action="store_true")
    parser.add_argument("--artifact", type=Path)
    args = parser.parse_args()

    findings = scan_repository(
        args.repo,
        staged=args.staged,
        artifact=args.artifact,
        history=args.history,
    )
    for finding in findings:
        print(f"{finding.code}: {finding.path}: {finding.detail}")
    if findings:
        print(f"Repository guard failed with {len(findings)} finding(s).")
        return 1
    print("Repository guard passed with 0 findings.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
