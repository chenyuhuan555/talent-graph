"""项目与项目贡献者表。"""
from __future__ import annotations

from datetime import date

from sqlalchemy import Column, String, Text, Date, Integer, BigInteger, Uuid, ForeignKey, Numeric

from app.core.database import Base, UUIDPKMixin


class Project(Base, UUIDPKMixin):
    __tablename__ = "projects"

    name = Column(String(255), nullable=False, index=True)
    project_type = Column(String(32))  # github/huggingface/industry
    organization_id = Column(Uuid, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    url = Column(Text)
    description = Column(Text)
    domains = Column(Text)  # JSON 字符串
    stars_count = Column(Integer, default=0)
    downloads_count = Column(BigInteger, default=0)
    start_date = Column(Date)
    last_active_at = Column(Text)  # timestamp 字符串


class ProjectContributor(Base, UUIDPKMixin):
    __tablename__ = "project_contributors"

    project_id = Column(Uuid, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(64))  # maintainer/contributor
    contribution_score = Column(Numeric(7, 2), default=0)
    start_date = Column(Date)
    end_date = Column(Date)
    source_url = Column(Text)
