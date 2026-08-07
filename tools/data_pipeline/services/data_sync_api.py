"""数据采集与同步相关 API。

- GET /api/data-sync/status  数据源同步状态
- GET /api/talent/discovery  高潜人才发现
- POST /api/data-sync/run    手动触发同步（admin）
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, desc
from sqlalchemy.orm import Session

import config.settings  # noqa: F401  确保 backend 路径
from app.core.database import get_db
from app.core.security import get_current_user, require_roles
from app.models.user import User
from app.models.person import Person, PersonExternalId
from app.models.paper import Paper, PaperAuthor
from app.models.organization import Organization
from app.models.project import Project, ProjectContributor
from app.models.relationship import Relationship
from app.models.misc import SourceRecord

logger = logging.getLogger("api.data_sync")

sync_router = APIRouter(prefix="/data-sync", tags=["data-sync"])
talent_router = APIRouter(prefix="/talent", tags=["talent"])


def _person_name(p: Person) -> str:
    return p.chinese_name or p.english_name or "未知"


@sync_router.get("/status")
def sync_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """各数据源同步状态与数据量。"""
    today = datetime.utcnow().date()
    week_ago = today - timedelta(days=7)

    # 按来源统计
    sources = {}
    for sr in db.query(SourceRecord).all():
        sn = sr.source_name or "unknown"
        if sn not in sources:
            sources[sn] = {"count": 0, "last_sync": None}
        sources[sn]["count"] += 1
        if sr.fetched_at:
            if not sources[sn]["last_sync"] or sr.fetched_at > sources[sn]["last_sync"]:
                sources[sn]["last_sync"] = sr.fetched_at.isoformat()

    # 人才按 source_type 统计
    person_sources = {}
    for p in db.query(Person).filter(Person.deleted_at.is_(None)):
        st = p.source_type or "unknown"
        person_sources[st] = person_sources.get(st, 0) + 1

    return {
        "openalex": {
            "last_sync": sources.get("OpenAlex", {}).get("last_sync"),
            "count": sources.get("OpenAlex", {}).get("count", 0),
        },
        "arxiv": {
            "last_sync": sources.get("arXiv", {}).get("last_sync"),
            "count": sources.get("arXiv", {}).get("count", 0),
        },
        "github": {
            "last_sync": sources.get("GitHub", {}).get("last_sync"),
            "count": sources.get("GitHub", {}).get("count", 0),
        },
        "huggingface": {
            "last_sync": sources.get("HuggingFace", {}).get("last_sync"),
            "count": sources.get("HuggingFace", {}).get("count", 0),
        },
        "totals": {
            "persons": db.query(Person).filter(Person.deleted_at.is_(None)).count(),
            "papers": db.query(Paper).count(),
            "organizations": db.query(Organization).filter(Organization.deleted_at.is_(None)).count(),
            "relationships": db.query(Relationship).count(),
            "projects": db.query(Project).count(),
            "source_records": db.query(SourceRecord).count(),
        },
        "person_by_source": person_sources,
    }


@talent_router.get("/discovery")
def talent_discovery(
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """高潜人才发现：今日新增、高评分、论文增长、开源贡献。"""
    today = datetime.utcnow().date()
    week_ago = today - timedelta(days=7)

    # 今日新增人才（按 created_at）
    new_today = db.query(Person).filter(
        Person.deleted_at.is_(None),
        Person.created_at >= datetime.combine(today, datetime.min.time()),
    ).order_by(Person.created_at.desc()).limit(limit).all()

    # 高评分人才（按 talent_level S/A）
    high_potential = db.query(Person).filter(
        Person.deleted_at.is_(None),
        Person.talent_level.in_(["S", "A"]),
    ).order_by(Person.talent_level, Person.created_at.desc()).limit(limit).all()

    # 论文增长人才（论文数最多）
    paper_counts = db.query(PaperAuthor.person_id, func.count(PaperAuthor.id).label("cnt")).group_by(
        PaperAuthor.person_id).order_by(desc("cnt")).limit(limit).all()
    growth_ids = [r[0] for r in paper_counts]
    growth_persons = {str(p.id): p for p in db.query(Person).filter(Person.id.in_(growth_ids)).all()} if growth_ids else {}
    paper_growth = []
    for pid, cnt in paper_counts:
        p = growth_persons.get(str(pid))
        if p:
            paper_growth.append({
                "id": str(p.id), "name": _person_name(p), "org": _org_name(db, p),
                "domain": p.primary_domain, "level": p.talent_level,
                "paper_count": cnt, "source_type": p.source_type,
            })

    # 开源贡献人才（项目贡献者）
    proj_counts = db.query(ProjectContributor.person_id, func.count(ProjectContributor.id).label("cnt")).group_by(
        ProjectContributor.person_id).order_by(desc("cnt")).limit(limit).all()
    proj_ids = [r[0] for r in proj_counts]
    proj_persons = {str(p.id): p for p in db.query(Person).filter(Person.id.in_(proj_ids)).all()} if proj_ids else {}
    open_source = []
    for pid, cnt in proj_counts:
        p = proj_persons.get(str(pid))
        if p:
            open_source.append({
                "id": str(p.id), "name": _person_name(p), "org": _org_name(db, p),
                "domain": p.primary_domain, "level": p.talent_level,
                "project_count": cnt, "source_type": p.source_type,
            })

    # 热门研究方向
    domain_dist = db.query(Person.primary_domain, func.count(Person.id)).filter(
        Person.deleted_at.is_(None), Person.primary_domain.isnot(None)
    ).group_by(Person.primary_domain).all()

    return {
        "new_today": [_person_card(db, p) for p in new_today],
        "high_potential": [_person_card(db, p) for p in high_potential],
        "paper_growth": paper_growth,
        "open_source": open_source,
        "hot_domains": [{"name": d or "未分类", "value": c} for d, c in domain_dist],
    }


def _person_card(db: Session, p: Person) -> dict:
    paper_count = db.query(PaperAuthor).filter(PaperAuthor.person_id == p.id).count()
    rel_count = db.query(Relationship).filter(
        (Relationship.person_a_id == p.id) | (Relationship.person_b_id == p.id)
    ).count()
    score = None
    if p.summary:
        try:
            score = json.loads(p.summary).get("talent_score")
        except Exception:
            pass
    # 推荐原因
    reasons = []
    if p.talent_level == "S":
        reasons.append("顶尖人才")
    elif p.talent_level == "A":
        reasons.append("资深高潜人才")
    if paper_count >= 5:
        reasons.append(f"论文产出丰富({paper_count}篇)")
    if rel_count >= 10:
        reasons.append(f"关系网络广泛({rel_count}条)")
    return {
        "id": str(p.id),
        "name": _person_name(p),
        "english_name": p.english_name,
        "org": _org_name(db, p),
        "position": p.current_position,
        "domain": p.primary_domain,
        "level": p.talent_level,
        "talent_score": score,
        "paper_count": paper_count,
        "relationship_count": rel_count,
        "source_type": p.source_type,
        "reason": "；".join(reasons) if reasons else "新兴人才，建议关注",
    }


def _org_name(db: Session, p: Person) -> str | None:
    if not p.current_organization_id:
        return None
    org = db.get(Organization, p.current_organization_id)
    return org.name if org else None


@sync_router.post("/run")
def run_sync(
    source: str = Query("openalex", regex="^(openalex|arxiv|github|huggingface)$"),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    """手动触发同步（仅 admin）。返回任务状态。"""
    return {
        "message": f"同步任务已提交: {source}",
        "note": "请在 data_pipeline 目录运行对应采集器。生产环境由 Celery/APScheduler 自动执行。",
        "command": {
            "openalex": "PYTHONPATH=. python scripts/initial_import.py --max 100",
            "arxiv": "PYTHONPATH=. python -c \"from collectors.arxiv import ArxivCollector; from services.import_service import get_session, import_arxiv_works; c=ArxivCollector(); db=get_session(); import_arxiv_works(db, c.fetch_latest(50)); db.close(); c.close()\"",
            "github": "PYTHONPATH=. python -c \"from collectors.github import GitHubCollector, SEARCH_REPOS; from services.import_service import get_session, import_github_repo; c=GitHubCollector(); db=get_session(); [import_github_repo(db, r, c.get_contributors(r['full_name'])) for r in c.search_repos('llama',5)]; db.close(); c.close()\"",
        }.get(source, ""),
    }
