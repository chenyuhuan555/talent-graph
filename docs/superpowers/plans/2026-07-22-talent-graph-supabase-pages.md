# Talent Graph Supabase and GitHub Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the approved first-release Talent Graph workflows from local SQLite and FastAPI to a dedicated Supabase backend and a safe public GitHub Pages frontend.

**Architecture:** The Next.js frontend becomes a static export at `/talent-graph/` and talks to Supabase through focused TypeScript data services. PostgreSQL tables, RLS, trusted SQL functions, and one authenticated member-management Edge Function replace the production FastAPI runtime; Python tools make a consistent SQLite snapshot, migrate data, and verify counts and relationships.

**Tech Stack:** Next.js 14, React 18, TypeScript, Vitest, Playwright, Supabase JS 2, PostgreSQL, RLS, Supabase Edge Functions, Python 3.14, Psycopg 3.3.4, pytest, GitHub Actions, GitHub Pages.

---

## Scope and Dependency Order

This plan has four dependent phases in one file so the handoff stays coherent:

1. Public-repository safety and test foundations.
2. Supabase schema, authorization, trusted queries, and account administration.
3. SQLite migration plus static frontend conversion.
4. Remote provisioning, trial migration, Pages deployment, production verification, and rollback readiness.

The first release intentionally excludes resume parsing, external collection, bulk synchronization, and full relationship-score recomputation. The existing baseline is:

- `backend/.venv/Scripts/python.exe -m pytest backend/tests -q` -> `11 passed`.
- `npm run build` -> fails in `frontend/app/(main)/import/page.tsx` because `ResumeParseResult` is not exported. Task 8 removes this excluded workflow and restores the build.

## File Responsibility Map

### Repository safety

- `.gitignore` excludes all databases, snapshots, exports, local credentials, dependencies, and generated output.
- `.gitattributes` keeps repository text files on LF while preserving Windows scripts as CRLF.
- `tools/repo_guard.py` scans tracked or staged files and built output for forbidden paths, data, and credential patterns.
- `tools/tests/test_repo_guard.py` locks the guard behavior.

### Supabase backend

- `supabase/config.toml` declares the local project layout and authenticated Edge Function.
- `supabase/migrations/202607220001_core_schema.sql` creates profiles and the 21 migrated business tables with constraints and indexes.
- `supabase/migrations/202607220002_auth_rls.sql` creates live account helpers, grants, RLS, role policies, masking, and audit triggers.
- `supabase/migrations/202607220003_read_api.sql` creates bounded dashboard, discovery, person-detail, graph, outreach, review, and position-match functions.
- `supabase/migrations/202607220004_private_storage.sql` creates a non-public document bucket with no first-release browser write policy.
- `supabase/functions/_shared/username.ts` implements the Edge Function username identity transformation.
- `supabase/functions/manage-member/index.ts` creates, disables, and changes internal member roles after a live administrator check.
- `supabase/tests/schema_contract.sql`, `supabase/tests/rls_contract.sql`, `supabase/tests/read_api_contract.sql`, and `supabase/tests/storage_contract.sql` verify the deployed backend inside transactions.

### Migration tooling

- `tools/migration/requirements.txt` pins the isolated migration dependencies.
- `tools/migration/snapshot.py` creates and verifies a consistent SQLite backup.
- `tools/migration/transform.py` converts SQLite values and remaps the 40 legacy ownership references.
- `tools/migration/migrate.py` imports the 21 tables in dependency order and supports explicit dry-run and replace modes.
- `tools/migration/verify.py` compares row counts, UUID uniqueness, foreign keys, samples, and owner remapping.
- `tools/migration/bootstrap_admin.py` interactively creates the first Supabase administrator without persisting the password.
- `tools/migration/export_remote.py` produces an ignored compressed data backup before material remote changes.
- `tools/migration/run_sql_contracts.py` executes transactional database contracts against the linked project.
- `tools/migration/verify_roles.py` creates short-lived role fixtures, tests allowed and denied operations, and removes them in `finally`.
- `tools/migration/tests/` contains focused unit and integration-contract tests.

### Frontend

- `frontend/lib/supabase/client.ts` owns the singleton browser client and public environment validation.
- `frontend/lib/auth/identity.ts` implements username normalization and internal email derivation.
- `frontend/lib/auth/session.ts` owns login, logout, profile validation, and live disabled-account handling.
- `frontend/lib/types.ts` owns shared frontend data contracts currently mixed into `lib/api.ts`.
- `frontend/lib/data/*.ts` owns typed queries by domain instead of stringly typed FastAPI paths.
- `frontend/components/forms/*.tsx` owns the first-release person, position, contact, and outreach edit dialogs.
- `frontend/app/(main)/settings/members/page.tsx` and `settings/audit/page.tsx` provide administrator-only member and audit workflows.
- `frontend/app/login/page.tsx`, `frontend/app/page.tsx`, and `frontend/app/(main)/layout.tsx` implement the authenticated shell.
- `frontend/app/(main)/persons/detail/page.tsx` replaces the unexportable `[id]` route.
- Existing pages use the focused data services and preserve their current presentation.
- `frontend/tests/` and `frontend/e2e/` cover identity, session, service behavior, static routing, and production smoke flows.

### Deployment

- `frontend/.env.example` documents only public build variables.
- `.github/workflows/pages.yml` tests, builds, scans, uploads, and deploys the `frontend/out` artifact.
- `docs/operations/supabase-pages-runbook.md` records provisioning, cutover, validation, rollback, and credential rotation procedures.

---

### Task 1: Lock Down the Public Repository Boundary

**Files:**
- Modify: `.gitignore`
- Create: `.gitattributes`
- Create: `tools/repo_guard.py`
- Create: `tools/tests/test_repo_guard.py`

- [ ] **Step 1: Write failing repository-guard tests**

Create tests using temporary Git repositories. Cover these exact cases:

