"""数据采集管道配置。复用后端数据库与模型。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# 让 data_pipeline 能导入后端 app 模块
# settings.py 位于 tools/data_pipeline/config/settings.py；采集器使用的
# 最小模型包位于 tools/crawler_backend/app。
BACKEND_DIR = Path(__file__).resolve().parents[2] / "crawler_backend"
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

    # 顶层领域 -> 采集关键词（与前端 frontend/lib/domains.ts 保持一致）
    # key 为 persons.industry 中文枚举值；AI 为默认领域。
    INDUSTRY_KEYWORDS: dict[str, list[str]] = {
        "人工智能": [
            "large language model", "multimodal AI", "AI agent", "AI infrastructure",
        ],
        "量子计算": [
            "quantum computing", "quantum error correction", "quantum algorithm", "qubit",
        ],
        "生物医药": [
            "drug discovery", "bioinformatics", "genomics", "protein folding", "CRISPR",
        ],
        "具身智能": [
            "embodied AI", "robotics manipulation", "humanoid robot", "locomotion", "Sim2Real",
        ],
        "核聚变": [
            "nuclear fusion", "tokamak", "stellarator", "plasma physics", "inertial confinement",
        ],
        "新能源": [
            "solid state battery", "perovskite solar", "hydrogen energy", "energy storage", "EV battery",
        ],
    }

    # 领域 -> arXiv 分类（可选，采集时叠加）
    INDUSTRY_ARXIV_CATEGORIES: dict[str, list[str]] = {
        "人工智能": ["cs.AI", "cs.CL", "cs.LG", "cs.CV", "cs.IR"],
        "量子计算": ["quant-ph", "cs.ET"],
        "生物医药": ["q-bio", "cs.CE"],
        "具身智能": ["cs.RO", "cs.AI"],
        "核聚变": ["physics.plasm-ph", "nucl-th"],
        "新能源": ["physics.app-ph", "eess.IV"],
    }

    def keywords_for_industry(self, industry: str | None = None) -> list[str]:
        """返回指定领域的默认采集关键词；未知/空则回退到 AI 关键词。"""
        key = industry or "人工智能"
        return list(self.INDUSTRY_KEYWORDS.get(key, self.INDUSTRY_KEYWORDS["人工智能"]))

    @property
    def is_sqlite(self) -> bool:
        return self.DATABASE_URL.startswith("sqlite")


settings = Settings()
