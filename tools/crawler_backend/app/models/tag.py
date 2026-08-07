"""标签与人才标签关系表。"""
from __future__ import annotations

from sqlalchemy import Column, String, Uuid, ForeignKey, Numeric, UniqueConstraint

from app.core.database import Base, UUIDPKMixin


class Tag(Base, UUIDPKMixin):
    __tablename__ = "tags"

    name = Column(String(128), nullable=False, index=True)
    tag_type = Column(String(32), default="custom")  # domain/skill/status/custom
    parent_id = Column(Uuid, ForeignKey("tags.id", ondelete="SET NULL"), nullable=True)
    color = Column(String(32), default="#2D6A4F")


class PersonTag(Base, UUIDPKMixin):
    __tablename__ = "person_tags"
    __table_args__ = (UniqueConstraint("person_id", "tag_id", name="uq_person_tag"),)

    person_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    tag_id = Column(Uuid, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type = Column(String(32), default="manual")  # ai/manual/import
    confidence = Column(Numeric(5, 2), default=1.0)
