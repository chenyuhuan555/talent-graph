"""用户表。"""
from __future__ import annotations

from sqlalchemy import Column, String

from app.core.database import Base, UUIDPKMixin


class User(Base, UUIDPKMixin):
    __tablename__ = "users"

    name = Column(String(128), nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(32), nullable=False, default="consultant")  # admin/leader/consultant/operator
    department = Column(String(128))
    status = Column(String(32), nullable=False, default="active")  # active/disabled
