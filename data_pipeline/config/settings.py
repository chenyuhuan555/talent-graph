"""数据采集管道配置。复用后端数据库与模型。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# 让 data_pipeline 能导入后端 app 模块
# settings.py 位于 data_pipeline/config/settings.py，需上溯三级到项目根
BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

def normalize_database_url(value: str) -> str:
    """Make a Supabase Postgres URI usable by SQLAlchemy with psycopg 3."""
    if value.startswith("postgresql://"):
        return "postgresql+psycopg://" + value[len("postgresql://"):]
    return value


# In the Supabase deployment, prefer the explicitly named pipeline variable;
# keep DATABASE_URL and the local SQLite default for backwards compatibility.
_DB_PATH = BACKEND_DIR / "talent_graph.db"
_configured_database_url = os.getenv("SUPABASE_DB_URL") or os.getenv("DATABASE_URL") or f"sqlite:///{_DB_PATH}"
os.environ.setdefault("DATABASE_URL", normalize_database_url(_configured_database_url))


class Settings:
    # 数据库（默认与后端共用 SQLite；生产用 Postgres 通过环境变量切换）
    # 路径指向 backend/talent_graph.db（复用后端数据库，不重建）
    _DB_PATH = BACKEND_DIR / "talent_graph.db"
    DATABASE_URL: str = normalize_database_url(os.getenv("DATABASE_URL", f"sqlite:///{_DB_PATH}"))

    # OpenAlex
    OPENALEX_BASE: str = "https://api.openalex.org"
    OPENALEX_EMAIL: str = os.getenv("OPENALEX_EMAIL", "research@example.com")  # polite pool
    OPENALEX_PER_PAGE: int = 50
    OPENALEX_MAX_WORKS: int = int(os.getenv("OPENALEX_MAX_WORKS", "600"))  # 初始导入上限

    # arXiv
    ARXIV_BASE: str = "http://export.arxiv.org/api/query"
    ARXIV_MAX: int = int(os.getenv("ARXIV_MAX", "200"))

    # GitHub（无 token 也能用，但有速率限制）
    GITHUB_TOKEN: str = os.getenv("GITHUB_TOKEN", "")
    GITHUB_API: str = "https://api.github.com"

    # Hugging Face
    HF_API: str = "https://huggingface.co/api"

    # DBLP
    DBLP_BASE: str = "https://dblp.org/search"

    # 搜索关键词
    SEARCH_KEYWORDS = [
        "large language model",
        "generative AI",
        "foundation model",
        "multimodal learning",
        "AI agent",
        "machine learning",
        "deep learning",
        "natural language processing",
        "computer vision",
        "AI infrastructure",
    ]

    # arXiv 分类
    ARXIV_CATEGORIES = ["cs.AI", "cs.CL", "cs.LG", "cs.CV", "cs.IR"]

    # 重点会议（顶会判断）
    TOP_VENUES = {
        "neurips", "nips", "icml", "iclr", "acl", "emnlp", "cvpr",
        "aaai", "ijcai", "iccv", "eccv", "naacl", "coling", "mlsys",
    }

    # 方向关键词映射
    DOMAIN_KEYWORDS = {
        "大模型": ["large language model", "llm", "foundation model", "generative ai",
                   "pretrain", "pre-train", "fine-tun", "alignment", "rlhf", "rag",
                   "agent", "instruction tun", "chatgpt", "gpt", "transformer"],
        "多模态": ["multimodal", "multi-modal", "vision-language", "vision language",
                   "text-to-image", "text to image", "diffusion", "clip", "image generation",
                   "video generation", "visual question", "vqa"],
        "AI Infra": ["distributed training", "inference", "gpu", "accelerat",
                      "model compression", "quantiz", "distill", "kernel",
                      "training framework", "serving", "infrastructure", "scalab"],
    }

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


settings = Settings()
