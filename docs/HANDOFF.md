# Talent Graph 项目交接文档

## 1. 项目概况

- 项目名称：Talent Graph
- 用途：中国大陆公司内部少量成员使用的人才关系图谱工作台
- 前端部署：GitHub Pages
- 数据库：Supabase PostgreSQL
- 认证：Supabase Auth 用户名 + 密码（应用层将用户名映射为登录邮箱）
- 数据采集：GitHub Actions 手动触发，采集公开科研与技术数据后写入 Supabase
- 翻译：学校、公司、论文名称自动翻译为中文；姓名保持原文
- 代码仓库：[chenyuhuan555/talent-graph](https://github.com/chenyuhuan555/talent-graph)
- 生产站点：<https://chenyuhuan555.github.io/talent-graph/>
- Supabase 项目地址：<https://supabase.com/dashboard/project/quxnrprjefqrhgjxtpgp>

## 2. 当前目录与关键文件

工作目录：

```text
D:\yhccccc\2026-07-22-14-01-41\.worktrees\codex-talent-graph-supabase
```

关键目录：

```text
frontend/                         前端应用
supabase/functions/               Edge Functions
supabase/migrations/              数据库迁移 SQL
tools/migration/                  旧 SQLite 导入与验证工具
tools/crawler_backend/            采集器复用的最小后端模型
tools/data_pipeline/              OpenAlex 等数据采集与导入代码
.github/workflows/pages.yml       GitHub Pages 部署
.github/workflows/crawler.yml     一键采集工作流
```

重要采集文件：

- `tools/data_pipeline/scripts/initial_import.py`：采集并写入论文、人才、机构
- `tools/data_pipeline/collectors/openalex.py`：OpenAlex 采集器
- `tools/data_pipeline/services/import_service.py`：SQLAlchemy 写入层
- `tools/data_pipeline/tasks/daily_update.py`：关系和人才评分重建
- `.github/workflows/crawler.yml`：GitHub Actions 采集入口
- `supabase/functions/trigger-crawler/index.ts`：前端按钮触发 GitHub workflow

## 3. 已完成事项

1. 已创建独立 Supabase 项目，项目 ref 为 `quxnrprjefqrhgjxtpgp`。
2. 已完成 Supabase 数据库迁移、管理员账号创建、旧 SQLite 数据导入与验证。
3. 已完成前端登录与管理员权限控制。
4. 已完成名称中文翻译功能设计与迁移 SQL；姓名不翻译。
5. 已完成 GitHub Pages 部署流程。
6. 已完成前端“一键采集”按钮及 Supabase Edge Function 触发链路。
7. 已完成 GitHub Actions 采集工作流。
8. 已修复采集器目录被 `.gitignore` 排除的问题。最新相关提交为 `5780426`。

## 4. 必须配置的密钥

严禁把真实密码、Token 或连接串写进代码、文档、截图或聊天记录。

### 4.1 Supabase Edge Function Secret

位置：Supabase Dashboard → Edge Functions → Secrets

名称：

```text
GITHUB_ACTIONS_TOKEN
```

用途：允许 `trigger-crawler` 以 GitHub API 触发 `crawler.yml`。

### 4.2 GitHub Actions Repository Secret

位置：[GitHub Actions Secrets](https://github.com/chenyuhuan555/talent-graph/settings/secrets/actions)

名称必须完全一致：

```text
SUPABASE_DB_URL
```

值：从 Supabase Connect → Session Pooler 复制的完整 PostgreSQL 连接串。不要保留 `[YOUR-PASSWORD]`，不要有多余空格或换行。

### 4.3 前端公开配置

前端只允许使用 Supabase 项目的公开 URL 和 publishable/anon key。绝不能把 service-role key、数据库连接串或 GitHub token 放入前端。

## 5. 一键采集流程

```text
前端导入页
  → trigger-crawler Edge Function
  → GitHub Actions workflow_dispatch
  → 安装 tools/data_pipeline/requirements.txt
  → OpenAlex 采集
  → SQLAlchemy 写入 Supabase PostgreSQL
  → 重建关系与人才评分
```

运行入口：[Run data crawler](https://github.com/chenyuhuan555/talent-graph/actions/workflows/crawler.yml)

可选参数：

- `max`：每个关键词最多采集的论文数。首次建议 10。
- `keywords`：逗号分隔关键词；留空使用默认关键词。

## 6. 当前已知故障与恢复方法

最近一次运行失败信息：

```text
ECIRCUITBREAKER: too many authentication failures,
new connections are temporarily blocked
```

含义：GitHub Actions 使用 `SUPABASE_DB_URL` 连接数据库时连续认证失败，Supabase 暂时封锁了新连接。通常原因是 GitHub Secret 中的连接串、用户名或数据库密码不正确。

恢复步骤：

1. 停止重复点击 Run workflow，等待约 10 分钟让临时封锁解除。
2. 在 Supabase Connect → Session Pooler 重新复制当前连接串。
3. 在 GitHub Actions Secrets 中编辑 `SUPABASE_DB_URL`，完整替换旧值。
4. 确认没有 `[YOUR-PASSWORD]`、多余空格、换行或错误的用户名。
5. 先用 `max=1` 做小规模验证。
6. 成功后再逐步增加到 `max=10` 或更高。

不要通过聊天发送连接串或密码；只在 Supabase 和 GitHub 的密钥输入框中操作。

## 7. 如何确认成功

GitHub Actions 中应按顺序看到：

1. `Check required database secret` 成功
2. `Install crawler dependencies` 成功
3. `Import public research data` 成功
4. `Rebuild relationships and talent scores` 成功

成功后，在网站刷新页面，检查论文、人才、机构和关系数量是否增加。若导入成功但页面仍显示旧数据，先退出登录再重新登录，并检查浏览器缓存。

## 8. 本地开发与验证

前端：

```powershell
npm test --prefix frontend
npm run typecheck --prefix frontend
npm run build --prefix frontend
```

采集器测试环境：

```powershell
$env:PYTHONPATH='tools;tools/data_pipeline;tools/crawler_backend'
& .\.migration-venv\Scripts\python.exe -m pytest tools/tests tools/migration/tests tools/data_pipeline/tests -q
```

不要在本地命令历史、`.env`、日志或提交中保存真实密钥。

## 9. 后续维护规则

- 数据库结构变更必须新增 Supabase migration，不要直接修改线上表结构后不留记录。
- 采集器写入必须继续使用 Supabase PostgreSQL，不能在 CI 中静默退回 SQLite。
- 任何 GitHub Actions 失败先看具体 step 的日志，不要只看 `exit code 1`。
- 大规模采集前先用小 `max` 验证连接和表结构。
- OpenAlex、GitHub、arXiv 等公开数据源可能限流；失败时降低批量并重试，不要高频重复触发。
- 生产部署以 `main` 分支为准，Pages 工作流成功后再验证线上地址。

## 10. 交接检查清单

- [ ] GitHub 仓库可访问
- [ ] GitHub Pages 地址可打开
- [ ] Supabase 项目可访问
- [ ] `GITHUB_ACTIONS_TOKEN` 已配置在 Supabase Edge Functions
- [ ] `SUPABASE_DB_URL` 已配置在 GitHub Actions Secrets
- [ ] 管理员账号可以登录
- [ ] 小规模采集成功
- [ ] 关系和人才评分重建成功
- [ ] 未将任何真实密钥写入仓库或文档
