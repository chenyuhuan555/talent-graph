"""DBLP 采集器 —— 计算机领域作者补充与消歧。

API: https://dblp.org/search (XML)
用途: 作者消歧、会议统计、顶会论文判断。
"""
from __future__ import annotations

import logging
import time
from xml.etree import ElementTree as ET

import httpx

from config.settings import settings

logger = logging.getLogger("data_pipeline.dblp")


class DBLPCollector:
    def __init__(self):
        self.client = httpx.Client(timeout=30.0, headers={"User-Agent": "AI-Talent-Graph/1.0"})

    def search_author(self, name: str) -> list[dict]:
        """搜索作者。"""
        time.sleep(1)
        resp = self.client.get(f"{settings.DBLP_BASE}/author/api", params={"q": name, "format": "xml", "h": 20})
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        authors = []
        for hit in root.findall(".//hit"):
            info = hit.find("info")
            if info is None:
                continue
            authors.append({
                "dblp_pid": (info.findtext("url") or "").split("/")[-1] if info.findtext("url") else None,
                "name": info.findtext("author"),
                "url": info.findtext("url"),
                "notes": info.findtext("notes"),
            })
        logger.info(f"DBLP 搜索作者 [{name}] 返回 {len(authors)} 条")
        return authors

    def search_publ(self, keyword: str, h: int = 30) -> list[dict]:
        """搜索论文。"""
        time.sleep(1)
        resp = self.client.get(f"{settings.DBLP_BASE}/publ/api", params={"q": keyword, "format": "xml", "h": h})
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
        publs = []
        for hit in root.findall(".//hit"):
            info = hit.find("info")
            if info is None:
                continue
            publs.append({
                "title": info.findtext("title"),
                "venue": info.findtext("venue"),
                "year": info.findtext("year"),
                "type": info.findtext("type"),
                "doi": info.findtext("doi"),
                "url": info.findtext("url"),
                "authors": [a.text for a in info.findall("authors/author")],
            })
        logger.info(f"DBLP 搜索论文 [{keyword}] 返回 {len(publs)} 条")
        return publs

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
