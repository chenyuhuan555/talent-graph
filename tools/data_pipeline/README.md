# Data Pipeline · 数据采集与处理系统

> 独立的数据采集系统，从公开科研和技术数据源获取真实 AI 人才数据，写入人才关系网数据库。
> 复用后端数据库与模型，不重建数据库。

## 数据源

| 数据源 | 用途 | API |
|---|---|---|
| **OpenAlex** | 主要人才/论文/机构数据源 | https://api.openalex.org |
| **arXiv** | 最新论文发现 | http://export.arxiv.org/api/query |
| **DBLP** | 作者消歧/顶会判断 | https://dblp.org/search |
| **GitHub** | 工程型人才/开源项目 | https://api.github.com |
| **Hugging Face** | 模型开发者 | https://huggingface.co/api |

## 数据流程

```
数据源(OpenAlex/arXiv/GitHub/HF)
  → 数据标准化(collectors)
  → 实体识别/方向分类(processors/entity_extract)
  → 人才去重(person_match: OpenAlex ID 40% + ORCID 30% + 机构 15% + 方向 10% + 姓名 5%)
  → 关系生成(relationship_builder: 共同论文/同机构)
  → 人才评分(talent_score: 论文40+引用20+顶会20+开源10+活跃10)
  → 写入现有数据库(services/import_service)
  → 网站展示
```

## 快速开始

```bash
# 1. 安装依赖（复用后端 venv）
pip install -r tools/data_pipeline/requirements.txt

# 2. 初始导入 OpenAlex 真实数据
PYTHONPATH=. python scripts/initial_import.py --max 150
# （10 个关键词 × 150 篇 = 1500 篇论文，约 8000+ 真实人才）

# 3. 生成关系
PYTHONPATH=. python -m processors.relationship_builder

# 4. 人才评分
PYTHONPATH=. python -m processors.talent_score

# 5. 启动定时任务（可选）
PYTHONPATH=. python -m tasks.daily_update
```

## Supabase 线上写入（当前部署）

本目录的采集器可以直接写入当前 Supabase 项目。请在 PowerShell 中从仓库根目录运行，
不要把连接串写入文件：

```powershell
$env:SUPABASE_DB_URL = '从 Supabase Connect 复制的 Session Pooler 连接串'
$env:PYTHONPATH = 'tools;tools/data_pipeline;tools/crawler_backend'

# 先用小批量验证
& .\.migration-venv\Scripts\python.exe -m data_pipeline.scripts.initial_import --max 10

# 验证无误后再扩大批量
& .\.migration-venv\Scripts\python.exe -m data_pipeline.scripts.initial_import --max 150
```

写入层按 OpenAlex/arXiv/GitHub/Hugging Face 的外部 ID 幂等处理，重复运行不会重复创建论文、
人才或机构。Supabase 的表结构由 `supabase/migrations` 管理，采集器不会自行建表或修改结构。
采集完成后可运行 `PYTHONPATH=tools;tools/data_pipeline;tools/crawler_backend python -m data_pipeline.tasks.daily_update` 重建关系和评分。

历史中文翻译仍使用仓库根目录的 `tools.migration.translate_existing`，它只处理中文字段为空的记录。

## 项目结构

```
tools/data_pipeline/
├── config/settings.py          # 配置（复用后端数据库）
├── collectors/
│   ├── base.py                 # HTTP 基类（限流/重试）
│   ├── openalex.py             # OpenAlex 采集器（论文/作者/机构）
│   ├── arxiv.py                # arXiv 采集器（每日最新论文）
│   ├── github.py               # GitHub 采集器（仓库/贡献者）
│   ├── huggingface.py          # HuggingFace 采集器（模型/作者）
│   └── dblp.py                 # DBLP 采集器（作者消歧）
├── processors/
│   ├── entity_extract.py       # 方向分类（大模型/多模态/AI Infra）
│   ├── person_match.py         # 人才去重（加权匹配）
│   ├── relationship_builder.py # 关系生成（共同论文/同机构）
│   └── talent_score.py         # 人才评分（S/A/B/C 等级）
├── services/
│   ├── import_service.py       # 写入现有数据库
│   └── data_sync_api.py        # 数据同步 API（备用，正式在后端）
├── tasks/
│   └── daily_update.py         # APScheduler 定时任务
├── scripts/
│   └── initial_import.py       # 初始导入脚本
└── requirements.txt
```

