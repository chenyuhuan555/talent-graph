"""导入服务 —— 将采集的标准化数据写入现有人才关系网数据库。

复用后端 app 的 SQLAlchemy 模型，不重建数据库。
所有数据记录 source_type / source_url / source_id（存于 source_records 与外键关联）。
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, date
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.dialects.postgresql import insert as pg_insert

from config.settings import settings
# 复用后端模型
from app.core.database import Base
from app.models.person import Person, PersonExternalId
from app.models.organization import Organization
from app.models.experience import Experience
from app.models.paper import Paper, PaperAuthor
from app.models.project import Project, ProjectContributor
from app.models.relationship import Relationship, RelationshipEvidence
from app.models.contact import Contact, mask_value
from app.models.misc import SourceRecord

logger = logging.getLogger("data_pipeline.import")

# 独立引擎，指向同一数据库
connect_args = {"check_same_thread": False} if settings.is_sqlite else {}
engine = create_engine(settings.DATABASE_URL, connect_args=connect_args, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine)


def get_session() -> Session:
    return SessionLocal()


# ---------- 机构 ----------
def upsert_organization(db: Session, data: dict, source_type: str = "OpenAlex") -> Organization:
    """按 openalex_id 查找或创建机构。"""
    ext_id = data.get("openalex_id")
    # 先按名称查
    org = None
    if ext_id:
        existing = db.query(Organization).filter(Organization.name == data["name"]).first()
        if existing:
            return existing
    org = Organization(
        id=uuid.uuid4(),
        name=data["name"],
        english_name=data.get("english_name") or data["name"],
        organization_type=_org_type(data.get("type")),
        country=data.get("country"),
        city=None,
        website=data.get("homepage"),
        description=f"OpenAlex 类型: {data.get('type', 'unknown')}",
        source_url=data.get("source_url"),
    )
    db.add(org)
    db.flush()
    _add_source_record(db, source_type, ext_id, data.get("source_url"), data)
    return org


def _org_type(t: str | None) -> str:
    if not t:
        return "institute"
    if t == "education":
        return "university"
    if t in ("company", "facility"):
        return "company"
    if "lab" in t:
        return "lab"
    return "institute"


# ---------- 人才 ----------
def upsert_person(db: Session, data: dict, source_type: str = "OpenAlex", industry: str = "人工智能") -> Person:
    """按外部 ID 去重查找或创建人才。返回 person。"""
    ext_id = data.get("openalex_id")
    orcid = data.get("orcid")

    # 1. 按 openalex_id 查
    person = None
    if ext_id:
        link = db.query(PersonExternalId).filter(
            PersonExternalId.platform == "openalex",
            PersonExternalId.external_id == ext_id,
        ).first()
        if link:
            person = db.get(Person, link.person_id)

    # 2. 按 ORCID 查
    if not person and orcid:
        link = db.query(PersonExternalId).filter(
            PersonExternalId.platform == "orcid",
            PersonExternalId.external_id == orcid,
        ).first()
        if link:
            person = db.get(Person, link.person_id)

    # 3. 姓名完全匹配 + 同机构（弱匹配，需谨慎）
    # 不做：避免误合并。仅靠外部 ID。

    name = data.get("name") or "未知"
    is_chinese = _looks_chinese(name)

    if person:
        # 更新补充信息
        if not person.english_name and not is_chinese:
            person.english_name = name
        if not person.chinese_name and is_chinese:
            person.chinese_name = name
        if data.get("last_institution") and not person.current_organization_id:
            inst = _find_or_create_inst(db, data["last_institution"], source_type)
            if inst:
                person.current_organization_id = inst.id
                person.country = data["last_institution"].get("country") or person.country
        if not person.source_type:
            person.source_type = source_type
        db.flush()
        # 确保外部 ID 链接存在
        _ensure_external_id(db, person.id, "openalex", ext_id, data.get("source_url"))
        if orcid:
            _ensure_external_id(db, person.id, "orcid", orcid, None)
        return person

    # 创建新人才
    person = Person(
        id=uuid.uuid4(),
        chinese_name=name if is_chinese else None,
        english_name=None if is_chinese else name,
        industry=industry,
        source_type=source_type,
        review_status="approved",
        outreach_status="未触达",
        data_completeness=30.0,
        current_position=data.get("current_position") or "研究员",
    )
    if data.get("last_institution"):
        inst = _find_or_create_inst(db, data["last_institution"], source_type)
        if inst:
            person.current_organization_id = inst.id
            person.country = data["last_institution"].get("country")
            person.location = _country_to_location(data["last_institution"].get("country"))
    db.add(person)
    db.flush()
    _ensure_external_id(db, person.id, "openalex", ext_id, data.get("source_url"))
    if orcid:
        _ensure_external_id(db, person.id, "orcid", orcid, None)
    _add_source_record(db, source_type, ext_id, data.get("source_url"), data)
    return person


def _find_or_create_inst(db: Session, inst_data: dict, source_type: str) -> Organization | None:
    if not inst_data or not inst_data.get("name"):
        return None
    existing = db.query(Organization).filter(Organization.name == inst_data["name"]).first()
    if existing:
        return existing
    return upsert_organization(db, inst_data, source_type)


def _ensure_external_id(db: Session, person_id, platform: str, ext_id: str | None, url: str | None):
    if not ext_id:
        return
    existing = db.query(PersonExternalId).filter(
        PersonExternalId.platform == platform,
        PersonExternalId.external_id == ext_id,
    ).first()
    if existing:
        return
    db.add(PersonExternalId(
        id=uuid.uuid4(), person_id=person_id, platform=platform,
        external_id=ext_id, profile_url=url, confidence=1.0, verified=(platform == "openalex"),
    ))


def _looks_chinese(name: str) -> bool:
    if not name:
        return False
    return any("\u4e00" <= c <= "\u9fff" for c in name)


def _country_to_location(country: str | None) -> str | None:
    if not country:
        return None
    mapping = {"CN": "中国", "US": "美国", "GB": "英国", "DE": "德国", "FR": "法国",
               "JP": "日本", "KR": "韩国", "CA": "加拿大", "SG": "新加坡", "IN": "印度"}
    return mapping.get(country, country)


# ---------- 论文 ----------
def upsert_paper(db: Session, work: dict, source_type: str = "OpenAlex", industry: str = "人工智能") -> Paper:
    """创建或更新论文，并建立作者关系。"""
    openalex_id = work.get("openalex_id")
    paper = None
    if openalex_id:
        paper = db.query(Paper).filter(Paper.openalex_id == openalex_id).first()
    if not paper and work.get("doi"):
        paper = db.query(Paper).filter(Paper.doi == work["doi"]).first()
    if not paper and work.get("arxiv_id"):
        paper = db.query(Paper).filter(Paper.arxiv_id == work["arxiv_id"]).first()

    pub_date = None
    if work.get("publication_date"):
        try:
            pub_date = date.fromisoformat(work["publication_date"])
        except Exception:
            pass

    if paper:
        # 更新引用数
        paper.citation_count = work.get("citation_count", paper.citation_count or 0)
        db.flush()
    else:
        paper = Paper(
            id=uuid.uuid4(),
            title=work["title"][:500] if work.get("title") else "无标题",
            abstract=(work.get("abstract") or "")[:5000],
            publication_date=pub_date,
            venue=work.get("venue"),
            doi=work.get("doi"),
            arxiv_id=work.get("arxiv_id"),
            openalex_id=openalex_id,
            citation_count=work.get("citation_count", 0),
            domains=json.dumps(work.get("domains") or [], ensure_ascii=False),
            source_url=work.get("source_url"),
        )
        db.add(paper)
        db.flush()
        _add_source_record(db, source_type, openalex_id, work.get("source_url"), work)

    # 建立作者关系（只保留中国机构作者）
    CHINA_CODES = {"CN", "HK", "TW", "MO"}
    for idx, au in enumerate(work.get("authorships", [])):
        if not au.get("openalex_id") and not au.get("name"):
            continue
        # 只保留中国（含港澳台）机构作者
        insts = au.get("institutions") or []
        author_country = None
        if insts:
            author_country = insts[0].get("country")
        if author_country and author_country not in CHINA_CODES:
            continue  # 跳过非中国机构作者
        if not author_country and not insts:
            # 无机构信息的作者也跳过（确保只保留可确认的中国人才）
            continue
        person_data = {
            "openalex_id": au.get("openalex_id"),
            "name": au.get("name"),
            "orcid": au.get("orcid"),
            "last_institution": insts[0] if insts else None,
            "source_url": f"https://openalex.org/{au['openalex_id']}" if au.get("openalex_id") else None,
            "current_position": "研究员",
        }
        person = upsert_person(db, person_data, source_type, industry=industry)
        # 检查是否已有作者链接
        exists = db.query(PaperAuthor).filter(
            PaperAuthor.paper_id == paper.id, PaperAuthor.person_id == person.id
        ).first()
        if not exists:
            org_id = None
            if au.get("institutions"):
                org = _find_or_create_inst(db, au["institutions"][0], source_type)
                if org:
                    org_id = org.id
            db.add(PaperAuthor(
                id=uuid.uuid4(), paper_id=paper.id, person_id=person.id,
                author_order=idx + 1,
                is_corresponding="true" if au.get("is_corresponding") else "false",
                organization_id=org_id,
                raw_author_name=au.get("raw_name") or au.get("name"),
            ))
    return paper


# ---------- 来源记录 ----------
def _add_source_record(db: Session, source_type: str, ext_id: str | None, url: str | None, raw: dict):
    if not ext_id and not url:
        return
    try:
        db.add(SourceRecord(
            id=uuid.uuid4(),
            source_name=source_type,
            source_type="api",
            source_url=url,
            external_record_id=ext_id,
            raw_data=json.dumps(raw, ensure_ascii=False, default=str)[:8000],
            fetched_at=datetime.utcnow(),
            processing_status="processed",
        ))
    except Exception as e:
        logger.debug(f"source_record 写入跳过: {e}")


# ---------- 统计 ----------
def db_stats(db: Session) -> dict:
    return {
        "persons": db.query(Person).filter(Person.deleted_at.is_(None)).count(),
        "papers": db.query(Paper).count(),
        "organizations": db.query(Organization).filter(Organization.deleted_at.is_(None)).count(),
        "relationships": db.query(Relationship).count(),
        "paper_authors": db.query(PaperAuthor).count(),
        "source_records": db.query(SourceRecord).count(),
    }


# ---------- GitHub 导入 ----------
def import_github_repo(db: Session, repo_data: dict, contributors: list[dict], source_type: str = "GitHub", industry: str = "人工智能") -> tuple[Project, int]:
    """导入 GitHub 仓库及其贡献者。返回 (project, contributor_count)。"""
    # 机构：owner 作为组织
    org = None
    owner = repo_data.get("owner")
    if owner:
        org = db.query(Organization).filter(Organization.name == owner).first()
        if not org:
            org = Organization(
                id=uuid.uuid4(), name=owner, english_name=owner,
                organization_type="company", industry=industry,
                source_url=f"https://github.com/{owner}",
            )
            db.add(org)
            db.flush()

    project = db.query(Project).filter(Project.url == repo_data.get("url")).first()
    if not project:
        project = Project(
            id=uuid.uuid4(),
            name=repo_data.get("name"),
            project_type="github",
            organization_id=org.id if org else None,
            url=repo_data.get("url"),
            description=repo_data.get("description"),
            domains=json.dumps(["AI Infra"], ensure_ascii=False),
            stars_count=repo_data.get("stars", 0),
            start_date=date.today(),
            last_active_at=datetime.utcnow().isoformat(),
        )
        db.add(project)
        db.flush()
        _add_source_record(db, source_type, str(repo_data.get("github_id", "")), repo_data.get("url"), repo_data)

    count = 0
    for c in contributors:
        # 按 github username 去重查找/创建人才
        username = c.get("username")
        if not username:
            continue
        link = db.query(PersonExternalId).filter(
            PersonExternalId.platform == "github",
            PersonExternalId.external_id == username,
        ).first()
        if link:
            person = db.get(Person, link.person_id)
        else:
            person = Person(
                id=uuid.uuid4(),
                english_name=username,
                industry=industry,
                source_type=source_type,
                review_status="approved",
                outreach_status="未触达",
                current_position="工程师",
            )
            db.add(person)
            db.flush()
            _ensure_external_id(db, person.id, "github", username, c.get("profile_url"))
            _add_source_record(db, source_type, username, c.get("profile_url"), c)

        # 贡献者关系
        exists = db.query(ProjectContributor).filter(
            ProjectContributor.project_id == project.id,
            ProjectContributor.person_id == person.id,
        ).first()
        if not exists:
            role = "maintainer" if c.get("contributions", 0) >= 100 else "contributor"
            db.add(ProjectContributor(
                id=uuid.uuid4(), project_id=project.id, person_id=person.id,
                role=role, contribution_score=float(c.get("contributions", 0)),
                start_date=date.today(), source_url=c.get("profile_url"),
            ))
            count += 1
    db.commit()
    return project, count


# ---------- HuggingFace 导入 ----------
def import_hf_model(db: Session, model_data: dict, source_type: str = "HuggingFace", industry: str = "人工智能") -> tuple[Project, Person | None]:
    """导入 HF 模型为 project，作者为 person。"""
    author = model_data.get("author")
    model_id = model_data.get("model_id") or ""
    url = model_data.get("url") or f"https://huggingface.co/{model_id}"

    project = db.query(Project).filter(Project.url == url).first()
    if not project:
        project = Project(
            id=uuid.uuid4(),
            name=model_id,
            project_type="huggingface",
            url=url,
            description=f"HF model: {model_data.get('pipeline_tag', '')}",
            domains=json.dumps(["多模态"], ensure_ascii=False),
            downloads_count=model_data.get("downloads", 0),
            stars_count=model_data.get("likes", 0),
            last_active_at=model_data.get("last_modified") or datetime.utcnow().isoformat(),
        )
        db.add(project)
        db.flush()
        _add_source_record(db, source_type, model_id, url, model_data)

    person = None
    if author:
        link = db.query(PersonExternalId).filter(
            PersonExternalId.platform == "huggingface",
            PersonExternalId.external_id == author,
        ).first()
        if link:
            person = db.get(Person, link.person_id)
        else:
            person = Person(
                id=uuid.uuid4(),
                english_name=author,
                industry=industry,
                source_type=source_type,
                review_status="approved",
                outreach_status="未触达",
                current_position="模型开发者",
            )
            db.add(person)
            db.flush()
            _ensure_external_id(db, person.id, "huggingface", author, f"https://huggingface.co/{author}")
            _add_source_record(db, source_type, author, f"https://huggingface.co/{author}", model_data)

        exists = db.query(ProjectContributor).filter(
            ProjectContributor.project_id == project.id,
            ProjectContributor.person_id == person.id,
        ).first()
        if not exists:
            db.add(ProjectContributor(
                id=uuid.uuid4(), project_id=project.id, person_id=person.id,
                role="maintainer", contribution_score=float(model_data.get("downloads", 0)),
                source_url=url,
            ))
    db.commit()
    return project, person


# ---------- arXiv 导入 ----------
def import_arxiv_works(db: Session, works: list[dict], source_type: str = "arXiv") -> dict:
    """导入 arXiv 论文（与 OpenAlex 共用 upsert_paper，按 arxiv_id 去重）。"""
    cnt = 0
    for w in works:
        try:
            from processors.entity_extract import classify_paper
            primary, sub = classify_paper(w.get("title", "") + " " + w.get("abstract", ""))
            w["domains"] = sub if sub else []
            upsert_paper(db, w, source_type=source_type)
            db.commit()
            cnt += 1
        except Exception as e:
            db.rollback()
            logger.warning(f"arXiv 论文导入失败: {e}")
    return {"imported": cnt}
