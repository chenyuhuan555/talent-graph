"""应用配置。支持 SQLite（本地开发默认）与 PostgreSQL（生产 / Docker）。"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import List

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # 应用
    APP_NAME: str = "AI Talent Graph"
    APP_VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    DEBUG: bool = True

    # 数据库：默认 SQLite 本地开发；设置 DATABASE_URL 可切换 Postgres
    DATABASE_URL: str = "sqlite:///./talent_graph.db"

    # 鉴权
    SECRET_KEY: str = ""
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 天

    # CORS
    CORS_ORIGINS: List[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # Redis（可选，留空则不启用）
    REDIS_URL: str = ""

    # 文件上传
    UPLOAD_DIR: str = "uploads"

    # 演示账号
    DEMO_EMAIL: str = "demo@aitalent.com"
    DEMO_PASSWORD: str = ""

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


@lru_cache
def get_settings() -> "Settings":
    return Settings()


settings = get_settings()
