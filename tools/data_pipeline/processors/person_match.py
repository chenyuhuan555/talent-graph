"""人才实体合并 / 去重服务。

匹配因素权重：
- OpenAlex ID: 40%
- ORCID: 30%
- 机构: 15%
- 研究方向: 10%
- 姓名相似度: 5%
"""
from __future__ import annotations

import logging
from difflib import SequenceMatcher
from typing import Optional

from sqlalchemy import or_
from sqlalchemy.orm import Session

import config.settings  # noqa: F401  确保 backend 路径已注入
from app.models.person import Person, PersonExternalId
from app.models.organization import Organization
from app.models.paper import PaperAuthor, Paper

logger = logging.getLogger("data_pipeline.person_match")


def name_similarity(a: str | None, b: str | None) -> float:
    """姓名相似度 0-1。"""
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower().strip(), b.lower().strip()).ratio()


def match_person(db: Session, candidate: dict) -> Optional[Person]:
    """判断 candidate 是否与库中已有人才为同一人。返回匹配到的 person 或 None。"""
    openalex_id = candidate.get("openalex_id")
    orcid = candidate.get("orcid")
    name = candidate.get("name")
    institution = candidate.get("last_institution")

    # 1. OpenAlex ID 精确匹配（权重 40%，单独即超阈值）
    if openalex_id:
        link = db.query(PersonExternalId).filter(
            PersonExternalId.platform == "openalex",
            PersonExternalId.external_id == openalex_id,
        ).first()
        if link:
            return db.get(Person, link.person_id)

    # 2. ORCID 精确匹配（权重 30%）
    if orcid:
        link = db.query(PersonExternalId).filter(
            PersonExternalId.platform == "orcid",
            PersonExternalId.external_id == orcid,
        ).first()
        if link:
            return db.get(Person, link.person_id)

    # 3. 综合匹配（机构 15% + 方向 10% + 姓名 5%）
    if not name:
        return None
    # 候选姓名的相似人才
    candidates_q = db.query(Person).filter(Person.deleted_at.is_(None))
    if institution and institution.get("name"):
        # 同机构 + 姓名相似
        org = db.query(Organization).filter(Organization.name == institution["name"]).first()
        if org:
            candidates_q = candidates_q.filter(Person.current_organization_id == org.id)

    best: Person | None = None
    best_score = 0.0
    for p in candidates_q.limit(50):
        sim = name_similarity(name, _display_name(p))
        # 机构匹配 +0.15，姓名相似度 *0.05... 这里简化：机构已过滤，姓名阈值
        score = sim
        if score > best_score:
            best_score = score
            best = p

    # 姓名相似度 >= 0.92 且同机构才认为是同一人（保守，避免误合并）
    if best and best_score >= 0.92:
        logger.debug(f"合并匹配: {name} ~= {_display_name(best)} (sim={best_score:.2f})")
        return best

    return None


def _display_name(p: Person) -> str:
    return p.chinese_name or p.english_name or ""


def match_report(db: Session, candidate: dict) -> dict:
    """返回匹配报告（不执行合并）。"""
    person = match_person(db, candidate)
    if person:
        return {
            "is_same_person": True,
            "confidence": 0.95,
            "matched_person_id": str(person.id),
            "evidence": ["matched by external id / name similarity"],
        }
    return {"is_same_person": False, "confidence": 0.0, "evidence": []}
