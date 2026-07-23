# Talent Graph 名称中文翻译设计

## 状态

待实现。目标是交给 Claude Code 按本文档实施；本设计不包含任何真实 API key、数据库密码或其他 Secret。

## 目标

为学校、公司和论文名称提供中文显示，同时保留原始名称；人员姓名不进入翻译流程。

覆盖两类场景：

1. 对当前 Supabase 中已有的机构和论文做一次历史批量翻译。
2. 新增或修改机构、论文后自动翻译，并在完成前回退显示原文。

当前数据规模约为 2,264 条机构记录、1,937 条论文记录。翻译必须是异步的，不能阻塞人才库的正常保存和浏览。

## 不变的边界

- `persons.chinese_name`、`persons.english_name` 不翻译、不改写。
- 原始字段永远保留：`organizations.name`、`organizations.english_name`、`papers.title`。
- 翻译失败不能导致原记录保存失败。
- 浏览器前端不能接触 DeepSeek API key。
- 不重复导入 SQLite，不清空现有 Supabase 业务数据。
- 不因翻译功能改变现有 RLS、角色权限或人员关系数据。

## 已选方案

使用 Supabase Edge Function 调用 DeepSeek，配合 PostgreSQL 翻译缓存。

选择原因：

- DeepSeek 更适合当前中国大陆使用环境。
- Edge Function 将 API key 留在服务端。
- 缓存可以避免相同公司、学校或论文标题重复计费。
- 原文和译文分栏保存，后续可以更换模型或重新翻译。

不采用“每次页面打开时实时翻译”，因为它会增加延迟、重复调用和页面不稳定风险。

## 数据模型

### organizations

新增：

```sql
name_zh text
```

`name` 仍为主要原始名称；`name_zh` 为空时，UI 使用 `name` 或 `english_name` 作为回退。

### papers

新增：

```sql
title_zh text
```

`title` 永远保留；`title_zh` 为空时，UI 使用 `title`。

### translation_cache

建议新增：

```sql
create table public.translation_cache (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('organization', 'paper')),
  source_text text not null,
  target_language text not null default 'zh-CN',
  translated_text text not null,
  status text not null default 'completed'
    check (status in ('completed', 'failed')),
  attempts integer not null default 1,
  last_error text,
  translated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (content_type, source_text, target_language)
);
```

缓存表只允许后端服务角色读写。普通登录用户不直接访问该表。

如果实现过程中发现现有迁移已有统一的更新时间函数或 UUID 默认值，应复用现有约定，不重复创建同名对象。

## Edge Function：translate-content

文件建议：

```text
supabase/functions/translate-content/index.ts
```

### 请求

```json
{
  "items": [
    {
      "content_type": "organization",
      "id": "organization-uuid",
      "source_text": "Massachusetts Institute of Technology"
    },
    {
      "content_type": "paper",
      "id": "paper-uuid",
      "source_text": "Attention Is All You Need"
    }
  ]
}
```

要求：

- `items` 最多 20 条，单条文本最多 1,000 个字符。
- `content_type` 只允许 `organization` 或 `paper`。
- 服务器端根据 `id` 从数据库重新读取原始字段，不信任客户端传入的 `source_text`。
- 机构记录只处理 `organization_type` 属于学校或公司的记录；其他机构类型直接跳过。
- 不提供 `person` 类型。
- 需要有效登录会话；批量历史翻译必须要求 admin 角色。
- 更新数据库时只允许写入对应的 `name_zh` 或 `title_zh`，不能通过该函数修改其他字段。

### 处理顺序

1. 验证 JWT 和角色。
2. 校验请求大小、类型和文本长度。
3. 读取当前原文并规范化空白。
4. 查询 `translation_cache`。
5. 有成功缓存时直接回填目标记录。
6. 没有缓存时调用 DeepSeek。
7. 校验模型结果为非空字符串，去除 Markdown、解释文字和异常 JSON 包装。
8. 写入缓存，再写入 `name_zh` 或 `title_zh`。
9. 返回每条记录的状态，不因单条失败回滚其他成功项。

### 返回

```json
{
  "items": [
    {
      "id": "record-uuid",
      "content_type": "organization",
      "status": "completed",
      "translated_text": "麻省理工学院"
    }
  ]
}
```

失败项只返回安全错误码和 `status: "failed"`，不能返回 DeepSeek key、完整请求头或内部堆栈。

## DeepSeek 调用

Edge Function Secret：

```text
DEEPSEEK_API_KEY
DEEPSEEK_MODEL=deepseek-chat
```

模型请求使用低随机性（建议 `temperature: 0.1`），要求只返回译文。提示词至少包含：

- 已经是中文的内容原样返回。
- 保留公司品牌、学校简称、产品名和专业缩写。
- 不翻译人名；本函数本身也不接收人员记录。
- 不添加解释、引号、序号或 Markdown。
- 无法可靠翻译时返回原文。

必须设置超时、有限重试和单批次上限。DeepSeek 失败时写入 `translation_cache.status = 'failed'`，记录脱敏错误信息，并让页面继续显示原文。

## 新增和修改记录的自动翻译

### 新增机构/论文

