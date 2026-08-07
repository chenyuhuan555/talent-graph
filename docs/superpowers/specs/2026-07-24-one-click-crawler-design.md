# 一键采集 Supabase 写入设计

## 目标

在网站“数据导入”页面增加管理员专用的“开始一键采集”按钮。点击后触发后台 GitHub Actions 任务，复用现有数据采集器，把新数据幂等写入 Supabase；数据库连接串和 GitHub 凭证不进入前端、代码或聊天记录。

## 方案

采用异步 GitHub Actions 触发链路：

```text
管理员页面
  -> Supabase Edge Function trigger-crawler（校验登录用户为 admin）
  -> GitHub workflow_dispatch
  -> crawler.yml（Python 采集器 + Supabase Session Pooler）
  -> Supabase 数据库
```

Edge Function 只负责鉴权和触发，不运行长时间采集。GitHub Actions 负责运行现有 OpenAlex、arXiv、GitHub、Hugging Face 采集器，避免 Edge Function 超时。

## 安全边界

- 前端按钮只对 `admin` 角色渲染；Edge Function 再次校验 JWT 和 `profiles.role`，不能仅依赖前端隐藏。
- `SUPABASE_DB_URL` 只存储在 GitHub Actions Secret。
- GitHub Actions 触发令牌只存储在 Supabase Edge Function Secret `GITHUB_ACTIONS_TOKEN`。
- 数据库密码不写入工作流文件、前端、日志或提交记录。
- 工作流使用最小权限，只允许读取仓库并执行采集任务。

## 运行行为

- 每次点击触发一个新的异步运行；按钮在请求成功后显示“已提交，后台处理中”。
- 采集器按外部 ID/来源去重，重复运行不会重复创建论文、人才和机构。
- 单条采集失败记录日志并继续处理，不因一条错误终止整批。
- 采集完成后重建关系和人才评分。
- 中文翻译沿用现有批处理流程；翻译失败不影响原始数据入库。

## 配置

需要配置：

1. GitHub Secret：`SUPABASE_DB_URL`
2. Supabase Edge Function Secret：`GITHUB_ACTIONS_TOKEN`
3. 新增 workflow：`.github/workflows/crawler.yml`
4. 新增 Edge Function：`supabase/functions/trigger-crawler`

## 验证

- 单元测试覆盖管理员角色拒绝、GitHub workflow dispatch 请求和前端按钮状态。
- GitHub Actions 使用小批量参数完成首次验证，再允许管理员扩大批量。
- 验证重复运行的数据库计数和外部 ID 不增加重复记录。
- 验证 GitHub Actions 日志不包含连接串或令牌。
