create or replace function public.dashboard_summary() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  return jsonb_build_object(
    'persons', (select count(*) from public.persons where deleted_at is null),
    'organizations', (select count(*) from public.organizations where deleted_at is null),
    'positions', (select count(*) from public.positions where deleted_at is null and status = 'open'),
    'relationships', (select count(*) from public.relationships),
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

create or replace function public.search_persons(
  search_term text default null,
  domain_filter text default null,
  level_filter text default null,
  organization_filter uuid default null,
  owner_filter uuid default null,
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
    and (owner_filter is null or p.owner_user_id = owner_filter);

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

create or replace function public.discover_talent(
  search_term text default null,
  domain_filter text default null,
  level_filter text default null,
  page_number integer default 1,
  page_size integer default 20
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  return public.search_persons(
    search_term, domain_filter, level_filter, null, null, page_number, page_size
  );
end
$$;

create or replace function public.person_detail(target_person_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not public.is_active_member() then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  select to_jsonb(p) into result from public.persons p
  where p.id = target_person_id and p.deleted_at is null;
  return result;
end
$$;

create or replace function public.person_experiences(target_person_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then raise exception using errcode = '42501', message = 'not_authorized'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(e) order by e.start_date desc nulls last, e.id), '[]'::jsonb)
    from public.experiences e where e.person_id = target_person_id);
end
$$;

create or replace function public.person_papers(target_person_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then raise exception using errcode = '42501', message = 'not_authorized'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(q) order by q.publication_date desc nulls last, q.id), '[]'::jsonb)
    from (select p.*, pa.author_order, pa.is_corresponding
      from public.paper_authors pa join public.papers p on p.id = pa.paper_id
      where pa.person_id = target_person_id) q);
end
$$;

create or replace function public.person_projects(target_person_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then raise exception using errcode = '42501', message = 'not_authorized'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc, q.id), '[]'::jsonb)
    from (select p.*, pc.role, pc.contribution_score
      from public.project_contributors pc join public.projects p on p.id = pc.project_id
      where pc.person_id = target_person_id) q);
end
$$;

create or replace function public.person_relationships(target_person_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then raise exception using errcode = '42501', message = 'not_authorized'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(r) order by r.score desc, r.id), '[]'::jsonb)
    from public.relationships r
    where r.person_a_id = target_person_id or r.person_b_id = target_person_id);
end
$$;

create or replace function public.person_position_matches(target_person_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then raise exception using errcode = '42501', message = 'not_authorized'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(q) order by q.match_score desc, q.id), '[]'::jsonb)
    from (select m.*, p.title as position_title, p.status as position_status
      from public.person_position_matches m join public.positions p on p.id = m.position_id
      where m.person_id = target_person_id and p.deleted_at is null) q);
end
$$;

