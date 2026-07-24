"""定时任务 —— 使用 APScheduler。

- 每日 02:00 更新 arXiv
- 每日 03:00 更新 GitHub
- 每周日 更新 OpenAlex
- 每日 04:00 重建关系与评分
"""
from __future__ import annotations

import logging
import sys
from datetime import datetime

from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

import config.settings  # noqa: F401  确保 backend 路径已注入
from config.settings import settings, BACKEND_DIR
sys.path.insert(0, str(BACKEND_DIR))

logger = logging.getLogger("data_pipeline.scheduler")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s", datefmt="%H:%M:%S")


def update_arxiv():
    """每日 arXiv 论文更新。"""
    logger.info("=== 定时任务: arXiv 更新开始 ===")
    from collectors.arxiv import ArxivCollector
    from services.import_service import get_session, import_arxiv_works
    from processors.entity_extract import classify_paper

    collector = ArxivCollector()
    db = get_session()
    try:
        works = collector.fetch_latest(max_results=100)
        result = import_arxiv_works(db, works, source_type="arXiv")
        logger.info(f"arXiv 更新完成: 导入 {result['imported']} 篇")
    finally:
        db.close()
        collector.close()


def update_openalex():
    """每周 OpenAlex 人才更新。"""
    logger.info("=== 定时任务: OpenAlex 更新开始 ===")
    from collectors.openalex import OpenAlexCollector
    from services.import_service import get_session, upsert_paper
    from processors.entity_extract import classify_paper

    collector = OpenAlexCollector()
    db = get_session()
    cnt = 0
    try:
        for kw in settings.SEARCH_KEYWORDS[:5]:  # 每周取前 5 个关键词
            for work in collector.search_works(kw, max_results=50):
                try:
                    primary, sub = classify_paper(work)
                    work["domains"] = sub
                    upsert_paper(db, work, source_type="OpenAlex")
                    db.commit()
                    cnt += 1
                except Exception as e:
                    db.rollback()
                    logger.warning(f"OpenAlex 更新失败: {e}")
        logger.info(f"OpenAlex 更新完成: 导入 {cnt} 篇")
    finally:
        db.close()
        collector.close()


def update_github():
    """每日 GitHub 更新。"""
    logger.info("=== 定时任务: GitHub 更新开始 ===")
    from collectors.github import GitHubCollector, SEARCH_REPOS
    from services.import_service import get_session, import_github_repo

    collector = GitHubCollector()
    db = get_session()
    cnt = 0
    try:
        for kw in SEARCH_REPOS[:5]:
            try:
                repos = collector.search_repos(kw, per_page=5)
                for repo in repos:
                    contribs = collector.get_contributors(repo["full_name"], per_page=15)
                    _, n = import_github_repo(db, repo, contribs, source_type="GitHub")
                    cnt += n
            except Exception as e:
                logger.warning(f"GitHub [{kw}] 失败: {e}")
        logger.info(f"GitHub 更新完成: 新增 {cnt} 个贡献者关系")
    finally:
        db.close()
        collector.close()


def rebuild_relations_and_scores():
    """每日重建关系与评分。"""
    logger.info("=== 定时任务: 关系重建与评分 ===")
    from processors.relationship_builder import build_coauthor_relationships, build_same_organization_relationships
    from processors.talent_score import update_all_scores
    from services.import_service import get_session

    db = get_session()
    try:
        build_coauthor_relationships(db)
        build_same_organization_relationships(db)
        update_all_scores(db)
        logger.info("关系与评分更新完成")
    finally:
        db.close()


def run_scheduler():
    scheduler = BlockingScheduler(timezone="Asia/Shanghai")
    scheduler.add_job(update_arxiv, CronTrigger(hour=2, minute=0), id="arxiv_daily")
    scheduler.add_job(update_github, CronTrigger(hour=3, minute=0), id="github_daily")
    scheduler.add_job(rebuild_relations_and_scores, CronTrigger(hour=4, minute=0), id="relations_daily")
    scheduler.add_job(update_openalex, CronTrigger(day_of_week="sun", hour=1, minute=0), id="openalex_weekly")
    logger.info("定时任务调度器已启动:")
    logger.info("  02:00 arXiv 每日更新")
    logger.info("  03:00 GitHub 每日更新")
    logger.info("  04:00 关系与评分每日重建")
    logger.info("  周日 01:00 OpenAlex 每周更新")
    try:
        scheduler.start()
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()


if __name__ == "__main__":
    run_scheduler()
