"""人才关系表与关系证据表。"""
from __future__ import annotations

from datetime import date

from sqlalchemy import Column, String, Text, Date, Uuid, ForeignKey, Numeric, Boolean, UniqueConstraint

from app.core.database import Base, UUIDPKMixin


class Relationship(Base, UUIDPKMixin):
    __tablename__ = "relationships"
    __table_args__ = (
        UniqueConstraint("person_a_id", "person_b_id", "relationship_type", name="uq_relationship_pair_type"),
    )

    person_a_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    person_b_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    relationship_type = Column(String(64), nullable=False)
    # coauthor/colleague/classmate/labmate/project_mate/event_mate/manual_introduce
    relationship_strength = Column(String(16), default="medium")  # strong/medium/weak
    score = Column(Numeric(6, 2), default=0)
    start_date = Column(Date)
    end_date = Column(Date)
    is_inferred = Column(Boolean, default=True)  # 系统推断
    is_verified = Column(Boolean, default=False)  # 人工确认
    verification_status = Column(String(32), default="pending")  # pending/confirmed/rejected
    can_introduce = Column(Boolean, default=False)


class RelationshipEvidence(Base, UUIDPKMixin):
    __tablename__ = "relationship_evidence"

    relationship_id = Column(Uuid, ForeignKey("relationships.id", ondelete="CASCADE"), nullable=False, index=True)
    evidence_type = Column(String(64))  # paper/company/school/project/event/manual
    related_entity_id = Column(Uuid)  # 关联对象 ID（论文/机构/项目/活动）
    description = Column(Text)
    source_url = Column(Text)
    base_score = Column(Numeric(6, 2), default=0)
    confidence = Column(Numeric(5, 2), default=1.0)
    time_overlap_score = Column(Numeric(5, 2), default=1.0)
