"""论文与论文作者关系表。"""
from __future__ import annotations

from datetime import date

from sqlalchemy import Column, String, Text, Date, Integer, Uuid, ForeignKey

from app.core.database import Base, UUIDPKMixin


class Paper(Base, UUIDPKMixin):
    __tablename__ = "papers"

    title = Column(Text, nullable=False, index=True)
    abstract = Column(Text)
    publication_date = Column(Date, index=True)
    venue = Column(String(255), index=True)
    doi = Column(String(255))
    arxiv_id = Column(String(64), index=True)
    openalex_id = Column(String(64), index=True)
    citation_count = Column(Integer, default=0)
    domains = Column(Text)  # JSON 字符串
    source_url = Column(Text)


class PaperAuthor(Base, UUIDPKMixin):
    __tablename__ = "paper_authors"

    paper_id = Column(Uuid, ForeignKey("papers.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    author_order = Column(Integer, default=1)
    is_corresponding = Column(String(8), default="false")  # sqlite 兼容用字符串
    organization_id = Column(Uuid, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True)
    raw_author_name = Column(String(255))
