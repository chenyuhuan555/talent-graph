"""GitHub 采集器 —— 发现工程型 AI 人才。

使用 GitHub API 搜索仓库，获取贡献者。
搜索关键词: transformer, llama, vllm, pytorch, langchain, diffusion 等
"""
from __future__ import annotations

import logging
import time

import httpx

from config.settings import settings

logger = logging.getLogger("data_pipeline.github")

SEARCH_REPOS = ["transformer", "llama", "vllm", "pytorch", "langchain", "diffusion", "large language model"]


class GitHubCollector:
    def __init__(self):
        headers = {"User-Agent": "AI-Talent-Graph/1.0", "Accept": "application/vnd.github+json"}
        if settings.GITHUB_TOKEN:
            headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
        self.client = httpx.Client(timeout=30.0, headers=headers)

    def search_repos(self, keyword: str, per_page: int = 20) -> list[dict]:
        """搜索仓库。"""
        time.sleep(2)  # GitHub 搜索 API 限流较严
        params = {"q": keyword, "sort": "stars", "order": "desc", "per_page": per_page}
        resp = self.client.get(f"{settings.GITHUB_API}/search/repositories", params=params)
        if resp.status_code == 403:
            logger.warning("GitHub 触发限流，等待 30s")
            time.sleep(30)
            resp = self.client.get(f"{settings.GITHUB_API}/search/repositories", params=params)
        resp.raise_for_status()
        data = resp.json()
        repos = []
        for r in data.get("items", []):
            repos.append({
                "name": r.get("name"),
                "full_name": r.get("full_name"),
                "url": r.get("html_url"),
                "stars": r.get("stargazers_count", 0),
                "forks": r.get("forks_count", 0),
                "language": r.get("language"),
                "description": r.get("description"),
                "owner": (r.get("owner") or {}).get("login"),
                "github_id": r.get("id"),
            })
        logger.info(f"GitHub 搜索 [{keyword}] 返回 {len(repos)} 个仓库")
        return repos

    def get_contributors(self, full_name: str, per_page: int = 30) -> list[dict]:
        """获取仓库贡献者。"""
        time.sleep(2)
        resp = self.client.get(f"{settings.GITHUB_API}/repos/{full_name}/contributors", params={"per_page": per_page})
        if resp.status_code == 403:
            logger.warning("GitHub 限流，等待 30s")
            time.sleep(30)
            resp = self.client.get(f"{settings.GITHUB_API}/repos/{full_name}/contributors", params={"per_page": per_page})
        if resp.status_code != 200:
            return []
        contribs = []
        for c in resp.json():
            contribs.append({
                "username": c.get("login"),
                "github_id": c.get("id"),
                "contributions": c.get("contributions", 0),
                "profile_url": c.get("html_url"),
                "avatar_url": c.get("avatar_url"),
            })
        return contribs

    def get_user(self, username: str) -> dict | None:
        """获取用户详情（姓名/公司）。"""
        time.sleep(2)
        resp = self.client.get(f"{settings.GITHUB_API}/users/{username}")
        if resp.status_code != 200:
            return None
        d = resp.json()
        return {
            "username": d.get("login"),
            "name": d.get("name"),
            "company": d.get("company"),
            "location": d.get("location"),
            "bio": d.get("bio"),
            "followers": d.get("followers", 0),
            "profile_url": d.get("html_url"),
            "avatar_url": d.get("avatar_url"),
        }

    def close(self):
        self.client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()
