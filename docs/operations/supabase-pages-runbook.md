# Talent Graph 上线手册

本手册用于将 Talent Graph 发布给公司内部少量成员。业务数据只能保留在 Supabase；GitHub、Git 历史和 Pages 产物不得包含业务数据、数据库连接串或 Supabase secret key。

## 1. 创建 Supabase 项目

1. 在 Supabase 控制台的新项目页面创建 `talent-graph`，区域选择新加坡 `ap-southeast-1`。
2. 生成唯一数据库密码并保存到密码管理器；不要写入聊天、仓库或 `.env.local`。
3. 记录非敏感的 Project Ref、项目 URL 和 publishable key。
4. 在 Auth 设置中确认关闭公开注册（Disable signups）。
5. 确认 Database、Auth 和 Storage 均为健康状态。

## 2. 应用后端

在仓库根目录执行。`SUPABASE_DB_URL`、`SUPABASE_SECRET_KEY` 只在当前终端会话设置，用后立刻清除。

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref $env:SUPABASE_PROJECT_REF
npx supabase@latest db push --linked

$env:ALLOWED_ORIGINS = 'http://localhost:3000,https://<github-user>.github.io'
npx supabase@latest secrets set ALLOWED_ORIGINS=$env:ALLOWED_ORIGINS --project-ref $env:SUPABASE_PROJECT_REF
npx supabase@latest functions deploy manage-member --project-ref $env:SUPABASE_PROJECT_REF
```

保持 `manage-member` 的 JWT 验证开启。函数还会再次验证调用者是否为活跃管理员。

运行远端 SQL 合约检查；所有合约在事务中回滚测试数据：

```powershell
$env:SUPABASE_DB_URL = '<password-manager connection string>'
& .\.migration-venv\Scripts\python.exe -m tools.migration.run_sql_contracts
```

交互式创建第一个管理员：

```powershell
$env:SUPABASE_URL = 'https://<project-ref>.supabase.co'
$env:SUPABASE_SECRET_KEY = '<secret key from password manager>'
& .\.migration-venv\Scripts\python.exe -m tools.migration.bootstrap_admin
Remove-Item Env:SUPABASE_SECRET_KEY
```

确认只有一个活跃管理员 profile 后，再继续迁移。

## 3. 创建快照、迁移与验证

迁移前先生成 SQLite 一致性快照。源库只读，不直接操作原文件。

```powershell
& .\.migration-venv\Scripts\python.exe -m tools.migration.snapshot <sqlite-source-path> --output backups\sqlite
$env:SQLITE_SNAPSHOT = '<generated .sqlite3 path>'
$env:SUPABASE_ADMIN_ID = '<initial admin UUID>'

# 先做不写入远端的预演
& .\.migration-venv\Scripts\python.exe -m tools.migration.migrate $env:SQLITE_SNAPSHOT --admin-id $env:SUPABASE_ADMIN_ID --dry-run

# 导出空远端基线到忽略目录
& .\.migration-venv\Scripts\python.exe -m tools.migration.export_remote

# 写入迁移，然后逐表核验
& .\.migration-venv\Scripts\python.exe -m tools.migration.migrate $env:SQLITE_SNAPSHOT --admin-id $env:SUPABASE_ADMIN_ID
& .\.migration-venv\Scripts\python.exe -m tools.migration.verify $env:SQLITE_SNAPSHOT --admin-id $env:SUPABASE_ADMIN_ID --json-output reports\migration\verification.json
& .\.migration-venv\Scripts\python.exe -m tools.migration.verify_roles
```

记录迁移时间、行数、区域和通过/失败结果即可；报告、快照、UUID 样本、姓名和联系方式均不得提交。

## 4. 配置 GitHub Pages

1. 创建公开仓库 `talent-graph`，不要让 GitHub 生成 README、许可证或 `.gitignore`。
2. 在仓库 Actions Variables（不是 Secrets）中设置：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
3. 在 Pages 设置中将 Source 设为 **GitHub Actions**。
4. 更新 `ALLOWED_ORIGINS`，加入精确的 Pages origin：`https://<github-user>.github.io`。
5. 推送 `main` 分支，等待 Pages 工作流中的类型检查、构建、产物检查和部署全部通过。

发布前与发布后检查：

```powershell
Set-Location frontend
npm test
npm run typecheck
npm run build
Set-Location ..
python tools\repo_guard.py --repo . --tracked --artifact frontend\out
```

访问 `https://<github-user>.github.io/talent-graph/login/`，确认：登录页可见、未登录不会加载业务数据、管理员能登录、非管理员看不到成员和审计入口、退出后返回登录页。

## 5. 回滚、停用与轮换

- Pages 回滚：在 GitHub Actions 的旧成功部署中重新部署上一份 artifact；随后检查登录页和控制台错误。
- 数据迁移回滚：保留当前 Supabase 数据，不执行破坏性删除；使用迁移前的远端基线和 SQLite 快照进行人工恢复评估。
- 停用成员：管理员在成员管理页确认姓名后停用；现有会话会在下一次权限校验时失去数据访问权。
- 轮换 secret key：在 Supabase 控制台轮换后，更新本地密码管理器和当前终端会话；不要放入 GitHub Variables 或前端环境变量。重新部署 `manage-member` 并验证管理员创建与停用功能。
- 远端备份：迁移前、批量导入后、恢复前运行 `python -m tools.migration.export_remote`；备份目录保持忽略状态并存放在受控加密位置。

## 6. 部署记录

每次发布仅记录：日期时间、操作者、Project Ref、区域、迁移计数、角色核验结果、Pages 版本和回滚版本。不要记录密钥、连接串、业务对象、联系方式或导出内容。
