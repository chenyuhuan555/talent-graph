"""模型汇总，便于 Alembic 与 app 自动建表。"""
from app.models.user import User
from app.models.organization import Organization
from app.models.person import Person, PersonExternalId
from app.models.experience import Experience
from app.models.paper import Paper, PaperAuthor
from app.models.project import Project, ProjectContributor
from app.models.event import Event, EventParticipant
from app.models.contact import Contact
from app.models.relationship import Relationship, RelationshipEvidence
from app.models.outreach import OutreachRecord
from app.models.position import Position, PersonPositionMatch
from app.models.tag import Tag, PersonTag
from app.models.misc import SourceRecord, MergeTask, AuditLog

__all__ = [
    "User",
    "Organization",
    "Person",
    "PersonExternalId",
    "Experience",
    "Paper",
    "PaperAuthor",
    "Project",
    "ProjectContributor",
    "Event",
    "EventParticipant",
    "Contact",
    "Relationship",
    "RelationshipEvidence",
    "OutreachRecord",
    "Position",
    "PersonPositionMatch",
    "Tag",
    "PersonTag",
    "SourceRecord",
    "MergeTask",
    "AuditLog",
]
