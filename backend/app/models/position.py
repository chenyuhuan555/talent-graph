"""岗位与人岗匹配表。"""
from __future__ import annotations

from sqlalchemy import Column, String, Text, Uuid, ForeignKey, Numeric, Boolean

from app.core.database import Base, UUIDPKMixin, SoftDeleteMixin


class Position(Base, UUIDPKMixin, SoftDeleteMixin):
    __tablename__ = "positions"

    company_id = Column(Uuid, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    title = Column(String(255), nullable=False, index=True)
    industry = Column(String(64), default="人工智能")
    primary_domain = Column(String(64), index=True)
    secondary_domains = Column(Text)  # JSON 字符串
    level = Column(String(64))
    location = Column(String(128))
    salary_min = Column(Numeric(12, 2))
    salary_max = Column(Numeric(12, 2))
    responsibilities = Column(Text)
    requirements = Column(Text)
    preferred_conditions = Column(Text)
    target_companies = Column(Text)  # JSON 字符串
    target_schools = Column(Text)  # JSON 字符串
    exclusion_conditions = Column(Text)
    status = Column(String(32), default="open", index=True)  # open/paused/closed
    owner_user_id = Column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class PersonPositionMatch(Base, UUIDPKMixin):
    __tablename__ = "person_position_matches"
    __table_args__ = (
        # 注意：不设唯一约束，允许重新生成匹配
    )

    person_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    position_id = Column(Uuid, ForeignKey("positions.id", ondelete="CASCADE"), nullable=False, index=True)
    match_score = Column(Numeric(5, 2), default=0)
    match_reasons = Column(Text)  # JSON 字符串
    risks = Column(Text)  # JSON 字符串
    questions_to_confirm = Column(Text)  # JSON 字符串
    ai_generated = Column(Boolean, default=True)
    consultant_rating = Column(String(16))  # good/neutral/bad
