-- 多领域改造：单实例多领域（人工智能 / 量子计算 / 生物医药 / 具身智能 / 核聚变 / 新能源）
-- 1) industry 字段枚举约束  2) domain_configs 配置表  3) person_domains 多领域关联
-- 4) 读取 RPC 增加 industry_filter 参数（同一人才可属于多个领域，AI 为默认领域）

-- ---------------------------------------------------------------------------
-- 1. 归一化存量数据，然后收紧 industry 枚举
-- ---------------------------------------------------------------------------
update public.persons
set industry = '人工智能'
where industry is null
   or industry not in ('人工智能','量子计算','生物医药','具身智能','核聚变','新能源','交叉领域');

update public.positions
set industry = '人工智能'
where industry is null
   or industry not in ('人工智能','量子计算','生物医药','具身智能','核聚变','新能源','交叉领域');

alter table public.persons
  alter column industry drop default,
  add constraint chk_person_industry
    check (industry in ('人工智能','量子计算','生物医药','具身智能','核聚变','新能源','交叉领域'));

alter table public.positions
  alter column industry drop default,
  add constraint chk_position_industry
    check (industry in ('人工智能','量子计算','生物医药','具身智能','核聚变','新能源','交叉领域'));

-- ---------------------------------------------------------------------------
-- 2. 领域配置表
-- ---------------------------------------------------------------------------
create table public.domain_configs (
  domain_key text primary key,
  display_name text not null,
  display_name_zh text not null,
  keywords text not null,
  description text,
  color_theme text default '#2D6A4F',
  is_active boolean default true,
  sort_order integer default 0,
  created_at timestamptz not null default now()
);

insert into public.domain_configs
  (domain_key, display_name, display_name_zh, keywords, color_theme, sort_order) values
  ('ai', 'Artificial Intelligence', '人工智能',
   'large language model,multimodal AI,AI agent,AI infrastructure', '#2D6A4F', 0),
  ('quantum_computing', 'Quantum Computing', '量子计算',
   'quantum computing,quantum error correction,quantum algorithm,qubit', '#4A3F8C', 1),
  ('biomedicine', 'Biomedicine', '生物医药',
   'drug discovery,bioinformatics,genomics,protein folding,CRISPR', '#1E5C8E', 2),
  ('embodied_ai', 'Embodied AI', '具身智能',
   'embodied AI,robotics manipulation,humanoid robot,locomotion,Sim2Real', '#B85C2E', 3),
  ('fusion_energy', 'Fusion Energy', '核聚变',
   'nuclear fusion,tokamak,stellarator,plasma physics,inertial confinement', '#8C2D2D', 4),
  ('new_energy', 'New Energy', '新能源',
   'solid state battery,perovskite solar,hydrogen energy,energy storage,EV battery', '#B89A2E', 5);

alter table public.domain_configs enable row level security;

create policy domain_configs_select on public.domain_configs
  for select to authenticated
  using (public.is_active_member());

grant select on public.domain_configs to authenticated;

-- ---------------------------------------------------------------------------
-- 3. 人才-领域多对多关联（允许同一人才属于多个领域）
-- ---------------------------------------------------------------------------
create table public.person_domains (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  domain text not null
    check (domain in ('人工智能','量子计算','生物医药','具身智能','核聚变','新能源','交叉领域')),
  is_primary boolean not null default false,
  source_type text default 'system',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_person_domain unique (person_id, domain)
);

create index idx_person_domains_person on public.person_domains (person_id);
create index idx_person_domains_domain on public.person_domains (domain);

alter table public.person_domains enable row level security;

create policy person_domains_select on public.person_domains
  for select to authenticated
  using (public.is_active_member());

create policy person_domains_write on public.person_domains
  for insert to authenticated
  with check (coalesce(public.current_app_role() in ('admin','leader','consultant','operator'), false));

create policy person_domains_delete on public.person_domains
  for delete to authenticated
  using (coalesce(public.current_app_role() in ('admin','leader'), false));

grant select, insert, delete on public.person_domains to authenticated;

-- 存量回填：以当前 industry 作为主领域
insert into public.person_domains (person_id, domain, is_primary, source_type)
select id, coalesce(industry, '人工智能'), true, 'backfill'
from public.persons
on conflict (person_id, domain) do nothing;

