# Talent Graph 数据采集实现说明

本文面向项目同事，说明“数据导入”页面背后的完整实现链路、数据处理方式和日常使用注意事项。

## 一句话概括

网站本身不直接爬数据。前端只负责提交采集请求；Supabase Edge Function 负责鉴权和启动任务；真正的采集在 GitHub Actions 中执行，采集结果写入 Supabase PostgreSQL，网站再从 Supabase 查询并展示。

## 整体流程

```text
数据导入页面
    |
    | 领域、关键词、每个关键词的论文上限
    v
Supabase Edge Function: trigger-crawler
    |
    | 校验登录身份、管理员权限和参数
    v
GitHub Actions: crawler.yml
    |
    | 使用服务器端数据库 Secret 执行 Python 脚本
    v
OpenAlex API
    |
    | 论文搜索、作者/机构标准化
    v
数据处理与入库
    |
    | 分类、外部 ID 去重、写入论文/人才/机构/来源记录
    v
Supabase PostgreSQL
    |
    v
人才库、统计页、关系图
```

## 1. 前端：提交采集请求

入口是网站的“数据导入”页面：

- 选择目标领域，例如“量子计算”或“具身智能”；
- 设置每个关键词最多采集多少篇论文；
- 可修改逗号分隔的关键词；
- 点击“开始一键采集”。

前端调用 `triggerCrawler()`，不会在浏览器中运行长时间采集，也不会接触数据库密码或 GitHub Token。

相关代码：[frontend/app/(main)/import/page.tsx](../frontend/app/(main)/import/page.tsx)、[frontend/lib/data/crawler.ts](../frontend/lib/data/crawler.ts)。

## 2. Supabase Edge Function：鉴权和排队

Edge Function `trigger-crawler` 主要做四件事：

1. 检查请求来源和 HTTP 方法；
2. 使用 Supabase Auth 验证当前登录用户；
3. 查询 `profiles`，确认用户是启用状态的管理员；
4. 校验 `max`、`keywords`、`domain` 后，调用 GitHub API 启动工作流。

它只返回“任务已排队”，不会等待采集完成。因此用户可以继续使用网站。

相关代码：[supabase/functions/trigger-crawler/index.ts](../supabase/functions/trigger-crawler/index.ts)、[supabase/functions/_shared/crawler.ts](../supabase/functions/_shared/crawler.ts)。

## 3. GitHub Actions：真正执行采集

工作流 [crawler.yml](../.github/workflows/crawler.yml) 在 GitHub 的临时运行器上执行：

1. 拉取代码；
2. 安装 Python 采集依赖；
3. 检查 `SUPABASE_DB_URL` 是否存在且格式正确；
4. 执行 `tools/data_pipeline/scripts/initial_import.py`；
5. 将结果直接写入 Supabase PostgreSQL。

数据库连接串只从 GitHub Actions Secret 读取，不进入前端、仓库源码或聊天记录。

所有数据库写入工作流共用 `talent-graph-db-write` 锁，并设置排队策略，避免多个采集任务同时写数据库造成冲突。

## 4. 数据源和采集范围

当前“一键采集”主流程使用 OpenAlex。

OpenAlex 查询条件包括：

- 论文类型为 article；
- 发表时间从 2019 年开始；
- 至少有中国大陆、香港、澳门或台湾机构作者；
- 每个关键词最多采集 `max` 篇；
- 使用游标分页，直到达到上限或没有更多结果。

例如“具身智能”默认会使用多个关键词，因此“每个关键词最多 10 篇”不等于总共 10 篇，而是每个关键词最多 10 篇。

领域默认关键词定义在：[tools/data_pipeline/config/settings.py](../tools/data_pipeline/config/settings.py)。

## 5. 数据处理和入库

每篇 OpenAlex 论文进入数据库前会经过以下处理：

### 标准化

采集器会统一整理：

