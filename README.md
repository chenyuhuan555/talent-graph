# Talent Graph

面向公司内部少量成员使用的人工智能人才关系库。前端以 GitHub Pages 静态发布；身份认证、权限控制和业务数据由 Supabase 承担。

## 架构

- GitHub Pages：只发布静态前端，不包含业务数据、数据库文件或服务端密钥。
- Supabase Auth：内部用户名和密码登录；用户名只在客户端转换为内部身份标识，不展示给其他成员。
- Supabase Postgres + RLS：在线业务数据、角色权限与审计记录。
- Supabase Edge Function：仅管理员可创建、停用成员。

首期包含人才、机构、岗位、关系、触达、数据审核、成员管理、审计和受限业务导出；简历导入与自动数据同步不在首期发布范围。

## 本地运行

需要 Node.js 22 与 Python 3.11+。

```powershell
Copy-Item frontend\.env.example frontend\.env.local
Set-Location frontend
npm ci
npm run dev
```

在 `frontend/.env.local` 中只填写以下公开变量：

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
```

不要将 Supabase secret key、数据库连接串、SQLite 文件、快照、导出文件或任何业务数据提交到 Git。

## 检查与构建

```powershell
Set-Location frontend
npm test
npm run typecheck
npm run build
npm audit --audit-level=moderate
Set-Location ..
& .\.migration-venv\Scripts\python.exe -m pytest tools\tests tools\migration\tests -q
python tools\repo_guard.py --repo . --tracked --artifact frontend\out
```

`frontend/out` 是可部署的 GitHub Pages 产物。构建产物检查会阻止数据库、业务 JSON、PostgreSQL 连接串及 secret key 被打包。

## 发布

GitHub Actions 工作流在 `main` 分支推送或手动触发时执行。请在 GitHub 仓库的 Actions Variables 中设置：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

将 Pages 发布源设置为 **GitHub Actions**。完整的 Supabase 创建、迁移、验证、回滚与密钥轮换流程见 [上线手册](docs/operations/supabase-pages-runbook.md)。
