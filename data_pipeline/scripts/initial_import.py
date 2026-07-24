"""初始导入脚本 —— 从 OpenAlex 采集真实数据并写入数据库。

用法:
    cd data_pipeline
    PYTHONPATH=. python scripts/initial_import.py [--max 600] [--keywords "large language model,multimodal"]

目标: 人才 1000+ / 论文 5000+ / 机构 300+ / 关系 20000+
"""
from __future__ import annotations

import argparse
import json
import logging
import sys
import time
from collections import defaultdict
from datetime import datetime

from config.settings import settings, BACKEND_DIR
# 确保后端可导入
sys.path.insert(0, str(BACKEND_DIR))

from collectors.openalex import OpenAlexCollector
from processors.entity_extract import classify_paper
from services.import_service import (
    get_session, upsert_paper, upsert_person, upsert_organization,
    db_stats,
)
# 复用后端建表
from app.core.database import Base, engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("initial_import")


def run(max_works: int, keywords: list[str] | None = None):
    keywords = keywords or settings.SEARCH_KEYWORDS
    logger.info("=" * 60)
    logger.info("OpenAlex 初始导入开始")
    logger.info(f"关键词: {keywords}")
    logger.info(f"每个关键词上限: {max_works} 篇")
    logger.info("=" * 60)

    # Supabase schema is managed by migrations. Keep the local SQLite
    # convenience for legacy development, but never attempt to create or
    # alter the production schema from a crawler run.
    if settings.is_sqlite:
        Base.metadata.create_all(bind=engine)

    collector = OpenAlexCollector()
    db = get_session()

    stats = {"works": 0, "persons": set(), "orgs": set(), "errors": 0}
    per_keyword = max_works

    try:
        for kw in keywords:
            kw_count = 0
            logger.info(f">>> 开始采集关键词: [{kw}]")
            for work in collector.search_works(kw, max_results=per_keyword):
                try:
                    # 方向分类
                    primary, sub_domains = classify_paper(work)
                    if primary:
                        work["domains"] = sub_domains
                    else:
                        # 不属于首期方向的论文跳过（但仍记录少量以丰富数据）
                        work["domains"] = []

                    paper = upsert_paper(db, work, source_type="OpenAlex")
                    db.commit()
                    stats["works"] += 1
                    kw_count += 1

                    # 记录作者用于统计
                    for au in work.get("authorships", []):
                        if au.get("openalex_id"):
                            stats["persons"].add(au["openalex_id"])
                        for ins in au.get("institutions", []):
                            if ins.get("name"):
                                stats["orgs"].add(ins["name"])

                    if stats["works"] % 50 == 0:
                        st = db_stats(db)
                        logger.info(f"  进度: 已处理 {stats['works']} 篇 | "
                                    f"DB 人才 {st['persons']} 论文 {st['papers']} 机构 {st['organizations']} 论文作者 {st['paper_authors']}")
                except Exception as e:
                    stats["errors"] += 1
                    db.rollback()
                    logger.warning(f"  论文处理失败: {e}")
                    continue
            logger.info(f"<<< [{kw}] 完成，采集 {kw_count} 篇")

        # 最终统计
        final = db_stats(db)
        logger.info("=" * 60)
        logger.info("导入完成！数据库统计:")
        logger.info(f"  人才:   {final['persons']}")
        logger.info(f"  论文:   {final['papers']}")
        logger.info(f"  机构:   {final['organizations']}")
        logger.info(f"  论文作者关系: {final['paper_authors']}")
        logger.info(f"  来源记录: {final['source_records']}")
        logger.info(f"  处理错误: {stats['errors']}")
        logger.info("=" * 60)
        return final
    finally:
        db.close()
        collector.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="OpenAlex 初始导入")
    parser.add_argument("--max", type=int, default=200, help="每个关键词最大论文数（默认200）")
    parser.add_argument("--keywords", type=str, default=None, help="逗号分隔的关键词，覆盖默认")
    args = parser.parse_args()

    kws = args.keywords.split(",") if args.keywords else None
    run(max_works=args.max, keywords=kws)
