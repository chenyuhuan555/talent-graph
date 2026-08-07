"""将数据库中的真实数据导出为静态 JSON（使用原始 SQL 避免 Uuid 类型问题）。"""
from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from datetime import datetime

BACKEND_DIR = Path(__file__).resolve().parent.parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))
os.environ.setdefault("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'talent_graph.db'}")

from sqlalchemy import create_engine, text

DB_URL = os.environ["DATABASE_URL"]
engine = create_engine(DB_URL)

OUT = Path(__file__).resolve().parent / "static_data"
OUT.mkdir(exist_ok=True)


def q(sql, **params):
    with engine.connect() as conn:
        return [dict(r._mapping) for r in conn.execute(text(sql), params)]


def q1(sql, **params):
    rows = q(sql, **params)
    return rows[0] if rows else None


# 1. 看板统计
print("导出看板统计...")
total = q1("SELECT COUNT(*) AS c FROM persons WHERE deleted_at IS NULL")["c"]
papers = q1("SELECT COUNT(*) AS c FROM papers")["c"]
orgs = q1("SELECT COUNT(*) AS c FROM organizations WHERE deleted_at IS NULL")["c"]
rels = q1("SELECT COUNT(*) AS c FROM relationships")["c"]
domain_dist = q("SELECT primary_domain AS name, COUNT(*) AS value FROM persons WHERE deleted_at IS NULL AND primary_domain IS NOT NULL GROUP BY primary_domain ORDER BY value DESC")
top_schools = q("""SELECT o.name AS name, COUNT(p.id) AS value FROM persons p
    JOIN organizations o ON p.current_organization_id = o.id
    WHERE o.organization_type='university' AND p.deleted_at IS NULL
    GROUP BY o.id ORDER BY value DESC LIMIT 10""")
top_companies = q("""SELECT o.name AS name, COUNT(p.id) AS value FROM persons p
    JOIN organizations o ON p.current_organization_id = o.id
    WHERE o.organization_type='company' AND p.deleted_at IS NULL
    GROUP BY o.id ORDER BY value DESC LIMIT 10""")

