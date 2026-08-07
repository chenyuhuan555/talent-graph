begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  first_person uuid := gen_random_uuid();
  second_person uuid := gen_random_uuid();
  initial_updated_at timestamptz;
  result jsonb;
begin
  insert into auth.users (id, email) values (admin_id, 'read-api-admin@example.invalid');
  insert into public.profiles (id, username_hash, display_name, role, status)
  values (admin_id, repeat('f', 64), 'Read API Admin', 'admin', 'active');
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', admin_id::text, true);

  insert into public.persons (id, chinese_name) values
    (first_person, 'First'), (second_person, 'Second');

  result := public.search_persons(page_size => 1000);
  if (result #>> '{pagination,pageSize}')::integer <> 100 then
    raise exception 'page_size was not clamped';
  end if;

  result := public.relationship_graph(first_person, max_nodes => 500);
  if (result->>'maxNodes')::integer <> 50 then
    raise exception 'max_nodes was not clamped';
  end if;

  select updated_at into initial_updated_at from public.persons where id = first_person;
  perform public.update_person_if_current(first_person, initial_updated_at, '{"location":"Shanghai"}'::jsonb);
  begin
    perform public.update_person_if_current(first_person, initial_updated_at, '{"location":"Beijing"}'::jsonb);
    raise exception 'record_conflict was not raised';
  exception when serialization_failure then
    if sqlerrm <> 'record_conflict' then raise; end if;
  end;
end
$$;

rollback;
