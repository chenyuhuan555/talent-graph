from __future__ import annotations

import argparse
import hashlib
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4


def _table_counts(connection: sqlite3.Connection) -> dict[str, int]:
    tables = [
        row[0]
        for row in connection.execute(
            "select name from sqlite_master "
            "where type = 'table' and name not like 'sqlite_%' order by name"
        )
    ]
    return {
        table: connection.execute(f'select count(*) from "{table}"').fetchone()[0]
        for table in tables
    }


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def create_snapshot(source: Path, output_directory: Path) -> tuple[Path, Path]:
    source = source.resolve(strict=True)
    output_directory = output_directory.resolve()
    output_directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    snapshot = output_directory / f"talent-graph-{stamp}-{uuid4().hex[:8]}.sqlite3"
    manifest_path = snapshot.with_suffix(".manifest.json")
    if snapshot.exists() or manifest_path.exists():
        raise FileExistsError("snapshot_target_exists")

    source_uri = f"file:{source.as_posix()}?mode=ro"
    try:
        with sqlite3.connect(source_uri, uri=True) as source_connection:
            with sqlite3.connect(snapshot) as target_connection:
                source_connection.backup(target_connection)
        with sqlite3.connect(snapshot) as backup:
            integrity = backup.execute("pragma integrity_check").fetchone()[0]
            if integrity != "ok":
                raise RuntimeError(f"snapshot_integrity_failed:{integrity}")
            row_counts = _table_counts(backup)

        manifest = {
            "source_path": str(source),
            "snapshot_path": str(snapshot),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "byte_size": snapshot.stat().st_size,
            "sha256": _sha256(snapshot),
            "row_counts": row_counts,
        }
        with manifest_path.open("x", encoding="utf-8") as stream:
            json.dump(manifest, stream, ensure_ascii=False, sort_keys=True, indent=2)
            stream.write("\n")
    except Exception:
        snapshot.unlink(missing_ok=True)
        manifest_path.unlink(missing_ok=True)
        raise
    return snapshot, manifest_path


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a consistent SQLite backup")
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", type=Path, default=Path("backups"))
    args = parser.parse_args()
    snapshot, manifest = create_snapshot(args.source, args.output)
    print(json.dumps({"snapshot": str(snapshot), "manifest": str(manifest)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