dashboard = {
    "total_persons": total, "total_papers": papers, "total_orgs": orgs, "total_rels": rels,
    "domain_distribution": [{"name": d["name"] or "未分类", "value": d["value"]} for d in domain_dist],
    "top_schools": [{"name": s["name"], "value": s["value"]} for s in top_schools],
    "top_companies": [{"name": c["name"], "value": c["value"]} for c in top_companies],
    "source": "OpenAlex 真实公开数据 · 仅中国人才(CN/HK/TW/MO)",
}
json.dump(dashboard, open(OUT / "dashboard.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)

# 2. 人才列表（按论文数排序，前 300）
print("导出人才列表...")
person_rows = q("""SELECT p.id AS pid, p.chinese_name, p.english_name, p.current_position,
    p.primary_domain, p.talent_level, p.summary, p.country, p.source_type, p.location,
    o.name AS org_name, COUNT(pa.id) AS paper_count
    FROM persons p LEFT JOIN paper_authors pa ON pa.person_id = p.id
    LEFT JOIN organizations o ON p.current_organization_id = o.id
    WHERE p.deleted_at IS NULL GROUP BY p.id ORDER BY paper_count DESC LIMIT 300""")

persons_data = []
for r in person_rows:
    rel_count = q1("SELECT COUNT(*) AS c FROM relationships WHERE person_a_id = :id OR person_b_id = :id", id=r["pid"])["c"]
    score = None
    if r["summary"]:
        try:
            score = json.loads(r["summary"]).get("talent_score")
        except Exception:
            pass
    persons_data.append({
        "id": r["pid"], "name": r["chinese_name"] or r["english_name"] or "未知",
        "english_name": r["english_name"], "org": r["org_name"], "position": r["current_position"],
        "domain": r["primary_domain"], "level": r["talent_level"], "score": score,
        "paper_count": r["paper_count"], "rel_count": rel_count, "country": r["country"],
        "source_type": r["source_type"], "location": r["location"],
    })
json.dump(persons_data, open(OUT / "persons.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"  导出 {len(persons_data)} 个人才")

# 3. 人才详情 + 关系图（前 100）
print("导出人才详情...")
details = {}
for p_data in persons_data[:100]:
    pid = p_data["id"]
    # 经历
    exps = q("""SELECT e.experience_type, e.title, e.start_date, e.end_date, e.is_current,
        o.name AS org_name FROM experiences e LEFT JOIN organizations o ON e.organization_id = o.id
        WHERE e.person_id = :pid ORDER BY e.start_date DESC""", pid=pid)
    experiences = [{"type": e["experience_type"], "title": e["title"], "org": e["org_name"],
                    "start": str(e["start_date"]) if e["start_date"] else None,
                    "end": str(e["end_date"]) if e["end_date"] else None,
                    "current": e["is_current"]} for e in exps]
    # 论文
    papers_list = q("""SELECT pa.author_order, p.title, p.venue, p.publication_date, p.citation_count, p.source_url
        FROM paper_authors pa JOIN papers p ON pa.paper_id = p.id WHERE pa.person_id = :pid
        ORDER BY p.citation_count DESC""", pid=pid)
    paper_list = [{"title": p["title"], "venue": p["venue"],
                   "date": str(p["publication_date"]) if p["publication_date"] else None,
                   "citations": p["citation_count"], "url": p["source_url"]} for p in papers_list]
    # 关系
    rel_rows = q("""SELECT r.id AS rid, r.relationship_type, r.relationship_strength, r.score,
        r.is_verified, r.person_a_id, r.person_b_id,
        (SELECT COUNT(*) FROM relationship_evidence re WHERE re.relationship_id = r.id) AS ev_count
        FROM relationships r WHERE r.person_a_id = :pid OR r.person_b_id = :pid
        ORDER BY r.score DESC LIMIT 20""", pid=pid)
    nodes = [{"id": pid, "label": p_data["name"], "type": "person", "domain": p_data["domain"],
              "org": p_data["org"], "is_center": True}]
    edges = []
    for r in rel_rows:
        other_id = r["person_b_id"] if r["person_a_id"] == pid else r["person_a_id"]
        other = q1("""SELECT chinese_name, english_name, primary_domain, current_organization_id FROM persons WHERE id = :id""", id=other_id)
        if not other:
            continue
        other_org = None
        if other["current_organization_id"]:
            o = q1("SELECT name FROM organizations WHERE id = :id", id=other["current_organization_id"])
            if o:
                other_org = o["name"]
        nodes.append({"id": other_id, "label": other["chinese_name"] or other["english_name"] or "未知",
                      "type": "person", "domain": other["primary_domain"], "org": other_org})
        edges.append({"source": pid, "target": other_id, "type": r["relationship_type"],
                      "score": float(r["score"] or 0), "strength": r["relationship_strength"],
                      "is_verified": bool(r["is_verified"]), "evidence_count": r["ev_count"]})
    details[pid] = {"info": p_data, "experiences": experiences, "papers": paper_list,
                    "graph": {"nodes": nodes, "edges": edges}}
json.dump(details, open(OUT / "details.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"  导出 {len(details)} 个人才详情")

# 4. 数据源状态
sync = {"openalex": {"count": total, "last_sync": datetime.utcnow().isoformat()},
        "totals": {"persons": total, "papers": papers, "organizations": orgs, "relationships": rels}}
json.dump(sync, open(OUT / "sync.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)

print(f"\n导出完成！文件位于: {OUT}")
print(f"  dashboard.json  ({total} 人才统计)")
print(f"  persons.json    ({len(persons_data)} 人才列表)")
print(f"  details.json    ({len(details)} 人才详情)")
print(f"  sync.json       (数据源状态)")
