"""人才主表与外部 ID 表。"""
from __future__ import annotations

from sqlalchemy import Column, String, Text, Uuid, ForeignKey, Numeric, Boolean, UniqueConstraint

from app.core.database import Base, UUIDPKMixin, SoftDeleteMixin


class Person(Base, UUIDPKMixin, SoftDeleteMixin):
    __tablename__ = "persons"

    chinese_name = Column(String(128), index=True)
    english_name = Column(String(128), index=True)
    aliases = Column(Text)  # JSON 字符串：其他姓名写法
    avatar_url = Column(Text)
    current_organization_id = Column(Uuid, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    current_position = Column(String(255))
    location = Column(String(128))
    country = Column(String(64))
    industry = Column(String(64), default="人工智能")
    primary_domain = Column(String(64), index=True)  # 大模型/多模态/AI Infra
    secondary_domains = Column(Text)  # JSON 字符串
    talent_level = Column(String(32))  # S/A/B/C
    summary = Column(Text)  # AI 生成的人才摘要（JSON）
    summary_raw = Column(Text)  # 原始摘要文本
    source_type = Column(String(64))
    owner_user_id = Column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    review_status = Column(String(32), default="pending", index=True)  # pending/approved/rejected
    outreach_status = Column(String(64), default="未触达", index=True)
    data_completeness = Column(Numeric(5, 2), default=0)
    is_do_not_contact = Column(Boolean, default=False)


class PersonExternalId(Base, UUIDPKMixin):
    __tablename__ = "person_external_ids"
    __table_args__ = (UniqueConstraint("platform", "external_id", name="uq_platform_external_id"),)

    person_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    platform = Column(String(64), nullable=False)  # openalex/orcid/github/dblp/semantic_scholar
    external_id = Column(String(255), nullable=False)
    profile_url = Column(Text)
    confidence = Column(Numeric(5, 2), default=1.0)
    verified = Column(Boolean, default=False)
