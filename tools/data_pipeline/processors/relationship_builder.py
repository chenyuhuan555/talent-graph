"""关系生成器 —— 从论文作者关系生成共同论文关系。

规则：两人共同发表 >=1 篇论文 → 生成 coauthor 关系，基础分 40/篇（封顶 80）。
所有关系附带 relationship_evidence（论文标题/年份/链接）。
"""
from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from datetime import datetime

from sqlalchemy import func
from sqlalchemy.orm import Session

import config.settings  # noqa: F401  确保 backend 路径已注入
from app.models.person import Person
from app.models.paper import Paper, PaperAuthor
from app.models.relationship import Relationship, RelationshipEvidence
from app.models.organization import Organization
from services.import_service import get_session

logger = logging.getLogger("data_pipeline.relationships")


def _person_name(p: Person) -> str:
    return p.chinese_name or p.english_name or "未知"


def build_coauthor_relationships(db: Session, batch_size: int = 2000) -> dict:
    """扫描论文作者表，为共同作者生成关系与证据。"""
    # 收集每篇论文的作者
    rows = db.query(PaperAuthor.paper_id, PaperAuthor.person_id).all()
    paper_authors: dict[str, list] = defaultdict(list)
    for paper_id, person_id in rows:
        paper_authors[str(paper_id)].append(person_id)

    # 统计每对共同作者的合作论文
    pair_papers: dict[tuple, list] = defaultdict(list)
    for paper_id, authors in paper_authors.items():
        author_set = list(set(str(a) for a in authors))
        for i in range(len(author_set)):
            for j in range(i + 1, len(author_set)):
                a, b = author_set[i], author_set[j]
                pair = (min(a, b), max(a, b))
                pair_papers[pair].append(paper_id)

    logger.info(f"发现 {len(pair_papers)} 对潜在共同作者关系")

    created = 0
    evidence_created = 0
    skipped = 0

    # 预取论文信息
    paper_cache: dict[str, Paper] = {}
    for p in db.query(Paper).all():
        paper_cache[str(p.id)] = p

    # 已有关系缓存（避免重复）
    existing = set()
    for r in db.query(Relationship).filter(Relationship.relationship_type == "coauthor").all():
        existing.add((str(r.person_a_id), str(r.person_b_id)))

    for (a_str, b_str), paper_ids in pair_papers.items():
        pair = (a_str, b_str)
        if pair in existing:
            skipped += 1
            continue
        try:
            a_id = uuid.UUID(a_str)
            b_id = uuid.UUID(b_str)
        except Exception:
            continue

        cnt = len(paper_ids)
        score = min(80, cnt * 40)
        strength = "strong" if score >= 80 else ("medium_strong" if score >= 50 else ("medium" if score >= 25 else "weak"))

        rel = Relationship(
            id=uuid.uuid4(),
            person_a_id=a_id, person_b_id=b_id,
            relationship_type="coauthor",
            relationship_strength=strength,
            score=score,
            is_inferred=True, is_verified=False,
            verification_status="pending",
        )
        db.add(rel)
        db.flush()

        for pid in paper_ids[:5]:  # 每对最多 5 条证据
            paper = paper_cache.get(pid)
            if not paper:
                continue
            db.add(RelationshipEvidence(
                id=uuid.uuid4(),
                relationship_id=rel.id,
                evidence_type="coauthor",
                related_entity_id=paper.id,
                description=f"共同论文：{paper.title[:80]}（{paper.publication_date.year if paper.publication_date else '未知年份'}）",
                source_url=paper.source_url,
                base_score=min(80, 40),
                confidence=1.0,
                time_overlap_score=1.0,
            ))
            evidence_created += 1
        created += 1
        existing.add(pair)

        if created % 1000 == 0:
            db.commit()
            logger.info(f"  已生成 {created} 条共同论文关系")

    db.commit()
    logger.info(f"共同论文关系生成完成: 新增 {created} 条, 证据 {evidence_created} 条, 跳过已存在 {skipped} 条")
    return {"created": created, "evidence": evidence_created, "skipped": skipped}


def build_same_organization_relationships(db: Session) -> dict:
    """为同机构的人才生成 colleague 关系（基础分 30）。限制规模避免爆炸。"""
    # 按机构分组人才
    rows = db.query(Person.id, Person.current_organization_id).filter(
        Person.current_organization_id.isnot(None),
        Person.deleted_at.is_(None),
    ).all()
    org_persons: dict[str, list] = defaultdict(list)
    for pid, oid in rows:
        org_persons[str(oid)].append(pid)

    created = 0
    existing = set()
    for r in db.query(Relationship).filter(Relationship.relationship_type == "colleague").all():
        existing.add((str(r.person_a_id), str(r.person_b_id)))

    for oid, persons in org_persons.items():
        if len(persons) > 50:
            persons = persons[:50]  # 限制大机构的关系数量
        person_strs = [str(p) for p in persons]
        for i in range(len(person_strs)):
            for j in range(i + 1, len(person_strs)):
                pair = (person_strs[i], person_strs[j])
                if pair in existing:
                    continue
                org = db.get(Organization, uuid.UUID(oid))
                rel = Relationship(
                    id=uuid.uuid4(),
                    person_a_id=uuid.UUID(pair[0]),
                    person_b_id=uuid.UUID(pair[1]),
                    relationship_type="colleague",
                    relationship_strength="medium",
                    score=30,
                    is_inferred=True, is_verified=False,
                    verification_status="pending",
                )
                db.add(rel)
                db.flush()
                db.add(RelationshipEvidence(
                    id=uuid.uuid4(),
                    relationship_id=rel.id,
                    evidence_type="company_overlap_unknown_dept",
                    description=f"同属机构：{org.name if org else '未知'}",
                    base_score=30, confidence=0.7, time_overlap_score=0.6,
                ))
                created += 1
                existing.add(pair)
                if created % 1000 == 0:
                    db.commit()
                    logger.info(f"  已生成 {created} 条同机构关系")
        db.commit()

    logger.info(f"同机构关系生成完成: 新增 {created} 条")
    return {"created": created}


def run_all():
    db = get_session()
    try:
        logger.info("开始生成关系...")
        r1 = build_coauthor_relationships(db)
        r2 = build_same_organization_relationships(db)
        total = db.query(Relationship).count()
        logger.info(f"关系生成全部完成，数据库关系总数: {total}")
        return {"coauthor": r1, "colleague": r2, "total": total}
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s", datefmt="%H:%M:%S")
    run_all()
