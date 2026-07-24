"""数据库会话与 Base 模型。"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy import Column, String, DateTime, Uuid
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=False,
)

# SQLite 启用外键约束
if settings.is_sqlite:

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, _):  # noqa: D401
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# 统一 Base，使用 UUID 主键
class Base(DeclarativeBase):
    pass


class UUIDPKMixin:
    """统一 UUID 主键 + created_at / updated_at / 软删除字段。"""

    id = Column(Uuid, primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class SoftDeleteMixin:
    deleted_at = Column(DateTime, nullable=True)