```python
def test_rejects_sqlite_and_static_business_exports(tmp_path):
    result = scan_paths(["backend/talent_graph.db", "deploy/persons.json"])
    assert {finding.code for finding in result} == {"forbidden-path"}


def test_rejects_secret_values_but_allows_publishable_key_name(tmp_path):
    synthetic_secret = "sb_" + "secret_" + "test_value"
    findings = scan_text(
        "config.txt",
        f"SUPABASE_SECRET_KEY={synthetic_secret}\n"
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=variable_reference_only\n",
    )
    assert [finding.code for finding in findings] == ["secret-value"]


def test_allows_source_migrations_and_empty_json_fixtures(tmp_path):
    assert scan_paths([
        "supabase/migrations/202607220001_core_schema.sql",
        "tools/tests/fixtures/empty.json",
    ]) == []
```

- [ ] **Step 2: Run the tests and verify they fail**

Run from the repository root:

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest tools\tests\test_repo_guard.py -v
```

Expected: collection fails because `tools.repo_guard` does not exist.

- [ ] **Step 3: Implement the guard and expand `.gitignore`**

The guard must expose a frozen `Finding(code, path, detail)` dataclass plus concrete `scan_paths(paths)`, `scan_text(path, text)`, `tracked_paths(repo, staged)`, and `scan_repository(repo, staged, artifact, history)` functions. `tracked_paths` uses `git ls-files`; history mode enumerates reachable blobs with `git rev-list --objects --all` and reads each blob through `git cat-file` without checking it out.

Reject `*.db`, `*.db-*`, `*.sqlite*`, `.env` other than examples, `.workbuddy`, the local-only legacy `backend` and `data_pipeline` trees, the legacy Docker compose file, all four generated deploy directories, uploads, contact exports, and secret values beginning with `sb_secret_` or containing a literal PostgreSQL connection URI. Do not reject Supabase URL or publishable-key variable names without values. Add a test that commits a forbidden fixture, deletes it from the working tree, and proves `scan_repository(repo, staged=False, artifact=None, history=True)` still finds the historical blob.

Add these ignore rules in addition to the existing dependency and cache rules:

```gitignore
.workbuddy/
backend/
data_pipeline/
docker-compose.yml
FEATURES.md
frontend/Dockerfile
deploy/
deploy_final/
deploy_lite/
deploy_test/
*.db
*.db-*
*.sqlite
*.sqlite3
*.sqlite-*
.env*
!.env.example
!frontend/.env.example
backups/
exports/
reports/
supabase/.temp/
frontend/out/
playwright-report/
test-results/
```

- [ ] **Step 4: Run focused tests and scan the current tracked tree**

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest tools\tests\test_repo_guard.py -v
& .\backend\.venv\Scripts\python.exe tools\repo_guard.py --repo . --tracked
```

Expected: tests pass; the tracked scan reports zero findings because only approved design documents are currently tracked.

- [ ] **Step 5: Commit the repository boundary**

```powershell
git add .gitignore .gitattributes tools/repo_guard.py tools/tests/test_repo_guard.py
git diff --cached --check
git commit -m "chore: protect public repository from business data"
```

---

