"""数据来源、人才合并任务、操作日志表。"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, String, Text, Uuid, ForeignKey, Numeric, DateTime

from app.core.database import Base, UUIDPKMixin


class SourceRecord(Base, UUIDPKMixin):
    __tablename__ = "source_records"

    source_name = Column(String(255))
    source_type = Column(String(64))  # api/resume/website/manual
    source_url = Column(Text)
    external_record_id = Column(String(255))
    raw_data = Column(Text)  # JSON 字符串
    fetched_at = Column(DateTime, default=datetime.utcnow)
    processing_status = Column(String(32), default="processed")
    checksum = Column(String(128))


class MergeTask(Base, UUIDPKMixin):
    __tablename__ = "merge_tasks"

    primary_person_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    duplicate_person_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    similarity_score = Column(Numeric(5, 2), default=0)
    matching_evidence = Column(Text)  # JSON 字符串
    conflict_fields = Column(Text)  # JSON 字符串
    status = Column(String(32), default="pending", index=True)  # pending/merged/rejected
    reviewed_by = Column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime)


class AuditLog(Base, UUIDPKMixin):
    __tablename__ = "audit_logs"

    user_id = Column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(String(64))  # view_full_contact/export/create/update/delete
    entity_type = Column(String(64))
    entity_id = Column(Uuid)
    before_data = Column(Text)  # JSON
    after_data = Column(Text)  # JSON
    ip_address = Column(String(64))