## 数据库映射

所有数据写入现有后端数据库表（不重建）：

| 采集数据 | 写入表 | 来源字段 |
|---|---|---|
| 论文 | `papers` | openalex_id / arxiv_id / doi |
| 人才 | `persons` + `person_external_ids` | source_type / openalex_id / orcid |
| 机构 | `organizations` | source_url / 类型映射 |
| 论文作者关系 | `paper_authors` | author_order / 机构 |
| 项目 | `projects` | github / huggingface |
| 项目贡献者 | `project_contributors` | role / contribution_score |
| 关系 | `relationships` | coauthor / colleague |
| 关系证据 | `relationship_evidence` | 论文标题/年份/链接 |
| 原始记录 | `source_records` | source_type / source_url / external_record_id / raw_data |

## 人才去重权重

```
OpenAlex ID  40%  （精确匹配即判定同一人）
ORCID        30%  （精确匹配即判定同一人）
机构         15%
研究方向     10%
姓名相似度    5%  （>=0.92 且同机构才合并，保守避免误合并）
```

## 关系生成规则

- **共同论文**：两人共同发表 ≥1 篇 → `coauthor`，基础分 40/篇（封顶 80）
- **同机构**：同属一个机构 → `colleague`，基础分 30
- 每条关系附带 `relationship_evidence`（论文标题/年份/链接）
- 系统推断关系（`is_inferred=True`），需人工确认

## 人才评分规则

| 维度 | 最高分 | 计算 |
|---|---:|---|
| 论文 | 40 | 对数缩放（论文数） |
| 引用 | 20 | 对数缩放（总引用数） |
| 顶会 | 20 | 每篇顶会 5 分 |
| GitHub 影响 | 10 | 项目贡献数 × 2 |
| 近期活跃 | 10 | 近 2 年论文 × 2 |

等级：S(85+) / A(70-84) / B(50-69) / C(<50)

## 定时任务

| 时间 | 任务 |
|---|---|
| 每日 02:00 | arXiv 最新论文更新 |
| 每日 03:00 | GitHub 仓库/贡献者更新 |
| 每日 04:00 | 关系重建与人才评分 |
| 每周日 01:00 | OpenAlex 人才每周更新 |

## 环境变量

```bash
DATABASE_URL=sqlite:///../crawler_backend/talent_graph.db  # 仅本地兼容模式
OPENALEX_EMAIL=your@email.com                      # OpenAlex polite pool
GITHUB_TOKEN=ghp_xxx                               # GitHub API（可选，提高速率限制）
OPENALEX_MAX_WORKS=600                             # 每关键词最大论文数
```

## 当前数据规模（真实数据 · 仅中国人才）

系统**只采集和保留中国人才**（含港澳台，country code: CN/HK/TW/MO）。

| 指标 | 数量 | 来源 |
|---|---:|---|
| 中国人才 | 6000+ | OpenAlex 中国机构作者 |
| 论文 | 1500+ | OpenAlex（有中国机构作者的论文） |
| 机构 | 2100+ | OpenAlex 中国机构 |
| 关系 | 28000+ | 共同论文 + 同机构 |
| 来源记录 | 11000+ | 全部可追溯 |

**数据过滤机制**：
- OpenAlex 采集：`filter=institutions.country_code:CN|HK|TW|MO`（只采集有中国机构作者的论文）
- 导入逻辑：只创建机构在中国的作者人才（跳过非中国机构作者）
- 清理脚本：`scripts/clean_non_chinese.py` 可清理已存在的非中国数据

所有数据均来自 OpenAlex 公开 API，每条记录保留 `source_records` 原始数据与来源链接。
