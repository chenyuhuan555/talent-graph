"""活动与活动参与关系表。"""
from __future__ import annotations

from datetime import date

from sqlalchemy import Column, String, Text, Date, Uuid, ForeignKey

from app.core.database import Base, UUIDPKMixin


class Event(Base, UUIDPKMixin):
    __tablename__ = "events"

    name = Column(String(255), nullable=False, index=True)
    event_type = Column(String(64))  # conference/forum/talk
    organizer = Column(String(255))
    start_date = Column(Date)
    end_date = Column(Date)
    location = Column(String(255))
    url = Column(Text)
    description = Column(Text)


class EventParticipant(Base, UUIDPKMixin):
    __tablename__ = "event_participants"

    event_id = Column(Uuid, ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    person_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    participant_role = Column(String(64))  # speaker/organizer/guest
    topic = Column(String(255))
    source_url = Column(Text)
