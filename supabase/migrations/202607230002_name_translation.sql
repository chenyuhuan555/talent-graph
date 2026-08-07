-- Name translation support for organizations and papers.
--
-- Scope of change:
--   * Adds nullable translated-name columns; existing original columns are
--     never modified. When a *_zh column is null the UI falls back to the
--     original text, so this migration is safe to apply before any content is
--     translated.
--   * Adds a service-role-only translation_cache table so repeated company,
--     school or paper titles are not re-billed against DeepSeek.
--   * Extends organizations_search so the Chinese translation is matched in
--     addition to the original name / english_name. Behaviour for existing
--     callers is unchanged (same signature, same JSON shape).
--
-- Rollback (safe, no business-data loss):
--   drop function if exists public.organizations_search(text,text,integer,integer);
--   -- then re-create the previous definition from 202607220003_read_api.sql
--   drop table if exists public.translation_cache;
--   alter table public.organizations drop column if exists name_zh;
--   alter table public.papers drop column if exists title_zh;
--
-- This migration does not touch RLS on existing tables, existing role grants,
-- person data, or the migrated SQLite history.

alter table public.organizations add column if not exists name_zh text;
alter table public.papers add column if not exists title_zh text;

-- Translation cache. Only the service_role (used by the Edge Function) may read
-- or write it. RLS is enabled with no policy for authenticated users, so browser
-- clients cannot access it; service_role bypasses RLS by design.
create table if not exists public.translation_cache (
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

alter table public.translation_cache enable row level security;

-- Ensure browser roles have no direct access; service_role keeps full access
-- through the schema-wide grant applied in the RLS migration.
revoke all on public.translation_cache from public;
revoke all on public.translation_cache from anon;
revoke all on public.translation_cache from authenticated;
grant all privileges on public.translation_cache to service_role;

create index if not exists idx_translation_cache_lookup
  on public.translation_cache (content_type, target_language, source_text);

-- Search now also matches the translated Chinese name. Signature is unchanged.
create or replace function public.organizations_search(
  search_term text default null,
  organization_type_filter text default null,
  page_number integer default 1,
  page_size integer default 20
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  safe_page integer := greatest(1, page_number);
  safe_size integer := least(100, greatest(1, page_size));
  total_rows bigint;
  rows jsonb;
begin
  if not public.is_active_member() then raise exception using errcode = '42501', message = 'not_authorized'; end if;
  select count(*) into total_rows from public.organizations o
  where o.deleted_at is null
    and (search_term is null
      or coalesce(o.name, '') ilike '%' || search_term || '%'
      or coalesce(o.english_name, '') ilike '%' || search_term || '%'
      or coalesce(o.name_zh, '') ilike '%' || search_term || '%')
    and (organization_type_filter is null or o.organization_type = organization_type_filter);
  select coalesce(jsonb_agg(to_jsonb(q) order by q.name, q.id), '[]'::jsonb) into rows
  from (select o.* from public.organizations o where o.deleted_at is null
    and (search_term is null
      or coalesce(o.name, '') ilike '%' || search_term || '%'
      or coalesce(o.english_name, '') ilike '%' || search_term || '%'
      or coalesce(o.name_zh, '') ilike '%' || search_term || '%')
    and (organization_type_filter is null or o.organization_type = organization_type_filter)
    order by o.name, o.id limit safe_size offset ((safe_page - 1) * safe_size)) q;
  return jsonb_build_object('data', rows, 'pagination', jsonb_build_object(
    'pageNumber', safe_page, 'pageSize', safe_size, 'totalCount', total_rows,
    'totalPages', case when total_rows = 0 then 0 else ceil(total_rows::numeric / safe_size)::integer end));
end
$$;

grant execute on function public.organizations_search(text,text,integer,integer) to authenticated;

-- Paper search that matches original title and Chinese translation. New RPC, so
-- existing callers are unaffected; only added, never replacing paper reads.
create or replace function public.papers_search(
  search_term text default null,
  page_number integer default 1,
  page_size integer default 20
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  safe_page integer := greatest(1, page_number);
  safe_size integer := least(100, greatest(1, page_size));
  total_rows bigint;
  rows jsonb;
begin
  if not public.is_active_member() then raise exception using errcode = '42501', message = 'not_authorized'; end if;
  select count(*) into total_rows from public.papers p
  where (search_term is null
    or coalesce(p.title, '') ilike '%' || search_term || '%'
    or coalesce(p.title_zh, '') ilike '%' || search_term || '%');
  select coalesce(jsonb_agg(to_jsonb(q) order by q.publication_date desc nulls last, q.id), '[]'::jsonb) into rows
  from (select p.* from public.papers p where (search_term is null
    or coalesce(p.title, '') ilike '%' || search_term || '%'
    or coalesce(p.title_zh, '') ilike '%' || search_term || '%')
    order by p.publication_date desc nulls last, p.id
    limit safe_size offset ((safe_page - 1) * safe_size)) q;
  return jsonb_build_object('data', rows, 'pagination', jsonb_build_object(
    'pageNumber', safe_page, 'pageSize', safe_size, 'totalCount', total_rows,
    'totalPages', case when total_rows = 0 then 0 else ceil(total_rows::numeric / safe_size)::integer end));
end
$$;

grant execute on function public.papers_search(text,integer,integer) to authenticated;