### Task 2: Add Frontend Test Infrastructure and Record the Baseline Failure

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Track unchanged production inputs: `frontend/tsconfig.json`
- Track unchanged production inputs: `frontend/tailwind.config.ts`
- Track unchanged production inputs: `frontend/postcss.config.js`
- Track unchanged production inputs: `frontend/next-env.d.ts`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/tests/setup.ts`
- Create: `frontend/tests/baseline-navigation.test.tsx`

- [ ] **Step 1: Install test dependencies**

```powershell
Set-Location frontend
npm install --save-dev vitest@latest jsdom@latest @testing-library/react@latest @testing-library/jest-dom@latest
```

Add scripts:

```json
{
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 2: Add a failing navigation contract test**

The test asserts that person links will use the static detail path:

```tsx
it('builds a GitHub Pages compatible person detail href', () => {
  expect(personDetailHref('abc-123')).toBe('/persons/detail?id=abc-123');
});
```

- [ ] **Step 3: Run the test and verify it fails**

```powershell
npm test -- baseline-navigation.test.tsx
```

Expected: fail because `personDetailHref` does not exist.

- [ ] **Step 4: Add the minimal route helper**

Create `frontend/lib/routes.ts`:

```ts
export function personDetailHref(id: string): string {
  return `/persons/detail?id=${encodeURIComponent(id)}`;
}
```

- [ ] **Step 5: Verify the harness without hiding the known build failure**

```powershell
npm test
npm run typecheck
npm run build
```

Expected: Vitest passes; typecheck/build still fail only on the pre-existing `ResumeParseResult` import-page error.

- [ ] **Step 6: Commit the test foundation**

```powershell
git add frontend/package.json frontend/package-lock.json frontend/tsconfig.json frontend/tailwind.config.ts frontend/postcss.config.js frontend/next-env.d.ts frontend/vitest.config.ts frontend/tests/setup.ts frontend/tests/baseline-navigation.test.tsx frontend/lib/routes.ts
git commit -m "test: add frontend migration test harness"
```

---

### Task 3: Create the PostgreSQL Schema Contract

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202607220001_core_schema.sql`
- Create: `supabase/migrations/202607220004_private_storage.sql`
- Create: `supabase/tests/schema_contract.sql`
- Create: `supabase/tests/storage_contract.sql`
- Create: `tools/tests/test_schema_manifest.py`

- [ ] **Step 1: Write a failing manifest test**

Define the exact migrated table set:

```python
EXPECTED_TABLES = {
    "audit_logs", "contacts", "event_participants", "events", "experiences",
    "merge_tasks", "organizations", "outreach_records", "paper_authors",
    "papers", "person_external_ids", "person_position_matches", "person_tags",
    "persons", "positions", "project_contributors", "projects",
    "relationship_evidence", "relationships", "source_records", "tags",
}


def test_core_schema_declares_every_business_table():
    sql = CORE_SCHEMA.read_text(encoding="utf-8")
    actual = set(re.findall(r"create table public\.([a-z_]+)", sql, re.I))
    assert actual == EXPECTED_TABLES | {"profiles"}
    assert "create table public.users" not in sql.lower()
```

- [ ] **Step 2: Verify the test fails**

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest tools\tests\test_schema_manifest.py -v
```

Expected: fail because the migration file does not exist.

- [ ] **Step 3: Create the schema migration**

Translate the SQLAlchemy models without renaming business columns. Use PostgreSQL `uuid`, `timestamptz`, `boolean`, `integer`, `numeric`, and `text`; preserve nullable behavior, unique constraints, soft-delete columns, and foreign keys. Add `profiles` with this contract:

```sql
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username_hash text not null unique check (username_hash ~ '^[0-9a-f]{64}$'),
  display_name text not null,
  role text not null check (role in ('admin','leader','consultant','operator')),
  department text,
  status text not null default 'active' check (status in ('active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Legacy business owner fields reference `profiles(id)`. Add indexes used by current filters: person name/domain/level/organization/owner, relationship endpoints and verification state, paper authors, outreach follow-up date/user, position status/owner, and source external IDs.

- [ ] **Step 4: Add the transactional SQL schema contract**

`schema_contract.sql` must begin with `begin;` and end with `rollback;`. It checks table existence, UUID primary keys, required foreign keys, check constraints, and the absence of `public.users`.

- [ ] **Step 5: Create the private, unused-by-default storage boundary**

Insert a bucket named `private-documents` with `public = false`, a 20 MB file-size limit, and MIME allowlist for PDF and DOCX. Do not grant `anon` or `authenticated` direct object access in the first release because resume upload is excluded. `storage_contract.sql` proves the bucket is private and that no first-release browser policy exists.

- [ ] **Step 6: Run static schema tests**

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest tools\tests\test_schema_manifest.py -v
```

Expected: pass with exactly 22 public tables: 21 business tables plus `profiles`.

- [ ] **Step 7: Commit the core schema**

```powershell
git add supabase/config.toml supabase/migrations/202607220001_core_schema.sql supabase/migrations/202607220004_private_storage.sql supabase/tests/schema_contract.sql supabase/tests/storage_contract.sql tools/tests/test_schema_manifest.py
git commit -m "feat: define Supabase business schema"
```

---

### Task 4: Enforce Live Roles, RLS, Contact Masking, and Audit

**Files:**
- Create: `supabase/migrations/202607220002_auth_rls.sql`
- Create: `supabase/tests/rls_contract.sql`
- Create: `tools/tests/test_rls_manifest.py`

- [ ] **Step 1: Write failing policy-manifest tests**

Assert every exposed table enables RLS, `anon` receives no business grants, and the migration declares these helpers:

```python
REQUIRED_HELPERS = {
    "is_active_member", "current_app_role", "is_admin", "can_view_full_contact",
    "masked_contacts_for_person", "write_audit_log",
}
```

- [ ] **Step 2: Verify the tests fail**

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest tools\tests\test_rls_manifest.py -v
```

- [ ] **Step 3: Implement live-profile helpers and least-privilege grants**

Use stable, `security definer` helpers with a fixed empty search path and schema-qualified references:

```sql
create function public.current_app_role() returns text
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'active'
$$;

create function public.is_active_member() returns boolean
language sql stable security definer set search_path = ''
as $$ select public.current_app_role() is not null $$;
```

Revoke all from `anon`. Grant only required table operations to `authenticated`, then let RLS narrow them. Grant secret/server administration through Supabase's privileged server role only.

- [ ] **Step 4: Implement the approved role matrix**

Create explicit policies for select, insert, update, and delete. Permanent delete is administrator-only. Leaders and consultants may edit business records and add contacts/outreach. Operators may edit public factual tables and run the later merge function, but may not select raw contact values, add private outreach, export, or administer members.

Expose contact values only through:

```sql
create function public.masked_contacts_for_person(target_person_id uuid)
returns table (id uuid, contact_type text, value text, is_masked boolean)
language sql stable security definer set search_path = ''
as $$
  select c.id, c.contact_type,
    case when public.can_view_full_contact() then c.value
         else public.mask_contact(c.contact_type, c.value) end,
    not public.can_view_full_contact()
  from public.contacts c
  where c.person_id = target_person_id and public.is_active_member()
$$;
```

Revoke direct `contacts.value` retrieval by denying direct table select and exposing only approved contact functions.

- [ ] **Step 5: Add audit writes for sensitive actions**

Audit full-contact reads, member changes, merges, exports, destructive actions, migrations, and restores. The audit insert function derives the actor from `auth.uid()` and does not accept an arbitrary actor ID.

- [ ] **Step 6: Add transactional RLS tests**

The SQL test sets request JWT claims for an inactive user and each of the four roles, then asserts allowed and denied operations. It must specifically prove that operator contact output never contains the raw value and that a disabled admin cannot select business data.

- [ ] **Step 7: Run static checks and commit**

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest tools\tests\test_rls_manifest.py -v
git add supabase/migrations/202607220002_auth_rls.sql supabase/tests/rls_contract.sql tools/tests/test_rls_manifest.py
git commit -m "feat: enforce live role policies and contact masking"
```

---

### Task 5: Replace FastAPI Read Models with Bounded SQL Functions

**Files:**
- Create: `supabase/migrations/202607220003_read_api.sql`
- Create: `supabase/tests/read_api_contract.sql`
- Create: `tools/tests/test_read_api_manifest.py`

- [ ] **Step 1: Write a failing function-manifest test**

Require these functions:

```python
REQUIRED_FUNCTIONS = {
    "dashboard_summary", "discover_talent", "search_persons", "person_detail",
    "person_experiences", "person_papers", "person_projects",
    "person_relationships", "person_position_matches", "relationship_graph",
    "relationship_evidence_for", "organizations_search", "organization_people",
    "positions_search", "position_matches", "outreach_queue", "merge_task_list",
    "merge_people", "export_business_snapshot",
}
```

- [ ] **Step 2: Verify the test fails**

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest tools\tests\test_read_api_manifest.py -v
```

- [ ] **Step 3: Implement paginated and bounded functions**

`search_persons` accepts typed filters plus `page_number` and `page_size`; it clamps `page_size` to `1..100` and returns `total_count` with rows. `relationship_graph` clamps `max_nodes` to `1..50`. No function returns all relationship rows without a person filter.

Every function starts with a live membership check. Functions that bypass direct table policies use `security definer`, `set search_path = ''`, fully qualified names, explicit `grant execute`, and no dynamic SQL built from user input.

- [ ] **Step 4: Implement optimistic updates and merge safety**

Add an update helper that requires the original timestamp:

```sql
create function public.update_person_if_current(
  target_id uuid,
  expected_updated_at timestamptz,
  patch jsonb
) returns public.persons
```

Allowlist patch keys, reject unknown keys, and raise a stable `record_conflict` error if `updated_at` no longer matches. `merge_people` is limited to admin/operator and writes an audit record in the same transaction.

- [ ] **Step 5: Add SQL result and limit tests**

Seed a minimal transaction-local fixture and test pagination totals, graph limits, masked contacts, consultant-owned outreach, conflict rejection, and admin/operator merge permissions. Roll back the fixture.

- [ ] **Step 6: Run static tests and commit**

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest tools\tests\test_read_api_manifest.py -v
git add supabase/migrations/202607220003_read_api.sql supabase/tests/read_api_contract.sql tools/tests/test_read_api_manifest.py
git commit -m "feat: add bounded Supabase read and write functions"
```

---

### Task 6: Implement Administrator-Only Member Management

**Files:**
- Create: `supabase/functions/_shared/username.ts`
- Create: `supabase/functions/manage-member/index.ts`
- Create: `supabase/functions/manage-member/deno.json`
- Create: `frontend/lib/auth/identity.ts`
- Create: `frontend/tests/auth-identity.test.ts`
- Create: `tools/tests/test_username_vectors.py`

- [ ] **Step 1: Write shared identity-vector tests**

Use fixed Unicode vectors, including full-width characters and surrounding spaces:

```ts
it.each([
  [' Alice ', 'alice'],
  ['ＡＤＭＩＮ', 'admin'],
  ['顾问01', '顾问01'],
])('normalizes %s', (input, expected) => {
  expect(normalizeUsername(input)).toBe(expected);
});
```

Assert `usernameToInternalEmail()` produces a 64-character lowercase SHA-256 hex local part and the fixed suffix `@talent-graph.invalid`.

- [ ] **Step 2: Verify the frontend identity tests fail**

```powershell
Set-Location frontend
npm test -- auth-identity.test.ts
```

- [ ] **Step 3: Implement the browser identity helper**

```ts
export function normalizeUsername(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
}

export async function usernameToInternalEmail(value: string): Promise<string> {
  const normalized = normalizeUsername(value);
  if (!normalized) throw new Error('用户名不能为空');
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
  return `${hex}@talent-graph.invalid`;
}
```

- [ ] **Step 4: Implement the Edge Function with the same vectors**

The function accepts `create`, `disable`, or `set_role`. It verifies the caller's JWT, queries the caller's live profile, requires active admin, validates username/display name/role/password, derives the internal email, calls `auth.admin.createUser` only on the server with `email_confirm: true`, writes the profile, and audits the action. Disable operations update the live profile before returning. It returns generic conflicts without exposing the internal email or user directory.

Handle CORS only for `http://localhost:3000` and the exact final Pages origin stored in the `ALLOWED_ORIGINS` function environment variable. Reject other origins and allow only `POST`, `OPTIONS`, `authorization`, `apikey`, and `content-type`.

Never log the request body, password, Authorization header, secret key, or internal email.

- [ ] **Step 5: Verify cross-runtime identity consistency**

`test_username_vectors.py` reads the fixed vectors and compares the expected normalized strings and SHA-256 results used by both TypeScript modules. Run:

```powershell
Set-Location ..
& .\backend\.venv\Scripts\python.exe -m pytest tools\tests\test_username_vectors.py -v
Set-Location frontend
npm test -- auth-identity.test.ts
```

- [ ] **Step 6: Commit member management**

```powershell
Set-Location ..
git add supabase/functions frontend/lib/auth/identity.ts frontend/tests/auth-identity.test.ts tools/tests/test_username_vectors.py
git commit -m "feat: add secure username member administration"
```

---

### Task 7: Build Consistent Snapshot, Migration, Verification, and Bootstrap Tools

**Files:**
- Create: `tools/migration/requirements.txt`
- Create: `tools/migration/snapshot.py`
- Create: `tools/migration/transform.py`
- Create: `tools/migration/migrate.py`
- Create: `tools/migration/verify.py`
- Create: `tools/migration/bootstrap_admin.py`
- Create: `tools/migration/export_remote.py`
- Create: `tools/migration/run_sql_contracts.py`
- Create: `tools/migration/verify_roles.py`
- Create: `tools/migration/tests/test_snapshot.py`
- Create: `tools/migration/tests/test_transform.py`
- Create: `tools/migration/tests/test_safety.py`
- Create: `tools/migration/tests/test_verify.py`

- [ ] **Step 1: Pin the isolated migration environment**

`requirements.txt` contains:

```text
psycopg[binary]==3.3.4
pytest==8.3.3
```

Create `.migration-venv` and install with Python 3.14. The environment is ignored by Git.

- [ ] **Step 2: Write failing snapshot and transformation tests**

Tests create a SQLite fixture in a temporary directory, keep a writer connection open, run the backup API, and prove `pragma integrity_check` returns `ok`. Transformation tests prove SQLite UUID bytes/strings, booleans, timestamps, and JSON are converted deterministically.

Add this owner-remap contract:

```python
def test_legacy_owners_map_to_new_admin():
    mapper = OwnerMapper(admin_id=UUID(ADMIN_ID))
    assert mapper.person_owner(UUID(LEGACY_CONSULTANT_ID)) == UUID(ADMIN_ID)
    assert mapper.position_owner(UUID(LEGACY_LEADER_ID)) == UUID(ADMIN_ID)
```

- [ ] **Step 3: Verify tests fail**

```powershell
& .\.migration-venv\Scripts\python.exe -m pytest tools\migration\tests -v
```

- [ ] **Step 4: Implement safe snapshot creation**

Use `sqlite3.Connection.backup()` into a new timestamped file under `backups/`, run `pragma integrity_check`, record SHA-256, source path, byte size, creation time, and all source row counts in a sidecar manifest. Never overwrite an existing snapshot.

- [ ] **Step 5: Implement dependency-ordered migration**

Import tables in this fixed order:

```python
TABLE_ORDER = [
    "organizations", "persons", "papers", "projects", "events",
    "positions", "tags", "experiences", "person_external_ids", "paper_authors",
    "project_contributors", "event_participants", "relationships",
    "relationship_evidence", "contacts", "outreach_records",
    "person_position_matches", "person_tags", "source_records", "merge_tasks",
    "audit_logs",
]
```

`profiles` is not in `TABLE_ORDER` and is not copied from SQLite; the bootstrap admin already exists. The migrator remaps owner references to its ID. `--dry-run` reads and transforms without writing. `--replace` is refused unless `--confirm-project-ref` exactly equals `SUPABASE_PROJECT_REF`. Replace mode deletes only the enumerated migrated business tables in reverse dependency order and never touches Auth users or profiles.

- [ ] **Step 6: Implement verification**

Compare all 21 business row counts, duplicate UUIDs, foreign-key orphans, the 40 owner references, and deterministic samples from persons, organizations, papers, positions, relationships, and evidence. Emit machine-readable JSON and a human summary; exit nonzero on any mismatch.

- [ ] **Step 7: Implement interactive bootstrap and remote export**

`bootstrap_admin.py` reads username with `input()` and password with `getpass.getpass()`, checks password confirmation, derives the internal email, creates the Auth user through the admin endpoint, inserts the active admin profile, and clears local variables. It never accepts the password as a command-line argument.

`export_remote.py` streams each business table plus profiles to timestamped gzip JSONL files under `backups/remote/`, writes counts and SHA-256 values, and never exports `auth.users` or password material.

`run_sql_contracts.py` connects with `SUPABASE_DB_URL`, executes the four SQL contract files with stop-on-error semantics, and verifies each script ends with `rollback`. `verify_roles.py` creates temporary Auth users through the admin endpoint, inserts profiles for leader/consultant/operator, exercises the Data API with each real session, disables them, confirms access is lost, and deletes all temporary fixtures in a `finally` block.

- [ ] **Step 8: Run migration-tool tests**

```powershell
& .\.migration-venv\Scripts\python.exe -m pytest tools\migration\tests -v
```

Expected: all unit tests pass without requiring a live Supabase project.

- [ ] **Step 9: Commit migration tooling**

```powershell
git add tools/migration .gitignore
git commit -m "feat: add verified SQLite to Supabase migration tools"
```

---

### Task 8: Convert Authentication and the Application Shell

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/next.config.js`
- Create: `frontend/.env.example`
- Create: `frontend/lib/supabase/client.ts`
- Create: `frontend/lib/auth/session.ts`
- Create: `frontend/lib/types.ts`
- Modify: `frontend/app/login/page.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/app/(main)/layout.tsx`
- Delete: `frontend/app/(main)/import/page.tsx`
- Create: `frontend/tests/session.test.ts`
- Create: `frontend/tests/static-config.test.ts`

- [ ] **Step 1: Install the Supabase browser client**

```powershell
Set-Location frontend
npm install @supabase/supabase-js@2.110.8
```

- [ ] **Step 2: Write failing static-config and session tests**

Tests assert that the client refuses missing public variables, login derives the internal email and calls `signInWithPassword`, profile validation rejects missing/disabled profiles, logout calls Supabase, and `next.config.js` declares `output: 'export'`, `basePath: '/talent-graph'`, `trailingSlash: true`, and no rewrites.

- [ ] **Step 3: Implement static export configuration**

```js
const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
  output: 'export',
  reactStrictMode: true,
  trailingSlash: true,
  basePath: isProduction ? '/talent-graph' : '',
  assetPrefix: isProduction ? '/talent-graph/' : '',
  images: { unoptimized: true },
};
```

Remove the FastAPI rewrite.

- [ ] **Step 4: Implement the Supabase session service**

`loginWithUsername(username, password)` derives the internal email and uses `signInWithPassword`. It then selects the caller's profile, requires `status === 'active'`, and signs out before returning a generic error if validation fails. `getActiveSession()` rechecks the profile on every app bootstrap. Subscribe to Auth state changes for expiry/logout, but do not treat cached profile data as authorization.

- [ ] **Step 5: Replace the login and shell flow**

The root page waits for `getActiveSession()` and routes to login or dashboard. The main layout shows a loading shell until validation completes and redirects disabled/invalid sessions to login. The login form label changes from email to username and never displays the derived internal email.

Remove the import route and its navigation item because resume parsing is outside first-release scope. This also removes the known missing `ResumeParseResult` build failure.

- [ ] **Step 6: Run frontend auth checks**

```powershell
npm test
npm run typecheck
npm run build
```

Expected: tests, TypeScript, and the static export all pass; `frontend/out` exists and contains no `/api` rewrite dependency.

- [ ] **Step 7: Commit static authentication**

```powershell
Set-Location ..
git add frontend/package.json frontend/package-lock.json frontend/next.config.js frontend/.env.example frontend/lib frontend/app frontend/tests
git commit -m "feat: add Supabase login and static application shell"
```

---

### Task 9: Replace FastAPI Calls with Typed Supabase Data Services

**Files:**
- Create: `frontend/lib/data/dashboard.ts`
- Create: `frontend/lib/data/persons.ts`
- Create: `frontend/lib/data/relationships.ts`
- Create: `frontend/lib/data/organizations.ts`
- Create: `frontend/lib/data/positions.ts`
- Create: `frontend/lib/data/outreach.ts`
- Create: `frontend/lib/data/review.ts`
- Create: `frontend/lib/data/members.ts`
- Create: `frontend/lib/data/audit.ts`
- Create: `frontend/lib/data/exports.ts`
- Create: `frontend/components/forms/person-form.tsx`
- Create: `frontend/components/forms/position-form.tsx`
- Create: `frontend/components/forms/contact-form.tsx`
- Create: `frontend/components/forms/outreach-form.tsx`
- Create: `frontend/app/(main)/settings/members/page.tsx`
- Create: `frontend/app/(main)/settings/audit/page.tsx`
- Delete: `frontend/lib/api.ts`
- Modify: `frontend/app/(main)/dashboard/page.tsx`
- Modify: `frontend/app/(main)/discovery/page.tsx`
- Modify: `frontend/app/(main)/graph/page.tsx`
- Modify: `frontend/app/(main)/organizations/page.tsx`
- Modify: `frontend/app/(main)/outreach/page.tsx`
- Modify: `frontend/app/(main)/persons/page.tsx`
- Modify: `frontend/app/(main)/positions/page.tsx`
- Modify: `frontend/app/(main)/review/page.tsx`
- Move: `frontend/app/(main)/persons/[id]/page.tsx` to `frontend/app/(main)/persons/detail/page.tsx`
- Create: `frontend/tests/data-services.test.ts`
- Create: `frontend/tests/person-detail-route.test.tsx`

- [ ] **Step 1: Write failing service contract tests**

Mock the Supabase client and assert:

- Person search sends page number, page size at most 100, and typed filters to `search_persons`.
- Graph loading sends `max_nodes` at most 50 to `relationship_graph`.
- Contacts use `masked_contacts_for_person`, never direct `contacts` select.
- Updates send the original `updated_at` to `update_person_if_current`.
- Consultant outreach requests the caller-scoped queue.
- Merge uses `merge_people` and surfaces permission errors.
- Member creation calls only the authenticated `manage-member` Edge Function.
- Audit queries are administrator-only and paginated.
- Export requests call `export_business_snapshot` and are available only to administrator and leader profiles.

- [ ] **Step 2: Verify the tests fail**

```powershell
Set-Location frontend
npm test -- data-services.test.ts person-detail-route.test.tsx
```

- [ ] **Step 3: Implement focused domain services**

Each module accepts a Supabase client interface for testing, calls one table/RPC boundary, maps database errors into `AuthError`, `PermissionError`, `ConflictError`, `NetworkError`, or `DataError`, and returns the existing page-facing types. Do not recreate a generic string-path router.

Use this error boundary shape:

```ts
export class ConflictError extends Error {
  readonly code = 'record_conflict';
}

