# 一键采集 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让管理员从“数据导入”页面一键触发后台爬虫，并将数据写入 Supabase。

**Architecture:** 前端调用受 JWT 保护的 `trigger-crawler` Edge Function；函数校验管理员后调用 GitHub Actions `workflow_dispatch`。Actions 使用 GitHub Secret 中的 `SUPABASE_DB_URL` 运行现有 Python 采集器。

**Tech Stack:** Next.js/React、Supabase Edge Functions (Deno)、GitHub Actions、Python、Vitest。

---

### Task 1: Edge Function 请求契约

**Files:**
- Create: `supabase/functions/trigger-crawler/index.ts`
- Test: `supabase/functions/tests/trigger-crawler.test.ts`

- [ ] Write a failing test for rejecting a non-admin JWT and dispatching a workflow for an admin.
- [ ] Run the function test and confirm failure because the handler is missing.
- [ ] Implement JWT/profile validation and GitHub `workflow_dispatch` request using `GITHUB_ACTIONS_TOKEN`.
- [ ] Return `{ status: "queued" }` without exposing token or database URL.
- [ ] Run the function tests and confirm pass.

### Task 2: GitHub Actions crawler workflow

**Files:**
- Create: `.github/workflows/crawler.yml`

- [ ] Add `workflow_dispatch` inputs for `max` and `keywords`.
- [ ] Install Python 3.12 and `data_pipeline/requirements.txt`.
- [ ] Set `SUPABASE_DB_URL` from the repository secret and run the OpenAlex importer.
- [ ] Run relationship/score rebuild after import and keep logs free of secret values.
- [ ] Validate workflow YAML and run repository tests locally.

### Task 3: Frontend import button

**Files:**
- Modify: `frontend/app/(main)/import/page.tsx`
- Create: `frontend/lib/data/crawler.ts`
- Test: `frontend/tests/crawler.test.ts`

- [ ] Write a failing test for invoking `trigger-crawler` and returning the queued status.
- [ ] Implement the Supabase function client helper.
- [ ] Add an admin-only button with loading, success, and failure states to the import page.
- [ ] Run the focused Vitest test and the full frontend test suite.

### Task 4: Deployment and operator documentation

**Files:**
- Modify: `.github/workflows/pages.yml`
- Modify: `docs/operations/supabase-pages-runbook.md`

- [ ] Deploy `trigger-crawler` in the existing functions job.
- [ ] Document the required secrets `SUPABASE_DB_URL` (GitHub) and `GITHUB_ACTIONS_TOKEN` (Supabase).
- [ ] Document the one-time password rotation required because the old connection string was exposed.
- [ ] Run full tests, build, and repository secret guard.
- [ ] Commit and push to `main`, then verify the Actions workflow is triggered.