-- ---------------------------------------------------------------------------
-- 4. 触发器：industry 默认 AI；industry 写入时自动同步 person_domains
-- ---------------------------------------------------------------------------
create or replace function public.person_industry_default() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.industry := coalesce(nullif(new.industry, ''), '人工智能');
  return new;
end
$$;

create trigger trg_person_industry_default
  before insert on public.persons
  for each row execute function public.person_industry_default();

create or replace function public.sync_person_domain() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.industry is not null then
    insert into public.person_domains (person_id, domain, is_primary, source_type)
    values (new.id, new.industry, tg_op = 'INSERT', 'auto')
    on conflict (person_id, domain) do nothing;
  end if;
  return new;
end
$$;

create trigger trg_sync_person_domain
  after insert or update of industry on public.persons
  for each row execute function public.sync_person_domain();

-- ---------------------------------------------------------------------------
-- 5. 读取 RPC 增加 industry_filter（追加在参数末尾，保持既有位置参数兼容）
-- ---------------------------------------------------------------------------
drop function if exists public.dashboard_summary();

create function public.dashboard_summary(industry_filter text default null) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  return jsonb_build_object(
    'persons', (
      select count(*) from public.persons p
      where p.deleted_at is null
        and (industry_filter is null or industry_filter = ''
          or p.industry = industry_filter
          or exists (select 1 from public.person_domains pd
                     where pd.person_id = p.id and pd.domain = industry_filter))
    ),
    'organizations', (select count(*) from public.organizations where deleted_at is null),
    'positions', (
      select count(*) from public.positions
      where deleted_at is null and status = 'open'
        and (industry_filter is null or industry_filter = '' or industry = industry_filter)
    ),
    'relationships', (
      select count(*) from public.relationships r
      where industry_filter is null or industry_filter = ''
        or (
          exists (select 1 from public.person_domains pa
                  where pa.person_id = r.person_a_id and pa.domain = industry_filter)
          and exists (select 1 from public.person_domains pb
                      where pb.person_id = r.person_b_id and pb.domain = industry_filter)
        )
    ),
    'pendingFollowUps', (
      select count(*) from public.outreach_records
      where next_follow_up_at is not null and next_follow_up_at <= now()
        and (
          public.current_app_role() in ('admin', 'leader')
          or user_id = (select auth.uid())
        )
    )
  );
end
$$;

drop function if exists public.search_persons(text,text,text,uuid,uuid,integer,integer);

create function public.search_persons(
  search_term text default null,
  domain_filter text default null,
  level_filter text default null,
  organization_filter uuid default null,
  owner_filter uuid default null,
  page_number integer default 1,
  page_size integer default 20,
  industry_filter text default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  safe_page integer := greatest(1, page_number);
  safe_size integer := least(100, greatest(1, page_size));
  total_rows bigint;
  rows jsonb;
begin
  if not public.is_active_member() then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  select count(*) into total_rows
  from public.persons p
  where p.deleted_at is null
    and (search_term is null or search_term = '' or
      coalesce(p.chinese_name, '') ilike '%' || search_term || '%' or
      coalesce(p.english_name, '') ilike '%' || search_term || '%' or
      coalesce(p.current_position, '') ilike '%' || search_term || '%')
    and (domain_filter is null or p.primary_domain = domain_filter)
    and (level_filter is null or p.talent_level = level_filter)
    and (organization_filter is null or p.current_organization_id = organization_filter)
    and (owner_filter is null or p.owner_user_id = owner_filter)
    and (industry_filter is null or industry_filter = ''
      or p.industry = industry_filter
      or exists (select 1 from public.person_domains pd
                 where pd.person_id = p.id and pd.domain = industry_filter));

  select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc, q.id), '[]'::jsonb)
    into rows
  from (
    select p.*
    from public.persons p
    where p.deleted_at is null
      and (search_term is null or search_term = '' or
        coalesce(p.chinese_name, '') ilike '%' || search_term || '%' or
        coalesce(p.english_name, '') ilike '%' || search_term || '%' or
        coalesce(p.current_position, '') ilike '%' || search_term || '%')
      and (domain_filter is null or p.primary_domain = domain_filter)
      and (level_filter is null or p.talent_level = level_filter)
      and (organization_filter is null or p.current_organization_id = organization_filter)
      and (owner_filter is null or p.owner_user_id = owner_filter)
      and (industry_filter is null or industry_filter = ''
        or p.industry = industry_filter
        or exists (select 1 from public.person_domains pd
                   where pd.person_id = p.id and pd.domain = industry_filter))
    order by p.updated_at desc, p.id
    limit safe_size offset ((safe_page - 1) * safe_size)
  ) q;

  return jsonb_build_object(
    'data', rows,
    'pagination', jsonb_build_object(
      'pageNumber', safe_page,
      'pageSize', safe_size,
      'totalCount', total_rows,
      'totalPages', case when total_rows = 0 then 0 else ceil(total_rows::numeric / safe_size)::integer end
    )
  );