export function mapSupabaseError(error: { code?: string; message: string }): Error {
  if (error.code === 'P0001' && error.message.includes('record_conflict')) {
    return new ConflictError('记录已被其他成员修改，请刷新后重试');
  }
  return new DataError('数据请求失败，请稍后重试');
}
```

- [ ] **Step 4: Convert list and dashboard pages**

Replace existing `api.get/post` calls in dashboard, discovery, persons, organizations, positions, outreach, review, and graph pages with the matching service functions. Keep existing loading and presentation behavior. Hide bulk-sync status and resume-import navigation because those features are excluded.

- [ ] **Step 5: Convert person details to a static route**

Move the page to `persons/detail/page.tsx`, read `id` with `useSearchParams`, show a safe not-found state when absent, and wrap the query-parameter component in `Suspense`. Update every person link to use `personDetailHref(id)`.

- [ ] **Step 6: Implement conflict and retry UX**

Forms retain their state on `NetworkError`. On `ConflictError`, show the approved refresh message and do not retry automatically. Permission errors show a role-safe message and refresh the live profile to detect account disablement.

- [ ] **Step 7: Add the approved first-release edit and administration surfaces**

Add focused dialogs for creating and editing persons and positions, adding contacts, and adding outreach records. Each dialog allowlists only fields supported by the corresponding table/RPC, submits through the domain service, retains input on network errors, and closes only after a confirmed write. Destructive actions are soft-delete for non-admin roles; permanent delete controls render only for active administrators and still rely on RLS.

Add administrator-only member and audit pages. Member creation collects username, display name, department, role, and a password entered twice, then clears password fields in a `finally` block. Member disablement requires an explicit confirmation naming the display name. The audit page shows paginated event type, actor display name, target type, target ID, and timestamp without showing tokens, raw request bodies, or contact values. Add an export action visible only to administrators and leaders; generate the file from the trusted export function, omit Auth and audit internals, and revoke the object URL after download.

- [ ] **Step 8: Verify no FastAPI runtime dependency remains**

```powershell
npm test
npm run typecheck
npm run build
Set-Location ..
rg -n "api\.(get|post|put|del|upload)|/api/|127\.0\.0\.1:8000|localhost:8000" frontend -g '!node_modules/**' -g '!.next/**' -g '!out/**'
```

Expected: all checks pass and the search returns no production source hits.

- [ ] **Step 9: Commit the data-service conversion**

```powershell
git add frontend/lib frontend/app frontend/tests
git commit -m "feat: connect first-release pages to Supabase"
```

---

### Task 10: Add Pages CI, Artifact Safety Checks, and the Operations Runbook

**Files:**
- Modify: `README.md`
- Create: `.github/workflows/pages.yml`
- Create: `frontend/tests/build-artifact.test.ts`
- Create: `docs/operations/supabase-pages-runbook.md`

- [ ] **Step 1: Write a failing artifact test**

After a build, recursively scan `frontend/out` and reject `persons.json`, `details.json`, `dashboard.json`, `sync.json`, SQLite headers, PostgreSQL URIs, `sb_secret_`, and source database filenames. Assert the artifact contains login and 404 pages.

- [ ] **Step 2: Verify the test fails before build-artifact support exists**

```powershell
Set-Location frontend
npm test -- build-artifact.test.ts
```

- [ ] **Step 3: Implement the GitHub Pages workflow**

Use Node 22 because current Supabase JS no longer supports Node 20. The workflow must:

```yaml
permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: 22
          cache: npm
          cache-dependency-path: frontend/package-lock.json
      - run: npm ci
        working-directory: frontend
      - run: npm test
        working-directory: frontend
      - run: npm run typecheck
        working-directory: frontend
      - run: npm run build
        working-directory: frontend
        env:
          NEXT_PUBLIC_SUPABASE_URL: ${{ vars.NEXT_PUBLIC_SUPABASE_URL }}
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ vars.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY }}
      - run: python tools/repo_guard.py --repo . --tracked --artifact frontend/out
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v4
        with:
          path: frontend/out
  deploy:
    needs: build
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Trigger on pushes to `main` and `workflow_dispatch`.

