import json
import sqlite3

from tools.migration.snapshot import create_snapshot


def test_snapshot_uses_backup_api_while_writer_is_open(tmp_path):
    source = tmp_path / "live.db"
    writer = sqlite3.connect(source)
    writer.execute("pragma journal_mode = wal")
    writer.execute("create table persons (id text primary key, name text)")
    writer.execute("insert into persons values ('p1', 'Alice')")
    writer.commit()

    snapshot, manifest_path = create_snapshot(source, tmp_path / "backups")

    with sqlite3.connect(snapshot) as backup:
      assert backup.execute("pragma integrity_check").fetchone()[0] == "ok"
      assert backup.execute("select count(*) from persons").fetchone()[0] == 1
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    assert manifest["source_path"] == str(source.resolve())
    assert manifest["row_counts"] == {"persons": 1}
    assert manifest["byte_size"] == snapshot.stat().st_size
    assert len(manifest["sha256"]) == 64
    writer.close()


def test_snapshot_never_overwrites_an_existing_file(tmp_path):
    source = tmp_path / "live.db"
    with sqlite3.connect(source) as connection:
        connection.execute("create table items (id integer)")

    first, _ = create_snapshot(source, tmp_path / "backups")
    second, _ = create_snapshot(source, tmp_path / "backups")

    assert first != second
    assert first.exists() and second.exists()