- 论文标题、摘要、日期、期刊/会议；
- OpenAlex ID、DOI、arXiv ID；
- 作者姓名、ORCID、作者顺序；
- 作者所属机构及国家/地区；
- 引用次数和研究主题。

### 分类

系统会根据论文标题、摘要和 OpenAlex 主题词做关键词分类，并保存论文的方向信息。

顶层领域（例如“具身智能”）由本次任务参数写入人才记录；细分方向分类使用采集管道中的方向关键词规则。

### 去重

优先使用外部标识去重：

- OpenAlex ID；
- ORCID；
- 论文的 OpenAlex ID、DOI 或 arXiv ID。

因此重复启动同一批关键词，通常会更新已有记录，而不是无限创建重复人才和论文。

### 写入内容

一篇论文可能产生或更新：

- `papers`：论文；
- `persons`：作者；
- `organizations`：机构；
- 论文—作者关联；
- `source_records`：原始来源和来源链接。

每处理一篇论文会提交一次事务，单篇失败会回滚并继续处理后续论文。

## 6. 关系和人才评分为什么单独运行

采集本身和关系重建是两类不同工作：

- 采集：新增论文、人才和机构，适合频繁执行；
- 重建：根据共同论文、共同机构等全库数据重算关系和人才评分，计算量较大。

现在采集工作流不再自动执行关系重建。采集一批数据后，再按需要手动运行：

[Rebuild relationships and talent scores](https://github.com/chenyuhuan555/talent-graph/actions/workflows/rebuild-relationships.yml)

这样可以避免采集已经完成，但工作流又长时间卡在关系计算阶段。

## 7. 常用操作

### 启动一键采集

1. 登录网站管理员账号；
2. 进入“数据导入”；
3. 选择领域；
4. 首次建议每个关键词设置 10 篇；
5. 点击“开始一键采集”；
6. 到 GitHub Actions 查看运行状态。

工作流地址：[Run data crawler](https://github.com/chenyuhuan555/talent-graph/actions/workflows/crawler.yml)

### 查看是否真的写入

采集工作流显示成功，只说明脚本正常结束。最终是否增加数据，应在 Supabase 中查询 `persons`、`papers` 和 `organizations` 的数量，并按 `industry` 或来源记录检查本批数据。

### 估算采集量

```text
理论请求量 ≈ 关键词数量 × 每个关键词上限
```

实际新增量通常会更少，因为不同关键词可能命中同一篇论文，且同一作者会根据外部 ID 去重。

## 8. 当前边界和注意事项

- 当前页面的一键采集主流程是 OpenAlex；文档中提到的 arXiv、GitHub、Hugging Face 属于其他采集器或后续扩展，不代表一次点击会同时调用所有数据源。
- 采集任务是异步的，页面提示“已启动”不代表已经完成。
- 采集任务共用数据库写入锁；如果前一个任务还在运行，后续任务会排队。
- 关系图的数据依赖关系重建工作流；只导入数据、不重建关系时，新论文和人才可能已经入库，但关系数量和人才评分尚未更新。
- GitHub Actions 的数据库连接和 GitHub Token 都是服务端 Secret，不能复制到浏览器或发到聊天中。

## 相关文件

| 组件 | 文件 |
|---|---|
| 数据导入页面 | `frontend/app/(main)/import/page.tsx` |
| 前端采集调用 | `frontend/lib/data/crawler.ts` |
| Edge Function | `supabase/functions/trigger-crawler/index.ts` |
| 参数校验 | `supabase/functions/_shared/crawler.ts` |
| 采集工作流 | `.github/workflows/crawler.yml` |
| 关系重建工作流 | `.github/workflows/rebuild-relationships.yml` |
| OpenAlex 采集器 | `tools/data_pipeline/collectors/openalex.py` |
| 初始导入脚本 | `tools/data_pipeline/scripts/initial_import.py` |
| 入库服务 | `tools/data_pipeline/services/import_service.py` |
| 领域关键词配置 | `tools/data_pipeline/config/settings.py` |