create or replace function public.relationship_graph(
  center_person_id uuid,
  max_nodes integer default 20
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
    group by 1 order by score desc nulls last, id limit greatest(0, safe_nodes - 1)
  ), selected_ids as (
    select center_person_id as id union select id from neighbor_ids
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

create or replace function public.relationship_evidence_for(target_relationship_id uuid) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then raise exception using errcode = '42501', message = 'not_authorized'; end if;
  return (select coalesce(jsonb_agg(to_jsonb(e) order by e.created_at, e.id), '[]'::jsonb)
    from public.relationship_evidence e where e.relationship_id = target_relationship_id);
end
$$;

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
    and (search_term is null or coalesce(o.name, '') ilike '%' || search_term || '%' or coalesce(o.english_name, '') ilike '%' || search_term || '%')
    and (organization_type_filter is null or o.organization_type = organization_type_filter);
  select coalesce(jsonb_agg(to_jsonb(q) order by q.name, q.id), '[]'::jsonb) into rows
  from (select o.* from public.organizations o where o.deleted_at is null
    and (search_term is null or coalesce(o.name, '') ilike '%' || search_term || '%' or coalesce(o.english_name, '') ilike '%' || search_term || '%')
    and (organization_type_filter is null or o.organization_type = organization_type_filter)
    order by o.name, o.id limit safe_size offset ((safe_page - 1) * safe_size)) q;
  return jsonb_build_object('data', rows, 'pagination', jsonb_build_object(
    'pageNumber', safe_page, 'pageSize', safe_size, 'totalCount', total_rows,
    'totalPages', case when total_rows = 0 then 0 else ceil(total_rows::numeric / safe_size)::integer end));
end
$$;

create or replace function public.organization_people(
  target_organization_id uuid,
  page_number integer default 1,
  page_size integer default 20
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_active_member() then raise exception using errcode = '42501', message = 'not_authorized'; end if;
  return public.search_persons(null, null, null, target_organization_id, null, page_number, page_size);
end
$$;

create or replace function public.positions_search(
  search_term text default null,
  status_filter text default null,
  owner_filter uuid default null,
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
  select count(*) into total_rows from public.positions p where p.deleted_at is null
    and (search_term is null or p.title ilike '%' || search_term || '%')
    and (status_filter is null or p.status = status_filter)
    and (owner_filter is null or p.owner_user_id = owner_filter);
  select coalesce(jsonb_agg(to_jsonb(q) order by q.updated_at desc, q.id), '[]'::jsonb) into rows
  from (select p.* from public.positions p where p.deleted_at is null
    and (search_term is null or p.title ilike '%' || search_term || '%')
    and (status_filter is null or p.status = status_filter)
    and (owner_filter is null or p.owner_user_id = owner_filter)
    order by p.updated_at desc, p.id limit safe_size offset ((safe_page - 1) * safe_size)) q;
  return jsonb_build_object('data', rows, 'pagination', jsonb_build_object(
    'pageNumber', safe_page, 'pageSize', safe_size, 'totalCount', total_rows,
    'totalPages', case when total_rows = 0 then 0 else ceil(total_rows::numeric / safe_size)::integer end));
end
$$;

create or replace function public.position_matches(
  target_position_id uuid,
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
  select count(*) into total_rows from public.person_position_matches where position_id = target_position_id;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.match_score desc, q.id), '[]'::jsonb) into rows
  from (select m.*, p.chinese_name, p.english_name from public.person_position_matches m
    join public.persons p on p.id = m.person_id
    where m.position_id = target_position_id and p.deleted_at is null
    order by m.match_score desc, m.id limit safe_size offset ((safe_page - 1) * safe_size)) q;
  return jsonb_build_object('data', rows, 'pagination', jsonb_build_object(
    'pageNumber', safe_page, 'pageSize', safe_size, 'totalCount', total_rows,
    'totalPages', case when total_rows = 0 then 0 else ceil(total_rows::numeric / safe_size)::integer end));
end
$$;

create or replace function public.outreach_queue(
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
  role_name text;
begin
  role_name := public.current_app_role();
  if role_name is null or role_name = 'operator' then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  select count(*) into total_rows from public.outreach_records o
  where role_name in ('admin', 'leader') or o.user_id = (select auth.uid());
  select coalesce(jsonb_agg(to_jsonb(q) order by q.next_follow_up_at nulls last, q.id), '[]'::jsonb) into rows
  from (select o.* from public.outreach_records o
    where role_name in ('admin', 'leader') or o.user_id = (select auth.uid())
    order by o.next_follow_up_at nulls last, o.id
    limit safe_size offset ((safe_page - 1) * safe_size)) q;
  return jsonb_build_object('data', rows, 'pagination', jsonb_build_object(
    'pageNumber', safe_page, 'pageSize', safe_size, 'totalCount', total_rows,
    'totalPages', case when total_rows = 0 then 0 else ceil(total_rows::numeric / safe_size)::integer end));
end
$$;

create or replace function public.merge_task_list(
  status_filter text default null,
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
  if not coalesce(public.current_app_role() in ('admin', 'operator'), false) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  select count(*) into total_rows from public.merge_tasks m
  where status_filter is null or m.status = status_filter;
  select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at, q.id), '[]'::jsonb) into rows
  from (select m.* from public.merge_tasks m
    where status_filter is null or m.status = status_filter
    order by m.created_at, m.id limit safe_size offset ((safe_page - 1) * safe_size)) q;
  return jsonb_build_object('data', rows, 'pagination', jsonb_build_object(
    'pageNumber', safe_page, 'pageSize', safe_size, 'totalCount', total_rows,
    'totalPages', case when total_rows = 0 then 0 else ceil(total_rows::numeric / safe_size)::integer end));
end
$$;

create or replace function public.update_person_if_current(
  target_id uuid,
  expected_updated_at timestamptz,
  patch jsonb
) returns public.persons
language plpgsql volatile security definer set search_path = ''
as $$
declare
  unknown_keys text[];
  updated_person public.persons;
begin
  if not coalesce(public.current_app_role() in ('admin', 'leader', 'consultant'), false) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if patch is null or jsonb_typeof(patch) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_patch';
  end if;

  select array_agg(key order by key) into unknown_keys
  from jsonb_object_keys(patch) key
  where key not in (
    'chinese_name', 'english_name', 'aliases', 'avatar_url',
    'current_organization_id', 'current_position', 'location', 'country',
    'industry', 'primary_domain', 'secondary_domains', 'talent_level',
    'summary', 'summary_raw', 'source_type', 'owner_user_id',
    'review_status', 'outreach_status', 'data_completeness', 'is_do_not_contact'
  );
  if unknown_keys is not null then
    raise exception using errcode = '22023', message = 'unknown_patch_key';
  end if;

  update public.persons p set
    chinese_name = case when patch ? 'chinese_name' then patch->>'chinese_name' else p.chinese_name end,
    english_name = case when patch ? 'english_name' then patch->>'english_name' else p.english_name end,
    aliases = case when patch ? 'aliases' then patch->>'aliases' else p.aliases end,
    avatar_url = case when patch ? 'avatar_url' then patch->>'avatar_url' else p.avatar_url end,
    current_organization_id = case when patch ? 'current_organization_id' then nullif(patch->>'current_organization_id', '')::uuid else p.current_organization_id end,
    current_position = case when patch ? 'current_position' then patch->>'current_position' else p.current_position end,
    location = case when patch ? 'location' then patch->>'location' else p.location end,
    country = case when patch ? 'country' then patch->>'country' else p.country end,
    industry = case when patch ? 'industry' then patch->>'industry' else p.industry end,
    primary_domain = case when patch ? 'primary_domain' then patch->>'primary_domain' else p.primary_domain end,
    secondary_domains = case when patch ? 'secondary_domains' then patch->>'secondary_domains' else p.secondary_domains end,
    talent_level = case when patch ? 'talent_level' then patch->>'talent_level' else p.talent_level end,
    summary = case when patch ? 'summary' then patch->>'summary' else p.summary end,
    summary_raw = case when patch ? 'summary_raw' then patch->>'summary_raw' else p.summary_raw end,
    source_type = case when patch ? 'source_type' then patch->>'source_type' else p.source_type end,
    owner_user_id = case when patch ? 'owner_user_id' then nullif(patch->>'owner_user_id', '')::uuid else p.owner_user_id end,
    review_status = case when patch ? 'review_status' then patch->>'review_status' else p.review_status end,
    outreach_status = case when patch ? 'outreach_status' then patch->>'outreach_status' else p.outreach_status end,
    data_completeness = case when patch ? 'data_completeness' then (patch->>'data_completeness')::numeric else p.data_completeness end,
    is_do_not_contact = case when patch ? 'is_do_not_contact' then (patch->>'is_do_not_contact')::boolean else p.is_do_not_contact end,
    updated_at = now()
  where p.id = target_id and p.deleted_at is null and p.updated_at = expected_updated_at
  returning p.* into updated_person;

  if updated_person.id is null then
    if exists (select 1 from public.persons where id = target_id and deleted_at is null) then
      raise exception using errcode = '40001', message = 'record_conflict';
    end if;
    raise exception using errcode = 'P0002', message = 'record_not_found';
  end if;
  return updated_person;
end
$$;

create or replace function public.merge_people(
  target_primary_person_id uuid,
  target_duplicate_person_id uuid
) returns public.persons
language plpgsql volatile security definer set search_path = ''
as $$
declare
  role_name text := public.current_app_role();
  merged public.persons;
  relationship_row record;
  new_person_a_id uuid;
  new_person_b_id uuid;
  existing_relationship_id uuid;
begin
  if not coalesce(role_name in ('admin', 'operator'), false) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  if target_primary_person_id = target_duplicate_person_id then
    raise exception using errcode = '22023', message = 'merge_same_person';
  end if;
  perform 1 from public.persons where id = target_primary_person_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'primary_not_found'; end if;
  perform 1 from public.persons where id = target_duplicate_person_id and deleted_at is null for update;
  if not found then raise exception using errcode = 'P0002', message = 'duplicate_not_found'; end if;

  insert into public.person_tags (person_id, tag_id, source_type, confidence)
    select target_primary_person_id, tag_id, source_type, confidence from public.person_tags
    where person_id = target_duplicate_person_id
    on conflict (person_id, tag_id) do nothing;
  delete from public.person_tags where person_id = target_duplicate_person_id;

  update public.experiences set person_id = target_primary_person_id where person_id = target_duplicate_person_id;
  update public.experiences set advisor_person_id = target_primary_person_id where advisor_person_id = target_duplicate_person_id;
  update public.contacts set person_id = target_primary_person_id where person_id = target_duplicate_person_id;
  update public.person_external_ids set person_id = target_primary_person_id where person_id = target_duplicate_person_id;
  update public.paper_authors set person_id = target_primary_person_id where person_id = target_duplicate_person_id;
  update public.project_contributors set person_id = target_primary_person_id where person_id = target_duplicate_person_id;
  update public.event_participants set person_id = target_primary_person_id where person_id = target_duplicate_person_id;
  update public.outreach_records set person_id = target_primary_person_id where person_id = target_duplicate_person_id;
  update public.person_position_matches set person_id = target_primary_person_id where person_id = target_duplicate_person_id;
  update public.merge_tasks set primary_person_id = target_primary_person_id where primary_person_id = target_duplicate_person_id;
  update public.merge_tasks set duplicate_person_id = target_primary_person_id where duplicate_person_id = target_duplicate_person_id;

  for relationship_row in
    select r.id, r.person_a_id, r.person_b_id, r.relationship_type
    from public.relationships r
    where r.person_a_id = target_duplicate_person_id
       or r.person_b_id = target_duplicate_person_id
    order by r.id
  loop
    new_person_a_id := case
      when relationship_row.person_a_id = target_duplicate_person_id
        then target_primary_person_id
      else relationship_row.person_a_id
    end;
    new_person_b_id := case
      when relationship_row.person_b_id = target_duplicate_person_id
        then target_primary_person_id
      else relationship_row.person_b_id
    end;

    if new_person_a_id = new_person_b_id then
      delete from public.relationships where id = relationship_row.id;
      continue;
    end if;

    existing_relationship_id := null;
    select r.id into existing_relationship_id
    from public.relationships r
    where r.id <> relationship_row.id
      and r.person_a_id = new_person_a_id
      and r.person_b_id = new_person_b_id
      and r.relationship_type = relationship_row.relationship_type
    limit 1;

    if existing_relationship_id is not null then
      update public.relationship_evidence
      set relationship_id = existing_relationship_id
      where relationship_id = relationship_row.id;
      delete from public.relationships where id = relationship_row.id;
    else
      update public.relationships
      set person_a_id = new_person_a_id, person_b_id = new_person_b_id,
        updated_at = now()
      where id = relationship_row.id;
    end if;
  end loop;

  update public.persons set deleted_at = now(), updated_at = now()
  where id = target_duplicate_person_id;
  update public.persons set updated_at = now() where id = target_primary_person_id
  returning * into merged;

  perform public.write_audit_log('merge', 'person', target_primary_person_id,
    target_duplicate_person_id::text, target_primary_person_id::text);
  return merged;
end
$$;

create or replace function public.export_business_snapshot() returns jsonb
language plpgsql volatile security definer set search_path = ''
as $$
declare snapshot jsonb;
begin
  if not coalesce(public.current_app_role() in ('admin', 'leader'), false) then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;
  snapshot := jsonb_build_object(
    'organizations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.organizations t),
    'persons', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.persons t),
    'papers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.papers t),
    'projects', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.projects t),
    'events', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.events t),
    'positions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.positions t),
    'tags', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.tags t),
    'experiences', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.experiences t),
    'person_external_ids', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.person_external_ids t),
    'paper_authors', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.paper_authors t),
    'project_contributors', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.project_contributors t),
    'event_participants', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.event_participants t),
    'relationships', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.relationships t),
    'relationship_evidence', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.relationship_evidence t),
    'contacts', (select coalesce(jsonb_agg(to_jsonb(t) - 'contact_value_encrypted'), '[]'::jsonb) from public.contacts t),
    'outreach_records', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.outreach_records t),
    'person_position_matches', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.person_position_matches t),
    'person_tags', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.person_tags t),
    'source_records', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.source_records t),
    'merge_tasks', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.merge_tasks t),
    'audit_logs', (select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from public.audit_logs t)
  );
  perform public.write_audit_log('export', 'business_snapshot');
  return snapshot;
