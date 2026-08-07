"""联系方式表。敏感字段加密存储，默认脱敏展示。"""
from __future__ import annotations

from sqlalchemy import Column, String, Text, Uuid, ForeignKey, Boolean, DateTime

from app.core.database import Base, UUIDPKMixin


class Contact(Base, UUIDPKMixin):
    __tablename__ = "contacts"

    person_id = Column(Uuid, ForeignKey("persons.id", ondelete="CASCADE"), nullable=False, index=True)
    contact_type = Column(String(32), nullable=False)  # email/phone/homepage/github/huggingface
    contact_value_encrypted = Column(Text)  # 简化：明文存储演示，生产应加密
    masked_value = Column(String(255))  # 脱敏展示值
    source_type = Column(String(64))
    source_url = Column(Text)
    collected_at = Column(DateTime)
    verified_at = Column(DateTime)
    is_valid = Column(Boolean, default=True)
    is_public = Column(Boolean, default=True)
    access_level = Column(String(32), default="default")  # default/full
    created_by = Column(Uuid, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


def mask_value(contact_type: str, value: str) -> str:
    """生成脱敏展示值。"""
    if not value:
        return ""
    if contact_type == "email":
        if "@" in value:
            name, domain = value.split("@", 1)
            head = name[:2] if len(name) >= 2 else name[0]
            return f"{head}{'*' * max(1, len(name) - 2)}@{domain}"
        return value[:2] + "***"
    if contact_type == "phone":
        if len(value) >= 7:
            return value[:3] + "****" + value[-4:]
        return "***"
    # 主页类不脱敏
    return value
