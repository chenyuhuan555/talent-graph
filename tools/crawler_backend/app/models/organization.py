"""机构表（学校/公司/实验室/研究院/团队统一存储）。"""
from __future__ import annotations

from sqlalchemy import Column, String, Text, Uuid, ForeignKey

from app.core.database import Base, UUIDPKMixin, SoftDeleteMixin


class Organization(Base, UUIDPKMixin, SoftDeleteMixin):
    __tablename__ = "organizations"

    name = Column(String(255), nullable=False, index=True)
    english_name = Column(String(255))
    organization_type = Column(String(32), nullable=False, index=True)
    # university / company / lab / institute / team
    parent_id = Column(Uuid, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    industry = Column(String(64))
    country = Column(String(64))
    city = Column(String(64))
    website = Column(Text)
    description = Column(Text)
    source_url = Column(Text)
