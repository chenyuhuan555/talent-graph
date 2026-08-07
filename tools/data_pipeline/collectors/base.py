"""采集器基类与 HTTP 客户端。"""
from __future__ import annotations

import time
import logging
from typing import Any

import httpx

logger = logging.getLogger("data_pipeline")

UA = "AI-Talent-Graph/1.0 (mailto:research@example.com)"


class BaseCollector:
    """带限流与重试的 HTTP 基类。"""

    def __init__(self, base_url: str, delay: float = 0.3, timeout: float = 30.0):
        self.base_url = base_url.rstrip("/")
        self.delay = delay
        self.client = httpx.Client(
            base_url=self.base_url,
            timeout=timeout,
            headers={"User-Agent": UA, "Accept": "application/json"},
        )

    def get(self, path: str, params: dict | None = None) -> dict:
        for attempt in range(3):
            try:
                time.sleep(self.delay)  # 限流，礼貌访问
                resp = self.client.get(path, params=params)
                if resp.status_code == 429:
                    logger.warning("触发限流，等待 10s…")
                    time.sleep(10)
                    continue
                resp.raise_for_status()
                return resp.json()
            except Exception as e:
                logger.warning(f"请求失败({attempt+1}/3) {path}: {e}")
                if attempt == 2:
                    raise
                time.sleep(2)
        return {}

    def get_text(self, path: str, params: dict | None = None) -> str:
        for attempt in range(3):
            try:
                time.sleep(self.delay)
                resp = self.client.get(path, params=params)
                resp.raise_for_status()
                return resp.text
            except Exception as e:
                logger.warning(f"请求失败({attempt+1}/3) {path}: {e}")
                if attempt == 2:
                    return ""
                time.sleep(2)
        return ""

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