1. 前端按现有流程保存原始记录。
2. 保存成功后调用 `translate-content`。
3. 页面立即显示原文，不等待翻译函数完成。
4. 翻译成功后重新读取记录并显示中文。
5. 翻译失败只保留原文；不阻塞保存，也不弹出阻止性错误。

### 修改原文

当 `organizations.name`、`organizations.english_name` 或 `papers.title` 改变时：

- 清空对应的中文字段，避免旧译文继续显示。
- 异步重新翻译。
- 原文再次作为临时回退值。

不要使用 PostgreSQL trigger 直接调用外部 HTTP 服务；翻译调用必须经过 Edge Function。

## 历史数据批量翻译

新增管理员专用批处理入口，建议放在：

```text
tools/migration/translate_existing.py
```

处理规则：

- 查询 `name_zh is null` 的学校/公司和 `title_zh is null` 的论文。
- 每批最多 20 条，调用 `translate-content`。
- 显示 `completed / total`、成功数、失败数和当前类型。
- 支持中断后继续：已有 `name_zh`、`title_zh` 或成功缓存不重复处理。
- 单条失败后继续下一条，不因一个模型错误中止整个批次。
- 不提供默认 `--replace` 或清空数据库行为。

历史翻译完成后应执行一次核验，确认原始字段没有被修改、译文字段数量与成功结果一致。

## 前端展示和搜索

新增显示辅助函数，例如：

```text
displayOrganizationName(organization)
displayPaperTitle(paper)
```

规则：

- 有中文译文时显示译文。
- 没有译文时显示原文。
- 详情页显示原文作为辅助信息。
- 人员姓名继续使用现有中文名/英文名逻辑，不接入翻译辅助函数。

需要更新现有类型定义和相关查询字段：

- `frontend/lib/types.ts`
- 机构列表、机构详情、论文列表、论文详情相关数据服务和页面
- 机构搜索和论文搜索 RPC：搜索条件同时匹配原文和中文译文

搜索查询应使用参数化 SQL，不能在函数中拼接用户输入。

## 权限和安全

- 翻译函数必须验证登录身份。
- 历史批量翻译只允许 admin。
- 普通成员可以因正常新增/修改流程触发自己有权限的记录翻译，但不能传入任意记录 ID 修改其他数据。
- `DEEPSEEK_API_KEY` 只存 Supabase Edge Function Secret。
- 不将 key 写入 `frontend`、GitHub Pages 构建产物、日志、测试快照或 Git。
- 使用固定的 DeepSeek URL，不接受客户端传入 URL，避免 SSRF。
- 对文本长度、批量大小和调用频率限流。
- 所有翻译输入均视为不可信文本，不能让模型输出直接变成 SQL、HTML 或脚本。

## 测试要求

### 单元测试

- 已有中文文本返回原文且不调用 DeepSeek。
- 人员类型无法提交翻译。
- 公司、学校和论文类型映射到正确字段。
- 缓存命中时不重复调用 DeepSeek。
- 空译文、超长文本和非法类型被拒绝。
- DeepSeek 失败时返回失败状态，原始数据仍可保存。
- 批处理遇到单条失败仍继续。

### 集成测试

- admin 可以运行批量翻译。
- 非 admin 无法运行批量翻译。
- 普通登录成员不能通过修改请求越权写入其他记录。
- RLS 不允许普通用户直接读写 `translation_cache`。

### 浏览器测试

- 机构列表优先显示中文名称。
- 论文列表优先显示中文标题。
- 详情页可以看到原文。
- 姓名没有被翻译。
- 无译文和翻译失败时显示原文。
- 中文和原文都能搜索到同一条记录。

### 发布验证

```powershell
Set-Location frontend
npm test
npm run build
```

推送到 `main` 后验证：

- GitHub Pages 页面返回 200。
- 浏览器构建产物不包含 `DEEPSEEK_API_KEY` 或数据库连接串。
- Supabase Edge Function 部署成功。
- 已登录用户可以看到原文和译文回退逻辑。

## 实施顺序

1. 新增数据库迁移和翻译缓存表。
2. 新增 Edge Function 和 Secret 配置说明。
3. 新增类型、查询字段和中文显示辅助函数。
4. 接入新增/修改记录后的异步翻译。
5. 新增管理员批处理脚本并翻译历史数据。
6. 更新搜索、详情页和测试。
7. 运行测试、构建、部署并进行线上验证。

## 验收标准

- 公司、学校和论文名称有中文译文时，线上页面默认显示中文。
- 姓名保持原样。
- 原始名称未被覆盖。
- 新增记录会自动触发翻译，失败时仍能正常保存。
- 历史记录可断点续跑，重复执行不会重复计费。
- DeepSeek key 不出现在浏览器、仓库或日志。
- `npm test`、`npm run build` 和 Edge Function 部署全部成功。

## 给 Claude Code 的执行要求

请先阅读本文档和现有 Supabase schema，再开始实现。实施前先检查工作区是否有未提交改动；不要重置、覆盖或清空现有数据。每完成一个阶段先运行对应测试，再提交小的原子 commit。不要要求用户把任何 Secret 粘贴到聊天或源代码中；需要 `DEEPSEEK_API_KEY` 时只使用 Supabase Secret 配置。完成后报告修改文件、测试结果、迁移执行结果、部署运行号和线上验证地址。
