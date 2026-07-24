"""OpenAlex 采集器 —— 主要人才数据源。

采集：论文、作者、机构、研究方向。
API: https://api.openalex.org
"""
from __future__ import annotations

import logging
from typing import Iterator

from .base import BaseCollector
from config.settings import settings

logger = logging.getLogger("data_pipeline.openalex")


def reconstruct_abstract(inverted_index: dict | None) -> str:
    """OpenAlex 摘要以倒排索引存储，重建为文本。"""
    if not inverted_index:
        return ""
    positions: list[tuple[int, str]] = []
    for word, idxs in inverted_index.items():
        for i in idxs:
            positions.append((i, word))
    positions.sort()
    return " ".join(w for _, w in positions)


def extract_openalex_id(url: str | None) -> str | None:
    """从 https://openalex.org/W123456 提取 W123456。"""
    if not url:
        return None
    return url.rstrip("/").split("/")[-1]


class OpenAlexCollector(BaseCollector):
    def __init__(self):
        super().__init__(settings.OPENALEX_BASE, delay=0.25)
        self.params_extra = {"mailto": settings.OPENALEX_EMAIL}

    def search_works(self, keyword: str, per_page: int | None = None, max_results: int | None = None) -> Iterator[dict]:
        """按关键词搜索论文，分页迭代返回。只采集有中国（含港澳台）机构作者的论文。"""
        per_page = per_page or settings.OPENALEX_PER_PAGE
        max_results = max_results or settings.OPENALEX_MAX_WORKS
        cursor = "*"
        count = 0
        while count < max_results:
            params = {
                "search": keyword,
                "per-page": min(per_page, max_results - count),
                "cursor": cursor,
                "filter": "type:article,from_publication_date:2019-01-01,institutions.country_code:CN|HK|TW|MO",
                **self.params_extra,
            }
            data = self.get("/works", params=params)
            results = data.get("results", [])
            if not results:
                break
            for w in results:
                yield self._normalize_work(w)
                count += 1
                if count >= max_results:
                    break
            meta = data.get("meta", {})
            cursor = meta.get("next_cursor")
            if not cursor:
                break
        logger.info(f"OpenAlex 关键词 [{keyword}] 采集完成，共 {count} 篇")

    def get_author(self, author_id: str) -> dict | None:
        """获取作者详情。"""
        data = self.get(f"/authors/{author_id}", params=self.params_extra)
        if not data or "id" not in data:
            return None
        return self._normalize_author(data)

    def get_institution(self, institution_id: str) -> dict | None:
        data = self.get(f"/institutions/{institution_id}", params=self.params_extra)
        if not data or "id" not in data:
            return None
        return self._normalize_institution(data)

    def _normalize_work(self, w: dict) -> dict:
        """标准化论文。"""
        # 机构与作者
        authorships = []
        for au in w.get("authorships", []):
            author = au.get("author", {}) or {}
            insts = []
            for ins in au.get("institutions", []) or []:
                insts.append({
                    "openalex_id": extract_openalex_id(ins.get("id")),
                    "name": ins.get("display_name"),
                    "country": ins.get("country_code"),
                    "type": ins.get("type"),
                    "homepage": ins.get("ror"),
                })
            authorships.append({
                "openalex_id": extract_openalex_id(author.get("id")),
                "name": author.get("display_name"),
                "orcid": (author.get("orcid") or "").replace("https://orcid.org/", "") or None,
                "author_position": au.get("author_position"),
                "is_corresponding": au.get("is_corresponding_author", False),
                "raw_name": au.get("raw_author_name"),
                "institutions": insts,
            })

        # venue
        venue = None
        primary_loc = w.get("primary_location") or {}
        source = primary_loc.get("source") or {}
        if source:
            venue = source.get("display_name")

        # topics
        topics = [t.get("display_name") for t in (w.get("topics") or [])[:5] if t.get("display_name")]

        # ids
        ids = w.get("ids") or {}
        arxiv_id = None
        for m in (w.get("locations") or []):
            landing = (m.get("source") or {}).get("landing_page_url", "") or ""
            if "arxiv.org" in landing:
                arxiv_id = landing.rstrip("/").split("/")[-1]
                break

        return {
            "openalex_id": extract_openalex_id(w.get("id")),
            "doi": (w.get("doi") or "").replace("https://doi.org/", "") if w.get("doi") else None,
            "arxiv_id": arxiv_id,
            "title": w.get("title") or "",
            "abstract": reconstruct_abstract(w.get("abstract_inverted_index")),
            "publication_date": w.get("publication_date"),
            "venue": venue,
            "citation_count": w.get("cited_by_count", 0),
            "topics": topics,
            "authorships": authorships,
            "source_url": w.get("id"),
        }

    def _normalize_author(self, a: dict) -> dict:
        last_inst = a.get("last_known_institution") or {}
        return {
            "openalex_id": extract_openalex_id(a.get("id")),
            "name": a.get("display_name"),
            "orcid": (a.get("orcid") or "").replace("https://orcid.org/", "") or None,
            "works_count": a.get("works_count", 0),
            "cited_by_count": a.get("cited_by_count", 0),
            "last_institution": {
                "openalex_id": extract_openalex_id(last_inst.get("id")),
                "name": last_inst.get("display_name"),
                "country": last_inst.get("country_code"),
                "type": last_inst.get("type"),
            } if last_inst.get("id") else None,
            "topics": [t.get("display_name") for t in (a.get("topics") or [])[:5] if t.get("display_name")],
            "source_url": a.get("id"),
        }

    def _normalize_institution(self, i: dict) -> dict:
        return {
            "openalex_id": extract_openalex_id(i.get("id")),
            "name": i.get("display_name"),
            "english_name": i.get("display_name"),
            "country": i.get("country_code"),
            "type": i.get("type"),  # education/facility/company/etc
            "homepage": i.get("homepage_url"),
            "source_url": i.get("id"),
        }
