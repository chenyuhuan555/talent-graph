begin;

do $$
declare
  expected_tables text[] := array[
    'audit_logs', 'contacts', 'event_participants', 'events', 'experiences',
    'merge_tasks', 'organizations', 'outreach_records', 'paper_authors', 'papers',
    'person_external_ids', 'person_position_matches', 'person_tags', 'persons',
    'positions', 'profiles', 'project_contributors', 'projects',
    'relationship_evidence', 'relationships', 'source_records', 'tags'
  ];
  missing_tables text[];
  non_uuid_primary_keys text[];
begin
  select array_agg(name order by name)
    into missing_tables
  from unnest(expected_tables) as name
  where to_regclass('public.' || name) is null;

  if missing_tables is not null then
    raise exception 'Missing public tables: %', missing_tables;
  end if;

  if to_regclass('public.users') is not null then
    raise exception 'public.users must not exist; Supabase auth owns identities';
  end if;

  select array_agg(t.table_name order by t.table_name)
    into non_uuid_primary_keys
  from information_schema.tables t
  where t.table_schema = 'public'
    and t.table_name = any(expected_tables)
    and not exists (
      select 1
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on kcu.constraint_name = tc.constraint_name
       and kcu.constraint_schema = tc.constraint_schema
      join information_schema.columns c
        on c.table_schema = kcu.table_schema
       and c.table_name = kcu.table_name
       and c.column_name = kcu.column_name
      where tc.table_schema = 'public'
        and tc.table_name = t.table_name
        and tc.constraint_type = 'PRIMARY KEY'
        and c.data_type = 'uuid'
    );

  if non_uuid_primary_keys is not null then
    raise exception 'Tables without UUID primary keys: %', non_uuid_primary_keys;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
  ) then
    raise exception 'profiles checks are missing';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.persons'::regclass
      and confrelid = 'public.profiles'::regclass
  ) then
    raise exception 'persons owner foreign key is missing';
  end if;
end
$$;

rollback;