end
$$;

drop function if exists public.discover_talent(text,text,text,integer,integer);

create function public.discover_talent(
  search_term text default null,
  domain_filter text default null,
  level_filter text default null,
  page_number integer default 1,
  page_size integer default 20,
  industry_filter text default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  return public.search_persons(
    search_term, domain_filter, level_filter, null, null, page_number, page_size, industry_filter
  );
end
$$;

drop function if exists public.relationship_graph(uuid,integer);

create function public.relationship_graph(
  center_person_id uuid,
  max_nodes integer default 20,
  industry_filter text default null
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  safe_nodes integer := least(50, greatest(1, max_nodes));
  nodes jsonb;
  edges jsonb;
begin
  if not public.is_active_member() then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  with neighbor_ids as (
    select case when r.person_a_id = center_person_id then r.person_b_id else r.person_a_id end as id,
      max(r.score) as score
    from public.relationships r
    where r.person_a_id = center_person_id or r.person_b_id = center_person_id
    group by 1
  ), filtered_ids as (
    select n.id, n.score
    from neighbor_ids n
    join public.persons p on p.id = n.id
    where p.deleted_at is null
      and (industry_filter is null or industry_filter = ''
        or p.industry = industry_filter
        or exists (select 1 from public.person_domains pd
                   where pd.person_id = p.id and pd.domain = industry_filter))
    order by n.score desc nulls last, n.id
    limit greatest(0, safe_nodes - 1)
  ), selected_ids as (
    select center_person_id as id union select id from filtered_ids
  )
  select coalesce(jsonb_agg(to_jsonb(p) order by p.id), '[]'::jsonb) into nodes
  from public.persons p join selected_ids s on s.id = p.id where p.deleted_at is null;

  with selected_ids as (
    select (n->>'id')::uuid as id from jsonb_array_elements(nodes) n
  )
  select coalesce(jsonb_agg(to_jsonb(r) order by r.score desc, r.id), '[]'::jsonb) into edges
  from public.relationships r
  where r.person_a_id in (select id from selected_ids)
    and r.person_b_id in (select id from selected_ids)
    and (r.person_a_id = center_person_id or r.person_b_id = center_person_id);

  return jsonb_build_object('nodes', nodes, 'edges', edges, 'maxNodes', safe_nodes);
end
$$;

-- 领域配置读取 RPC（前端领域切换器使用）
create function public.list_domain_configs() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  return (
    select coalesce(jsonb_agg(to_jsonb(d) order by d.sort_order, d.domain_key), '[]'::jsonb)
    from public.domain_configs d
    where d.is_active
  );
end
$$;

-- ---------------------------------------------------------------------------
-- 6. 权限
-- ---------------------------------------------------------------------------
revoke all on function public.dashboard_summary(text) from public, anon;
revoke all on function public.search_persons(text,text,text,uuid,uuid,integer,integer,text) from public, anon;
revoke all on function public.discover_talent(text,text,text,integer,integer,text) from public, anon;
revoke all on function public.relationship_graph(uuid,integer,text) from public, anon;
revoke all on function public.list_domain_configs() from public, anon;
revoke all on function public.person_industry_default() from public, anon;
revoke all on function public.sync_person_domain() from public, anon;

grant execute on function public.dashboard_summary(text) to authenticated;
grant execute on function public.search_persons(text,text,text,uuid,uuid,integer,integer,text) to authenticated;
grant execute on function public.discover_talent(text,text,text,integer,integer,text) to authenticated;
grant execute on function public.relationship_graph(uuid,integer,text) to authenticated;
grant execute on function public.list_domain_configs() to authenticated;
