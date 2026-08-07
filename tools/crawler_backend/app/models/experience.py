"""教育/工作/研究经历表。"""
from __future__ import annotations

from datetime import date

from sqlalchemy import Column, String, Text, Date, Uuid, ForeignKey, Numeric, Boolean

from app.core.database import Base, UUIDPKMixin


class Experience(Base, UUIDPKMixin):
    __tablename__ = "experiences"

    person_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    organization_id = Column(Uuid, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    experience_type = Column(String(32), nullable=False)  # education/work/research
    title = Column(String(255))  # 职位或学位
    department = Column(String(255))
    major = Column(String(255))
    advisor_person_id = Column(Uuid, ForeignKey("persons.id", ondelete="SET NULL"), nullable=True)
    start_date = Column(Date)
    end_date = Column(Date)
    is_current = Column(Boolean, default=False)
    description = Column(Text)
    source_record_id = Column(Uuid, ForeignKey("source_records.id", ondelete="SET NULL"), nullable=True)
    confidence = Column(Numeric(5, 2), default=1.0)
    verified = Column(Boolean, default=False)
