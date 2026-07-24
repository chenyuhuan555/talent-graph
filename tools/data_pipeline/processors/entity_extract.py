"""实体识别与方向分类。将论文/人才归类到大模型/多模态/AI Infra。"""
from __future__ import annotations

from config.settings import settings


def classify_domain(text: str) -> str | None:
    """根据文本关键词判断主方向。返回 大模型/多模态/AI Infra 或 None。"""
    if not text:
        return None
    low = text.lower()
    scores = {d: 0 for d in settings.DOMAIN_KEYWORDS}
    for domain, keywords in settings.DOMAIN_KEYWORDS.items():
        for kw in keywords:
            if kw in low:
                scores[domain] += 1
    best = max(scores, key=scores.get)
    return best if scores[best] > 0 else None


def classify_paper(work: dict) -> tuple[str | None, list[str]]:
    """对论文分类，返回 (主方向, 细分方向列表)。"""
    text = " ".join(filter(None, [work.get("title"), work.get("abstract"), " ".join(work.get("topics") or [])]))
    primary = classify_domain(text)
    # 多方向检测
    sub_domains: list[str] = []
    low = text.lower()
    for domain, keywords in settings.DOMAIN_KEYWORDS.items():
        if any(kw in low for kw in keywords):
            if domain not in sub_domains:
                sub_domains.append(domain)
    if primary and primary not in sub_domains:
        sub_domains.insert(0, primary)
    return primary, sub_domains


def is_top_venue(venue: str | None) -> bool:
    """判断是否顶会。"""
    if not venue:
        return False
    low = venue.lower()
    return any(v in low for v in settings.TOP_VENUES)