end
$$;

revoke all on all functions in schema public from public;
revoke all on all functions in schema public from anon;

grant execute on function public.dashboard_summary() to authenticated;
grant execute on function public.search_persons(text,text,text,uuid,uuid,integer,integer) to authenticated;
grant execute on function public.discover_talent(text,text,text,integer,integer) to authenticated;
grant execute on function public.person_detail(uuid) to authenticated;
grant execute on function public.person_experiences(uuid) to authenticated;
grant execute on function public.person_papers(uuid) to authenticated;
grant execute on function public.person_projects(uuid) to authenticated;
grant execute on function public.person_relationships(uuid) to authenticated;
grant execute on function public.person_position_matches(uuid) to authenticated;
grant execute on function public.relationship_graph(uuid,integer) to authenticated;
grant execute on function public.relationship_evidence_for(uuid) to authenticated;
grant execute on function public.organizations_search(text,text,integer,integer) to authenticated;
grant execute on function public.organization_people(uuid,integer,integer) to authenticated;
grant execute on function public.positions_search(text,text,uuid,integer,integer) to authenticated;
grant execute on function public.position_matches(uuid,integer,integer) to authenticated;
grant execute on function public.outreach_queue(integer,integer) to authenticated;
grant execute on function public.merge_task_list(text,integer,integer) to authenticated;
grant execute on function public.update_person_if_current(uuid,timestamptz,jsonb) to authenticated;
grant execute on function public.merge_people(uuid,uuid) to authenticated;
grant execute on function public.export_business_snapshot() to authenticated;

-- Restore policy-helper execution revoked above.
grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_active_member() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_view_full_contact() to authenticated;
grant execute on function public.masked_contacts_for_person(uuid) to authenticated;
