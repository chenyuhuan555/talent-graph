"""arXiv 采集器 —— 发现最新 AI 人才。

API: http://export.arxiv.org/api/query (Atom XML feed)
分类: cs.AI cs.CL cs.LG cs.CV cs.IR
每日任务: 获取过去 24 小时论文。
"""
from __future__ import annotations

import logging
from datetime import datetime, date
from xml.etree import ElementTree as ET

import httpx

from config.settings import settings

logger = logging.getLogger("data_pipeline.arxiv")

NS = {"atom": "http://www.w3.org/2005/Atom", "arxiv": "http://arxiv.org/schemas/atom"}


class ArxivCollector:
    def __init__(self):
        self.client = httpx.Client(timeout=30.0, headers={"User-Agent": "AI-Talent-Graph/1.0"})

    def fetch_latest(self, max_results: int | None = None) -> list[dict]:
        """获取最新 AI 论文。"""
        max_results = max_results or settings.ARXIV_MAX
        cats = "+OR+".join(f"cat:{c}" for c in settings.ARXIV_CATEGORIES)
        params = {
            "search_query": cats,
            "start": 0,
            "max_results": max_results,
            "sortBy": "submittedDate",
            "sortOrder": "descending",
        }
        # 限流：arXiv 要求每 3 秒最多 1 请求
        import time
        time.sleep(3)
        resp = self.client.get(settings.ARXIV_BASE, params=params)
        resp.raise_for_status()
        return self._parse(resp.text)

    def _parse(self, xml_text: str) -> list[dict]:
        root = ET.fromstring(xml_text)
        works = []
        for entry in root.findall("atom:entry", NS):
            arxiv_url = (entry.find("atom:id", NS).text or "").strip()
            arxiv_id = arxiv_url.rstrip("/").split("/")[-1]
            title_el = entry.find("atom:title", NS)
            title = (title_el.text or "").strip().replace("\n", " ") if title_el is not None else ""
            summary_el = entry.find("atom:summary", NS)
            abstract = (summary_el.text or "").strip().replace("\n", " ") if summary_el is not None else ""
            published_el = entry.find("atom:published", NS)
            published = published_el.text[:10] if published_el is not None else None

            authors = []
            for author in entry.findall("atom:author", NS):
                name_el = author.find("atom:name", NS)
                if name_el is not None and name_el.text:
                    authors.append(name_el.text.strip())

            # arxiv 链接与 PDF
            pdf_url = None
            for link in entry.findall("atom:link", NS):
                if link.get("title") == "pdf":
                    pdf_url = link.get("href")

            # 分类
            categories = [c.get("term") for c in entry.findall("{http://arxiv.org/schemas/atom}primary_category")]
            if not categories:
                categories = [c.get("term") for c in entry.findall("atom:category", NS)]

            works.append({
                "arxiv_id": arxiv_id,
                "title": title,
                "abstract": abstract,
                "publication_date": published,
                "venue": "arXiv",
                "citation_count": 0,
                "topics": categories,
                "authorships": [{"name": a, "openalex_id": None, "orcid": None,
                                 "institutions": [], "author_position": None,
                                 "is_corresponding": False, "raw_name": a} for a in authors],
                "source_url": arxiv_url,
                "domains": [],
            })
        logger.info(f"arXiv 采集 {len(works)} 篇最新论文")
        return works

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