- [ ] **Step 4: Replace the legacy README with public production documentation**

Describe the static frontend and Supabase architecture, local frontend setup, public environment-variable names, tests, build, Pages deployment, first-release scope, and the rule that no business data belongs in Git. Remove all demonstration usernames, passwords, local FastAPI startup instructions, and claims that excluded phase-two features are online.

- [ ] **Step 5: Write the runbook**

Document exact environment variable names, project region, Auth signup disablement, migration commands, verification commands, Pages variables, final URL checks, remote backup creation, previous-artifact redeploy, account disablement, and secret rotation. State that business data never goes into Git or Pages.

- [ ] **Step 6: Run local release checks**

```powershell
Set-Location frontend
npm test
npm run typecheck
npm run build
Set-Location ..
& .\backend\.venv\Scripts\python.exe tools\repo_guard.py --repo . --tracked --artifact frontend\out
git diff --check
```

- [ ] **Step 7: Commit deployment automation**

```powershell
git add README.md .github/workflows/pages.yml frontend/tests/build-artifact.test.ts docs/operations/supabase-pages-runbook.md
git commit -m "ci: add safe GitHub Pages deployment"
```

---

### Task 11: Provision the Empty Supabase Project and Apply the Backend

**Files:**
- Local only, ignored: `frontend/.env.local`
- Local only, ignored: Supabase CLI link state under `supabase/.temp/`

