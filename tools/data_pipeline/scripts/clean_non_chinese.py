"""清理非中国人才 —— 只保留 country in (CN, HK, TW, MO) 的人才。

清理范围：
1. 软删除非中国人才
2. 硬删除涉及已删除人才的关系及其证据
3. 硬删除涉及已删除人才的论文作者链接
4. 删除已无任何中国作者的孤立论文
"""
from __future__ import annotations

import logging
import sys
from pathlib import Path

# 注入 backend 路径
BACKEND_DIR = Path(__file__).resolve().parents[2] / "crawler_backend"
sys.path.insert(0, str(BACKEND_DIR))

# 在 import app 之前设置数据库路径（app.core.config 读环境变量）
import os
os.environ["DATABASE_URL"] = f"sqlite:///{BACKEND_DIR / 'talent_graph.db'}"

from datetime import datetime
from sqlalchemy import func
from app.core.database import SessionLocal
from app.models.person import Person
from app.models.paper import Paper, PaperAuthor
from app.models.relationship import Relationship, RelationshipEvidence
from app.models.project import ProjectContributor
from app.models.experience import Experience
from app.models.contact import Contact
from app.models.outreach import OutreachRecord

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s", datefmt="%H:%M:%S")
logger = logging.getLogger("clean")

CHINA_CODES = {"CN", "HK", "TW", "MO"}


def clean():
    db = SessionLocal()
    try:
        # 1. 找出保留的中国人才
        keep_ids = set()
        rows = db.query(Person.id, Person.country).filter(Person.deleted_at.is_(None)).all()
        total = len(rows)
        for pid, country in rows:
            if country in CHINA_CODES:
                keep_ids.add(str(pid))
        logger.info(f"保留中国人才: {len(keep_ids)} / {total}")

        # 2. 软删除非中国人才
        delete_ids = set(str(r[0]) for r in rows) - keep_ids
        logger.info(f"将软删除非中国人才: {len(delete_ids)}")
        import uuid
        del_uuids = [uuid.UUID(x) for x in delete_ids]
        now = datetime.utcnow()
        updated = db.query(Person).filter(
            Person.id.in_(del_uuids), Person.deleted_at.is_(None)
        ).update({"deleted_at": now}, synchronize_session=False)
        logger.info(f"已软删除人才: {updated}")

        # 3. 删除涉及已删除人才的关系（分批，避免 SQLite 变量超限）
        BATCH = 400
        rel_count = 0
        ev_count = 0
        for i in range(0, len(del_uuids), BATCH):
            chunk = del_uuids[i:i + BATCH]
            rels = db.query(Relationship).filter(
                (Relationship.person_a_id.in_(chunk)) | (Relationship.person_b_id.in_(chunk))
            ).all()
            rel_ids = [r.id for r in rels]
            if rel_ids:
                db.query(RelationshipEvidence).filter(RelationshipEvidence.relationship_id.in_(rel_ids)).delete(synchronize_session=False)
                db.query(Relationship).filter(Relationship.id.in_(rel_ids)).delete(synchronize_session=False)
                rel_count += len(rel_ids)
                ev_count += len(rel_ids)
            db.commit()
        logger.info(f"删除涉及非中国人才的关系: {rel_count}")

        # 4. 删除涉及已删除人才的论文作者链接（分批）
        pa_count = 0
        for i in range(0, len(del_uuids), BATCH):
            chunk = del_uuids[i:i + BATCH]
            n = db.query(PaperAuthor).filter(PaperAuthor.person_id.in_(chunk)).delete(synchronize_session=False)
            pa_count += n
            db.query(Experience).filter(Experience.person_id.in_(chunk)).delete(synchronize_session=False)
            db.query(Contact).filter(Contact.person_id.in_(chunk)).delete(synchronize_session=False)
            db.query(OutreachRecord).filter(OutreachRecord.person_id.in_(chunk)).delete(synchronize_session=False)
            db.query(ProjectContributor).filter(ProjectContributor.person_id.in_(chunk)).delete(synchronize_session=False)
            db.commit()
        logger.info(f"删除非中国人才的论文作者链接: {pa_count}")

        # 5. 删除已无任何作者的孤立论文（分批）
        valid_paper_ids = set(str(r[0]) for r in db.query(PaperAuthor.paper_id).distinct().all())
        all_paper_ids = [str(r[0]) for r in db.query(Paper.id).all()]
        orphan = [pid for pid in all_paper_ids if pid not in valid_paper_ids]
        orphan_count = 0
        for i in range(0, len(orphan), BATCH):
            chunk = [uuid.UUID(x) for x in orphan[i:i + BATCH]]
            n = db.query(Paper).filter(Paper.id.in_(chunk)).delete(synchronize_session=False)
            orphan_count += n
            db.commit()
        logger.info(f"删除孤立论文(无中国作者): {orphan_count}")

        # 统计结果
        cn_persons = db.query(Person).filter(Person.deleted_at.is_(None)).count()
        papers = db.query(Paper).count()
        rels = db.query(Relationship).count()
        pa = db.query(PaperAuthor).count()
        logger.info("=" * 50)
        logger.info("清理完成！")
        logger.info(f"  中国人才: {cn_persons}")
        logger.info(f"  论文: {papers}")
        logger.info(f"  关系: {rels}")
        logger.info(f"  论文作者链接: {pa}")
        logger.info("=" * 50)
    finally:
        db.close()


if __name__ == "__main__":
    clean()
