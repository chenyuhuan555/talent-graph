# Talent Graph Supabase and GitHub Pages Design

## Status

Approved by the user on 2026-07-22. This document defines the first production deployment of `talent-graph`.

## Objective

Move the current AI Talent Graph application from a local SQLite database and static data snapshot to an authenticated online application for a small internal company team.

The production system will use:

- GitHub Pages for the static frontend.
- A public GitHub repository named `talent-graph` containing source code but no business data or secrets.
- A dedicated Supabase project named `talent-graph` in Singapore (`ap-southeast-1`).
- Supabase Auth, PostgreSQL, Row Level Security, Data API, private Storage, database functions, and Edge Functions.

The two existing Supabase-backed websites will not share a project, database, users, storage, quotas, or credentials.

## Current System

The application is located at `D:\yhccccc\2026-07-22-14-01-41` and contains:

- A Next.js 14 frontend under `frontend`.
- A FastAPI and SQLAlchemy backend under `backend`.
- A Python data pipeline under `data_pipeline`.
- Generated static snapshots under `deploy`, `deploy_final`, `deploy_lite`, and `deploy_test`.
- A primary SQLite database at `backend\talent_graph.db`, approximately 137 MB.

The generated `deploy\index.html` is a read-only snapshot. It has no authenticated live data client and is not the source to modify for the online application.

The primary SQLite database currently contains 22 tables. The `users` table has five demonstration accounts and will not be migrated. The other 21 business tables will be migrated. Important current counts include:

- 14,319 persons.
- 2,264 organizations.
- 1,937 papers.
- 108,762 relationships.
- 109,216 relationship evidence rows.
- 18,891 source records.
- 10 positions.

No upload directory or existing uploaded files were found during design inspection.

## Architecture

The browser loads a static application from GitHub Pages. Before authentication, the application renders only the login shell and does not load business data.

After authentication, the browser validates the live profile status and role, then accesses business data through the Supabase Data API. PostgreSQL RLS is the authorization boundary. UI visibility is not treated as authorization.

Routine, row-scoped reads and writes use the Data API. Privileged operations such as member management, bulk migration, backup restoration, and other administrative workflows use Edge Functions or administrator-only database functions. Private files use Supabase Storage with restrictive policies.

The FastAPI service will not be deployed in the first production architecture. Its supported first-release behavior will be translated into PostgreSQL functions, RLS policies, frontend data-access code, and narrowly scoped Edge Functions.

## GitHub Pages Frontend

The frontend will be built from maintainable source rather than by editing generated `deploy` artifacts.

The build must:

- Produce a static site compatible with the `/talent-graph/` base path.
- Avoid runtime dependence on a Next.js server.
- Replace server-only dynamic routes with GitHub Pages-compatible navigation, such as query-parameter detail views.
- Preserve the current visual design unless a change is required for authentication, permissions, static routing, or error handling.
- Paginate and filter on the database instead of downloading all persons or relationships.
- Limit relationship graph queries to the selected center person and a bounded set of nodes and edges.

The browser may persist the Supabase session and non-sensitive UI preferences. It must not use browser storage as the primary business database.

## Authentication

The application uses username and password. There is no public registration page.

Username processing is deterministic:

1. Normalize with Unicode NFKC.
2. Trim surrounding whitespace.
3. Convert to lowercase.
4. Hash with SHA-256.
5. Convert the result to an internal Supabase-compatible email-style identifier under an invalid, non-deliverable domain.

The same transformation is used by the login client and administrator account-management function. The public application does not expose a username directory. Authentication failures return the same message for an unknown username and an incorrect password.

The initial administrator chooses a new username and password interactively during provisioning. Neither value is stored in source control, design documents, migration files, command history, or logs.

The five demonstration accounts and their password hashes are not migrated. Supabase Auth becomes the only production password store.

## Profiles and Account State

An authenticated user has a corresponding protected profile containing display name, normalized username metadata, role, department, and status.

Only profiles with `status = 'active'` may access business data. Policies and privileged functions check current database state rather than relying only on role claims in a potentially stale JWT. Disabling a profile therefore removes data access even if the browser still has an unexpired session.

Only administrators may create, disable, or change the roles of members. There is no inactivity-based automatic logout requirement. Explicit logout and normal Supabase session expiry remain in effect.

## Roles and Permissions

### Administrator

- Full read and write access to business data.
- View full contact details.
- Manage members and roles.
- Run migration, backup, and restoration workflows.
- Export data.
- Permanently delete data where the business rules permit it.

### Project Leader

- Read all business data.
- Edit persons and positions.
- View full contact details.
- Add contact and outreach records.
- View all follow-up work.
- Export business data.
- Cannot manage members, run migrations, restore backups, or permanently delete data.

### Consultant

- Read business data.
- Edit persons and positions as permitted by business rules.
- View full contact details.
- Add contact and outreach records.
- View only their own follow-up work.
- Cannot export, manage members, migrate, restore, or permanently delete data.

### Data Operator

- Read business data.
- Edit public factual data.
- Import, clean, review, and merge data when those workflows are enabled.
- See masked contact details only.
- Cannot add private outreach records, export data, manage members, migrate production state, restore backups, or permanently delete data.

## Sensitive Data Controls