- [ ] **Step 1: Create the project through the signed-in Supabase dashboard**

Create a new project named `talent-graph` in Singapore (`ap-southeast-1`) under the user's existing organization. Generate a unique database password and store it in the user's password manager, not in chat or files.

- [ ] **Step 2: Confirm the project is healthy and record non-secret identifiers**

Record the Project Ref and project URL in the local operator session. Confirm Database, Auth, and Storage report healthy. Do not expose the secret key in output.

- [ ] **Step 3: Authenticate and link the CLI**

```powershell
npx supabase@latest login
npx supabase@latest link --project-ref $env:SUPABASE_PROJECT_REF
npx supabase@latest db push --linked
```

Expected: all four migrations apply successfully to the empty project.

- [ ] **Step 4: Disable public signup and deploy member management**

In Supabase Auth settings, disable new-user signup. Set the `ALLOWED_ORIGINS` function environment variable to `http://localhost:3000` plus the exact GitHub Pages origin for the signed-in GitHub account. Deploy:

```powershell
npx supabase@latest functions deploy manage-member --project-ref $env:SUPABASE_PROJECT_REF
```

Keep JWT verification enabled.

- [ ] **Step 5: Run remote SQL contracts**

Execute `schema_contract.sql`, `rls_contract.sql`, `read_api_contract.sql`, and `storage_contract.sql` against the project using `run_sql_contracts.py`. Each script runs in a transaction and rolls back fixtures.

