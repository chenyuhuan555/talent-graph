"""Hugging Face 采集器 —— 发现模型开发者。

API: https://huggingface.co/api
获取热门模型及其作者。
"""
from __future__ import annotations

import logging
import time

import httpx

from config.settings import settings

logger = logging.getLogger("data_pipeline.huggingface")


class HuggingFaceCollector:
    def __init__(self):
        self.client = httpx.Client(timeout=30.0, headers={"User-Agent": "AI-Talent-Graph/1.0"})

    def list_models(self, limit: int = 100, sort: str = "downloads") -> list[dict]:
        """获取热门模型列表。"""
        time.sleep(0.5)
        params = {"limit": limit, "sort": sort, "direction": -1, "full": "true"}
        resp = self.client.get(f"{settings.HF_API}/models", params=params)
        resp.raise_for_status()
        models = []
        for m in resp.json():
            tags = m.get("tags") or []
            models.append({
                "model_id": m.get("modelId") or m.get("_id"),
                "author": m.get("author"),
                "downloads": m.get("downloads", 0),
                "likes": m.get("likes", 0),
                "tags": tags,
                "pipeline_tag": m.get("pipeline_tag"),
                "url": f"https://huggingface.co/{m.get('modelId', '')}",
                "last_modified": m.get("lastModified"),
            })
        logger.info(f"HuggingFace 获取 {len(models)} 个模型")
        return models

    def list_datasets(self, limit: int = 50) -> list[dict]:
        time.sleep(0.5)
        params = {"limit": limit, "sort": "downloads", "direction": -1}
        resp = self.client.get(f"{settings.HF_API}/datasets", params=params)
        resp.raise_for_status()
        return resp.json()

    def get_user(self, username: str) -> dict | None:
        time.sleep(0.5)
        resp = self.client.get(f"{settings.HF_API}/users/{username}")
        if resp.status_code != 200:
            return None
        d = resp.json()
        return {
            "username": d.get("name") or username,
            "fullname": d.get("fullname"),
            "org": d.get("type") == "org",
            "avatar_url": d.get("avatarUrl"),
        }

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
