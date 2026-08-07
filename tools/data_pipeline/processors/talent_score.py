"""人才价值评分。

规则：
- 论文：最高 40 分（按论文数，对数缩放）
- 引用：最高 20 分（按总引用，对数缩放）
- 顶会：最高 20 分（每篇顶会 5 分，封顶 20）
- GitHub 影响：最高 10 分（预留，当前来自开源项目）
- 近期活跃：最高 10 分（近 2 年有论文产出）

等级：S(85+) / A(70-84) / B(50-69) / C(<50)
"""
from __future__ import annotations

import logging
import math
from datetime import date

from sqlalchemy import func
from sqlalchemy.orm import Session

import config.settings  # noqa: F401  确保 backend 路径已注入
from app.models.person import Person
from app.models.paper import Paper, PaperAuthor
from app.models.project import ProjectContributor
from processors.entity_extract import is_top_venue

logger = logging.getLogger("data_pipeline.talent_score")


def compute_score(db: Session, person: Person) -> tuple[float, str, dict]:
    """计算单个人才的评分。返回 (score, level, detail)。"""
    pid = person.id

    # 论文数
    paper_links = db.query(PaperAuthor).filter(PaperAuthor.person_id == pid).all()
    paper_count = len(paper_links)
    paper_ids = [pl.paper_id for pl in paper_links]
    papers = db.query(Paper).filter(Paper.id.in_(paper_ids)).all() if paper_ids else []

    # 论文分（对数缩放，10 篇≈满分一半）
    paper_score = min(40.0, 10.0 * math.log10(max(1, paper_count) + 1) * 16) if paper_count else 0
    paper_score = min(40.0, paper_score)

    # 引用分
    total_citations = sum((p.citation_count or 0) for p in papers)
    citation_score = min(20.0, math.log10(max(1, total_citations) + 1) * 6)

    # 顶会分
    top_count = sum(1 for p in papers if is_top_venue(p.venue))
    venue_score = min(20.0, top_count * 5.0)

    # GitHub 影响（项目贡献）
    proj_count = db.query(ProjectContributor).filter(ProjectContributor.person_id == pid).count()
    github_score = min(10.0, proj_count * 2.0)

    # 近期活跃
    recent = sum(1 for p in papers if p.publication_date and p.publication_date.year >= (date.today().year - 1))
    activity_score = min(10.0, recent * 2.0)

    total = round(paper_score + citation_score + venue_score + github_score + activity_score, 1)

    if total >= 85:
        level = "S"
    elif total >= 70:
        level = "A"
    elif total >= 50:
        level = "B"
    else:
        level = "C"

    detail = {
        "paper_score": round(paper_score, 1),
        "citation_score": round(citation_score, 1),
        "venue_score": round(venue_score, 1),
        "github_score": round(github_score, 1),
        "activity_score": round(activity_score, 1),
        "paper_count": paper_count,
        "total_citations": total_citations,
        "top_venue_count": top_count,
    }
    return total, level, detail


def update_all_scores(db: Session) -> dict:
    """更新所有人才的评分与等级。"""
    persons = db.query(Person).filter(Person.deleted_at.is_(None)).all()
    updated = 0
    levels = {"S": 0, "A": 0, "B": 0, "C": 0}
    for p in persons:
        score, level, detail = compute_score(db, p)
        p.talent_level = level
        # 评分写入 summary（JSON）
        import json
        p.summary = json.dumps({"talent_score": score, "score_detail": detail}, ensure_ascii=False)
        # 主方向补充
        if not p.primary_domain:
            # 从论文推断
            paper_links = db.query(PaperAuthor).filter(PaperAuthor.person_id == p.id).all()
            domains = {}
            for pl in paper_links:
                paper = db.get(Paper, pl.paper_id)
                if paper and paper.domains:
                    try:
                        for d in json.loads(paper.domains):
                            domains[d] = domains.get(d, 0) + 1
                    except Exception:
                        pass
            if domains:
                p.primary_domain = max(domains, key=domains.get)
        levels[level] = levels.get(level, 0) + 1
        updated += 1
        if updated % 200 == 0:
            db.commit()
            logger.info(f"  已评分 {updated} 人")
    db.commit()
    logger.info(f"人才评分完成: {updated} 人 | 等级分布 S:{levels['S']} A:{levels['A']} B:{levels['B']} C:{levels['C']}")
    return {"updated": updated, "levels": levels}


def run_all():
    from services.import_service import get_session
    db = get_session()
    try:
        return update_all_scores(db)
    finally:
        db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s", datefmt="%H:%M:%S")
    run_all()
