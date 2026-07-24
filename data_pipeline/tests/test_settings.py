from __future__ import annotations

from config.settings import normalize_database_url


def test_normalize_database_url_uses_psycopg_for_supabase_pooler():
    assert normalize_database_url(
        "postgresql://postgres.project:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"
    ) == "postgresql+psycopg://postgres.project:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"


def test_normalize_database_url_preserves_explicit_driver_and_sqlite():
    explicit = "postgresql+psycopg://user:password@host:5432/postgres"
    assert normalize_database_url(explicit) == explicit
    assert normalize_database_url("sqlite:///local.db") == "sqlite:///local.db"