All exposed business tables have RLS enabled. Anonymous users have no business-table privileges.

Contact masking must occur in a database function or other trusted server-side boundary. Returning a full value and hiding it in the UI is prohibited.

Full-contact access, member administration, bulk import, destructive actions, migration, and restoration create audit records. Authorization data must not be stored in user-editable metadata.

The browser receives only the Supabase publishable key. Supabase secret keys, database passwords, migration credentials, and GitHub tokens are never committed or embedded in the static site.

## Database Migration

The source database was active and locked by a local process during design inspection. Migration must not copy the live file directly. It must first create a consistent SQLite backup using the SQLite backup mechanism or perform a controlled application stop and verified copy.

The migration preserves business UUIDs, timestamps, source provenance, soft-deletion values, and foreign-key relationships. Data is loaded in dependency order, followed by indexes, statistics, and search structures.

The legacy `users` table is replaced by Supabase Auth plus protected profiles. Existing business ownership references are remapped as follows:

- The 30 persons assigned to a demonstration consultant become owned by the new administrator.
- The 10 positions assigned to a demonstration project leader become owned by the new administrator.
- No old demonstration account remains usable or represented as a production login.

Generated JSON and HTML snapshots are not migration inputs.

## First-Release Scope

The first release includes:

- Username login, logout, session restoration, and account disabling.
- Dashboard.
- Person list, search, filtering, pagination, and details.
- Organizations, papers, projects, and relationship graph.
- Positions and existing match results.
- Contact masking and role-controlled full contact access.
- Outreach records and follow-up work.
- Routine create, update, and business-safe delete operations.
- Administrator member management.
- Permitted export and security audit records.

The first release does not include:

- Automatic PDF or DOCX resume parsing.
- External website collection.
- Bulk data synchronization.
- Full relationship-score recomputation.

Unavailable workflows must be removed from navigation or clearly marked as a future phase. They must not remain as controls that fail when selected.

## Concurrency and Error Handling

Updates carry the original `updated_at` value. A write succeeds only if the stored value still matches, preventing one member from silently overwriting a newer change from another member.

On conflict, the user is told that the record changed and is asked to reload before reapplying edits.

On network failure, unsaved form input remains visible and the application offers a retry. The client does not overwrite the remote database with stale local state.

Authentication and authorization errors clear or reject the affected operation without exposing internal database, policy, username, or credential details.

## Repository and Deployment Safety

The public `talent-graph` repository contains maintainable source, SQL migrations, tests, and the GitHub Actions Pages workflow. It excludes:

- SQLite files and journals.
- Generated `persons.json`, `details.json`, `dashboard.json`, and `sync.json` snapshots.
- Environment files and database connection strings.
- Supabase secret keys, GitHub tokens, and passwords.
- Uploaded resumes or contact exports.
- Virtual environments, dependency directories, build output, caches, and local work files.

Before the first push, the complete Git history and staged content are scanned for secrets and business data. A safe working tree alone is insufficient if earlier commits contain sensitive material.

GitHub Actions builds the static frontend and publishes it to the repository's Pages site. The Pages site is publicly reachable, but before login it exposes only non-sensitive application assets and the login shell.

## Verification

Migration verification includes:

- Exact row-count comparison for every migrated table.
- Duplicate UUID detection.
- Foreign-key orphan checks.
- Sampling of persons, organizations, papers, positions, relationships, and evidence chains.
- Verification that the 40 legacy ownership references map to the initial administrator.

Security verification includes:

- Anonymous denial for every business table and function.
- Positive and negative tests for all four roles.
- Confirmation that the operator cannot retrieve full contact values through tables, views, RPC, or Edge Functions.
- Confirmation that non-administrators cannot manage members, migrate, restore, or invoke privileged functions.
- Confirmation that disabled accounts lose access despite an existing session.
- Secret and sensitive-data scans of the public repository and built Pages artifact.

Browser verification includes:

- Login, logout, refresh, session restoration, and account switching.
- GitHub Pages base-path navigation and direct reload behavior.
- Person search, pagination, details, relationship graph, positions, and dashboard.
- Allowed and denied edits for representative roles.
- Conflict handling and network-error recovery.
- Production checks against the final Pages URL.

## Cutover and Rollback

The migration is rehearsed before cutover. Final cutover briefly stops local writes, creates a new consistent SQLite snapshot, imports it, reruns all validation, and only then switches the production frontend to Supabase.

The original SQLite database and consistent backup are retained and never automatically deleted.

Before each material Supabase schema or production-data change, an independent SQL backup is created. The prior Pages artifact remains deployable.

If migration validation fails, the online frontend is not switched. If a serious issue appears after launch, writes are paused and the previous Pages version is redeployed while the Supabase issue is repaired. Rollback must not delete or mutate the SQLite source database.

## Success Criteria

The project is complete when:

- The dedicated Supabase project is healthy in Singapore.
- All 21 business tables and approved ownership remapping pass migration validation.
- Only the new administrator and administrator-created active members can access data.
- The approved role matrix is enforced at the database and privileged-function boundaries.
- The first-release workflows work through the production GitHub Pages URL.
- The public repository and deployed artifact contain no business data or secrets.
- The previous local source data and a consistent migration snapshot remain recoverable.
