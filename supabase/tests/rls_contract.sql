begin;

do $$
declare
  admin_id uuid := gen_random_uuid();
  leader_id uuid := gen_random_uuid();
  consultant_id uuid := gen_random_uuid();
  operator_id uuid := gen_random_uuid();
  disabled_id uuid := gen_random_uuid();
  person_id uuid := gen_random_uuid();
  contact_output text;
begin
  insert into auth.users (id, email) values
    (admin_id, 'rls-admin@example.invalid'),
    (leader_id, 'rls-leader@example.invalid'),
    (consultant_id, 'rls-consultant@example.invalid'),
    (operator_id, 'rls-operator@example.invalid'),
    (disabled_id, 'rls-disabled@example.invalid');

  insert into public.profiles (id, username_hash, display_name, role, status) values
    (admin_id, repeat('a', 64), 'Admin', 'admin', 'active'),
    (leader_id, repeat('b', 64), 'Leader', 'leader', 'active'),
    (consultant_id, repeat('c', 64), 'Consultant', 'consultant', 'active'),
    (operator_id, repeat('d', 64), 'Operator', 'operator', 'active'),
    (disabled_id, repeat('e', 64), 'Disabled', 'admin', 'disabled');

  insert into public.persons (id, chinese_name) values (person_id, 'RLS fixture');
  insert into public.contacts (
    person_id, contact_type, contact_value_encrypted, masked_value
  ) values (
    person_id, 'email', 'raw-contact-sentinel@example.invalid', 'ra***@example.invalid'
  );

  perform set_config('request.jwt.claim.role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', operator_id::text, true);
  select value into contact_output
  from public.masked_contacts_for_person(person_id);
  if contact_output like '%raw-contact-sentinel%' then
    raise exception 'operator received raw contact';
  end if;

  perform set_config('request.jwt.claim.sub', disabled_id::text, true);
  if public.is_active_member() then
    raise exception 'disabled admin retained access';
  end if;

  perform set_config('request.jwt.claim.sub', admin_id::text, true);
  if not public.can_view_full_contact() then
    raise exception 'active admin cannot view full contact';
  end if;

  perform set_config('request.jwt.claim.sub', leader_id::text, true);
  if public.current_app_role() <> 'leader' then
    raise exception 'leader role lookup failed';
  end if;

  perform set_config('request.jwt.claim.sub', consultant_id::text, true);
  if public.current_app_role() <> 'consultant' then
    raise exception 'consultant role lookup failed';
  end if;
end
$$;

rollback;
