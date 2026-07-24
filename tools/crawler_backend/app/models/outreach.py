"""触达记录表。"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, String, Text, Uuid, ForeignKey, Boolean, DateTime

from app.core.database import Base, UUIDPKMixin


class OutreachRecord(Base, UUIDPKMixin):
    __tablename__ = "outreach_records"

    person_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    position_id = Column(Uuid, ForeignKey("positions.id", ondelete="SET NULL"), nullable=True)
    outreach_channel = Column(String(32))  # email/phone/wechat/linkedin
    outreach_at = Column(DateTime, default=datetime.utcnow, index=True)
    content_summary = Column(Text)
    response_status = Column(String(32), default="pending")  # pending/replied/no_reply
    response_summary = Column(Text)
    intention_level = Column(String(16), default="none")  # high/medium/low/none
    next_action = Column(Text)
    next_follow_up_at = Column(DateTime, index=True)
    willing_to_refer = Column(Boolean, default=False)
