# Parallel Domain Crawling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow different talent domains to import concurrently while moving the expensive full relationship rebuild into one independent manual workflow.

**Architecture:** Keep `.github/workflows/crawler.yml` backward-compatible for its three existing inputs, but make it import-only and scope concurrency by domain. Add `.github/workflows/rebuild-relationships.yml` with a fixed global concurrency group so administrators can run one rebuild after all imports finish.

**Tech Stack:** GitHub Actions YAML, Python contract tests with pytest, existing SQLAlchemy data pipeline.

---

### Task 1: Add workflow contract tests

**Files:**
- Create: `tools/tests/test_workflow_contracts.py`
- Test: `tools/tests/test_workflow_contracts.py`

- [ ] **Step 1: Write the failing contract tests**

```python
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
CRAWLER = ROOT / ".github" / "workflows" / "crawler.yml"
REBUILD = ROOT / ".github" / "workflows" / "rebuild-relationships.yml"


def test_crawler_is_import_only_and_scoped_by_domain() -> None:
    workflow = CRAWLER.read_text(encoding="utf-8")

    assert "group: talent-graph-crawler-${{ inputs.domain || '人工智能' }}" in workflow
    assert "python -m data_pipeline.scripts.initial_import" in workflow
    assert "rebuild_relations_and_scores" not in workflow


def test_relationship_rebuild_is_an_independent_manual_workflow() -> None:
    workflow = REBUILD.read_text(encoding="utf-8")

    assert "workflow_dispatch:" in workflow
    assert "group: talent-graph-relationship-rebuild" in workflow
    assert "SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}" in workflow
    assert "python -m pip install -r tools/data_pipeline/requirements.txt" in workflow
    assert "rebuild_relations_and_scores" in workflow
```

- [ ] **Step 2: Run the tests and verify they fail for the intended reasons**

Run:

```powershell
.\.migration-venv\Scripts\python.exe -m pytest tools/tests/test_workflow_contracts.py -q
```

Expected: both tests fail because the crawler still has a global concurrency group and rebuild step, and the independent rebuild workflow does not exist.

### Task 2: Make the crawler import-only and domain-scoped

**Files:**
- Modify: `.github/workflows/crawler.yml`
- Test: `tools/tests/test_workflow_contracts.py`

- [ ] **Step 1: Scope concurrency to the requested domain**

Replace the existing concurrency block with:

```yaml
concurrency:
  group: talent-graph-crawler-${{ inputs.domain || '人工智能' }}
  cancel-in-progress: false
```

- [ ] **Step 2: Remove the unconditional relationship rebuild step**

Delete only the `Rebuild relationships and talent scores` step. Keep checkout, Python setup, Secret validation, dependency installation, and public research import unchanged.

- [ ] **Step 3: Run the crawler contract test**

Run:

```powershell
.\.migration-venv\Scripts\python.exe -m pytest tools/tests/test_workflow_contracts.py::test_crawler_is_import_only_and_scoped_by_domain -q
```

Expected: `1 passed`.

### Task 3: Add the independent relationship rebuild workflow

**Files:**
- Create: `.github/workflows/rebuild-relationships.yml`
- Test: `tools/tests/test_workflow_contracts.py`

- [ ] **Step 1: Create the workflow**

```yaml
name: Rebuild relationships and talent scores

on:
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: talent-graph-relationship-rebuild
  cancel-in-progress: false

jobs:
  rebuild:
    runs-on: ubuntu-latest
    timeout-minutes: 180
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-python@v6
        with:
          python-version: '3.12'
      - name: Check required database secret
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
        run: |
          if [ -z "$SUPABASE_DB_URL" ]; then
            echo "::error::GitHub Actions Secret SUPABASE_DB_URL is missing"
            exit 1
          fi
          case "$SUPABASE_DB_URL" in
            postgresql://*|postgresql+psycopg://*) ;;
            *)
              echo "::error::SUPABASE_DB_URL must be a PostgreSQL connection string"
              exit 1
              ;;
          esac
      - name: Install crawler dependencies
        run: python -m pip install -r tools/data_pipeline/requirements.txt
      - name: Rebuild relationships and talent scores
        env:
          SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}
          PYTHONPATH: tools:tools/data_pipeline:tools/crawler_backend
        run: >-
          python -c
          "from tasks.daily_update import rebuild_relations_and_scores; rebuild_relations_and_scores()"
```

- [ ] **Step 2: Run both workflow contract tests**

Run:

```powershell
.\.migration-venv\Scripts\python.exe -m pytest tools/tests/test_workflow_contracts.py -q
```

Expected: `2 passed`.

### Task 4: Validate syntax, repository safety, and scope

**Files:**
- Verify: `.github/workflows/crawler.yml`
- Verify: `.github/workflows/rebuild-relationships.yml`
- Verify: `tools/tests/test_workflow_contracts.py`

- [ ] **Step 1: Parse both YAML files with the repository's installed Node dependency**

Run:

```powershell
node -e "const fs=require('fs');const YAML=require('./frontend/node_modules/yaml');for(const f of ['.github/workflows/crawler.yml','.github/workflows/rebuild-relationships.yml'])YAML.parse(fs.readFileSync(f,'utf8'));console.log('workflow yaml ok')"
```

Expected: `workflow yaml ok`.

- [ ] **Step 2: Run the relevant repository tests and guard**

Run:

```powershell
.\.migration-venv\Scripts\python.exe -m pytest tools/tests/test_workflow_contracts.py tools/tests/test_repo_guard.py -q
.\.migration-venv\Scripts\python.exe tools/repo_guard.py --tracked
```

Expected: all tests pass and the guard reports `0 findings`.

- [ ] **Step 3: Inspect the final diff**

Run:

```powershell
git diff --check
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- .github/workflows tools/tests docs/superpowers
```

Expected: only the approved design, plan, two workflow changes, and workflow contract test are present; no credentials or unrelated files are changed.

- [ ] **Step 4: Commit the implementation**

```powershell
git add .github/workflows/crawler.yml .github/workflows/rebuild-relationships.yml tools/tests/test_workflow_contracts.py docs/superpowers/plans/2026-08-06-parallel-domain-crawling.md
git commit -m "fix: separate crawling from relationship rebuild"
```

### Task 5: Publish and verify GitHub behavior

**Files:**
- Publish branch: `codex/parallel-domain-crawling`

- [ ] **Step 1: Push the branch and merge through the repository's normal GitHub flow**

Run:

```powershell
git push -u origin codex/parallel-domain-crawling
```

Expected: the branch is available on GitHub without force-pushing.

- [ ] **Step 2: Verify the workflow definitions on the pushed commit**

Check GitHub Actions for both `Run data crawler` and `Rebuild relationships and talent scores`. Confirm future crawler runs no longer contain a rebuild step and different domain values produce different concurrency groups.

- [ ] **Step 3: Preserve the current run**

Do not cancel or rerun the already-started embodied-intelligence run. It continues using commit `6a7408b7bd2a4e50e438c181b93d05ea337228aa` and is outside this change.