Expected: every assertion passes and production tables remain empty.

- [ ] **Step 6: Create the initial administrator interactively**

Set the project URL and secret key only in the current process environment, then run:

```powershell
& .\.migration-venv\Scripts\python.exe tools\migration\bootstrap_admin.py
```

The user enters the chosen username and password at the hidden prompts. Verify exactly one active admin profile exists. Clear the secret-key environment variable after use.

- [ ] **Step 7: Save only public frontend variables locally**

Create `frontend/.env.local` with project URL and publishable key. Run `tools/repo_guard.py --tracked` to confirm the ignored file is not tracked.

---

### Task 12: Rehearse and Verify the Data Migration

**Files:**
- Generated locally and ignored: `backups/sqlite/` and `backups/remote/`
- Generated locally and ignored: `reports/migration/`

- [ ] **Step 1: Create a consistent SQLite snapshot**

```powershell
& .\.migration-venv\Scripts\python.exe tools\migration\snapshot.py --source backend\talent_graph.db --output-dir backups\sqlite
```

Expected: integrity check `ok`, a SHA-256 manifest, and source counts including 14,319 persons, 108,762 relationships, and 109,216 relationship evidence rows unless legitimate local writes occurred after design approval.

- [ ] **Step 2: Run migration dry-run**

```powershell
& .\.migration-venv\Scripts\python.exe tools\migration\migrate.py --snapshot-manifest $env:SQLITE_SNAPSHOT_MANIFEST --dry-run --admin-id $env:SUPABASE_ADMIN_ID
```

Expected: all 21 tables transform successfully; exactly 30 person owners and 10 position owners are remapped.

- [ ] **Step 3: Export the empty remote baseline**

```powershell
& .\.migration-venv\Scripts\python.exe tools\migration\export_remote.py --output-dir backups\remote
```

Expected: profiles contain one admin; business tables are empty.

- [ ] **Step 4: Import the rehearsal snapshot**

```powershell
& .\.migration-venv\Scripts\python.exe tools\migration\migrate.py --snapshot-manifest $env:SQLITE_SNAPSHOT_MANIFEST --admin-id $env:SUPABASE_ADMIN_ID
```

- [ ] **Step 5: Verify migration results**

```powershell
& .\.migration-venv\Scripts\python.exe tools\migration\verify.py --snapshot-manifest $env:SQLITE_SNAPSHOT_MANIFEST --report reports\migration\rehearsal.json
```

Expected: exact counts for all 21 tables, zero duplicate UUIDs, zero foreign-key orphans, all deterministic samples match, and all 40 legacy owner references point to the new admin.

- [ ] **Step 6: Run live role verification**

Run:

```powershell
& .\.migration-venv\Scripts\python.exe tools\migration\verify_roles.py --project-ref $env:SUPABASE_PROJECT_REF
```

The tool creates temporary leader, consultant, and operator accounts through `manage-member`, exercises allowed and denied operations, disables them, proves their existing sessions lose data access, and deletes the fixtures in `finally`. Generated passwords remain only in process memory.

- [ ] **Step 7: Record rehearsal evidence**

Add only non-sensitive counts, pass/fail results, timestamps, and project region to the runbook deployment record. Do not commit UUID samples, names, contacts, tokens, or report files.

---

### Task 13: Add Browser-Level Static and Production Tests

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/playwright.config.ts`
- Create: `frontend/e2e/auth-shell.spec.ts`
- Create: `frontend/e2e/navigation.spec.ts`
- Create: `frontend/e2e/data-access.spec.ts`

- [ ] **Step 1: Install Playwright test tooling**

```powershell
Set-Location frontend
npm install --save-dev @playwright/test@latest
npx playwright install chromium
```

Add `"test:e2e": "playwright test"`.

- [ ] **Step 2: Write authentication-shell tests**

Verify unauthenticated visits show only login content and make no business RPC requests; wrong usernames and wrong passwords show the same generic message; successful admin login reaches dashboard; logout returns to login.

- [ ] **Step 3: Write static-route and data tests**

Verify direct loading of `/talent-graph/persons/detail/?id=` works, refresh preserves the session, search paginates without downloading all persons, graph responses remain bounded, and the import workflow is absent.

- [ ] **Step 4: Write permission-facing tests**

Using temporary role credentials supplied through environment variables, verify operator contact display is masked, consultant follow-ups are caller-scoped, non-admin member controls are absent, and permission errors do not leak SQL details.

- [ ] **Step 5: Run local static-server E2E**

```powershell
npm run build
$server = Start-Process -FilePath 'npx.cmd' -ArgumentList 'serve','out','-l','4173' -PassThru -WindowStyle Hidden
try { npm run test:e2e } finally { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
```

Expected: all Chromium tests pass against the static export and rehearsal Supabase data.

- [ ] **Step 6: Commit browser coverage**

```powershell
Set-Location ..
git add frontend/package.json frontend/package-lock.json frontend/playwright.config.ts frontend/e2e
git commit -m "test: cover authenticated static production flows"
```

---

### Task 14: Publish the Safe Public Repository and GitHub Pages Site

**Files:**
- No new source files expected.

- [ ] **Step 1: Run the complete pre-publication gate**

```powershell
& .\backend\.venv\Scripts\python.exe -m pytest backend\tests tools\tests tools\migration\tests -q
Set-Location frontend
npm test
npm run typecheck
npm run build
npm run test:e2e
Set-Location ..
& .\backend\.venv\Scripts\python.exe tools\repo_guard.py --repo . --tracked --artifact frontend\out
git diff --check
git status --short
```

Expected: all tests pass; no findings; only deliberate source changes are tracked; no database, snapshot, environment, output, or business JSON file is staged.

- [ ] **Step 2: Audit the complete Git history**

Run the implemented history scan, not just the working-tree scan:

```powershell
& .\backend\.venv\Scripts\python.exe tools\repo_guard.py --repo . --history
```

Expected: no forbidden business data or secrets in any reachable commit.

- [ ] **Step 3: Create the public GitHub repository**

Using the user's signed-in GitHub session, create a public repository named `talent-graph` with no generated README, license, or `.gitignore`. Add it as `origin` through Git Credential Manager and verify the exact remote URL before pushing.

- [ ] **Step 4: Configure repository variables and Pages**

Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` as GitHub Actions repository variables. Do not create a repository secret containing a Supabase secret key. Configure Pages source as GitHub Actions.

- [ ] **Step 5: Push and monitor deployment**

```powershell
git push -u origin main
```

Wait for the Pages workflow. Confirm the build, test, guard, artifact, and deployment jobs succeed before sharing the URL.

- [ ] **Step 6: Run production URL smoke tests**

Verify HTTPS, login shell isolation, admin login, person pagination/details, graph bounds, positions, outreach, logout, and direct detail-page refresh at the actual `github.io/talent-graph/` URL. Confirm browser console and network logs contain no secret key, SQL error, or bulk data response.

---

### Task 15: Perform Final Cutover and Record Recovery Evidence

**Files:**
- Modify: `docs/operations/supabase-pages-runbook.md`

- [ ] **Step 1: Determine whether local data changed after rehearsal**

Compare the live SQLite row counts and last-modified time with the rehearsal manifest. If unchanged, do not reimport. If changed, continue with the controlled final snapshot.

- [ ] **Step 2: Pause local writes and create backups**

Stop the local application through its normal shutdown path. Confirm no process is writing the database. Create a new consistent SQLite snapshot and a new compressed remote Supabase export. Record both SHA-256 manifests locally.

- [ ] **Step 3: Replace only migrated business data when required**

```powershell
& .\.migration-venv\Scripts\python.exe tools\migration\migrate.py --snapshot-manifest $env:FINAL_SQLITE_SNAPSHOT_MANIFEST --admin-id $env:SUPABASE_ADMIN_ID --replace --confirm-project-ref $env:SUPABASE_PROJECT_REF
```

Expected: only the 21 business tables are replaced; Auth users and profiles remain intact; all 40 legacy ownership references map to the administrator.

- [ ] **Step 4: Run final verification before allowing normal writes**

Run row-count, orphan, sample, role, disabled-account, artifact, and browser production checks. If any fails, keep writes paused and restore from the just-created remote export or fix forward before reopening access.

- [ ] **Step 5: Record non-sensitive deployment evidence**

Update the runbook with deployment URL, region, migration timestamp, source and destination counts, verification pass summary, Pages workflow run reference, backup locations, and rollback procedure. Do not record passwords, tokens, database URLs containing credentials, personal names, contacts, or sampled UUIDs.

- [ ] **Step 6: Commit the final operations record**

```powershell
git add docs/operations/supabase-pages-runbook.md
git commit -m "docs: record Talent Graph production cutover"
git push origin main
```

- [ ] **Step 7: Confirm the recovery boundary**

Verify the original `backend/talent_graph.db`, the final consistent SQLite snapshot, and the latest remote compressed export all exist outside Git and were not deleted or overwritten. Re-run the repository guard after the final push.

---

## Final Definition of Done

- All pre-existing backend tests and all new repository, schema, RLS, migration, frontend, and browser tests pass.
- The dedicated Singapore Supabase project contains all 21 business tables and the approved data.
- The five demonstration users do not exist in production Auth.
- The new administrator owns the remapped 30 persons and 10 positions.
- Anonymous, disabled, and insufficient-role access attempts fail at the database or trusted-function boundary.
- The operator cannot retrieve raw contact values by any client-accessible table, view, or RPC.
- The public Git repository and complete Git history contain no business data or secrets.
- GitHub Pages serves the approved first-release workflows from the static `/talent-graph/` path.
- The original SQLite database, a consistent final snapshot, and a remote export remain recoverable outside Git.
