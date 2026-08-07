revoke all on all tables in schema public from public;
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from public;
revoke all on all functions in schema public from anon;

-- Server-side admin operations use the service_role through secret API keys.
-- These privileges are not available to browser clients and bypass RLS only
-- for trusted server requests.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

create or replace function public.current_app_role() returns text
language sql stable security definer set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid()) and p.status = 'active'
$$;

create or replace function public.is_active_member() returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_app_role() is not null
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_app_role() = 'admin'
$$;

create or replace function public.can_view_full_contact() returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.current_app_role() in ('admin', 'leader', 'consultant')
$$;

create or replace function public.mask_contact(contact_type text, contact_value text)
returns text
language plpgsql immutable security definer set search_path = ''
as $$
declare
  at_position integer;
  local_part text;
  domain_part text;
begin
  if contact_value is null or contact_value = '' then
    return '';
  end if;

  if contact_type = 'email' then
    at_position := position('@' in contact_value);
    if at_position > 1 then
      local_part := left(contact_value, at_position - 1);
      domain_part := substring(contact_value from at_position);
      return left(local_part, least(2, length(local_part)))
        || repeat('*', greatest(1, length(local_part) - 2))
        || domain_part;
    end if;
    return left(contact_value, 2) || '***';
  end if;

  if contact_type = 'phone' then
    if length(contact_value) >= 7 then
      return left(contact_value, 3) || '****' || right(contact_value, 4);
    end if;
    return '***';
  end if;

  return contact_value;
end
$$;

create or replace function public.write_audit_log(
  audit_action text,
  target_entity_type text,
  target_entity_id uuid default null,
  before_payload text default null,
  after_payload text default null
) returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not public.is_active_member() then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  if audit_action not in (
    'view_full_contact', 'member_change', 'merge', 'export',
    'destructive_action', 'migration', 'restore'
  ) then
    raise exception using errcode = '22023', message = 'invalid_audit_action';
  end if;

  insert into public.audit_logs (
    user_id, action, entity_type, entity_id, before_data, after_data
  ) values (
    (select auth.uid()), audit_action, target_entity_type, target_entity_id,
    before_payload, after_payload
  ) returning id into new_id;

  return new_id;
end
$$;

create or replace function public.masked_contacts_for_person(target_person_id uuid)
returns table (id uuid, contact_type text, value text, is_masked boolean)
language plpgsql volatile security definer set search_path = ''
as $$
declare
  may_view_full boolean;
begin
  if not public.is_active_member() then
    raise exception using errcode = '42501', message = 'not_authorized';
  end if;

  may_view_full := public.can_view_full_contact();
  if may_view_full and exists (
    select 1 from public.contacts c where c.person_id = target_person_id
  ) then
    perform public.write_audit_log('view_full_contact', 'person', target_person_id);
  end if;

  return query
  select
    c.id,
    c.contact_type,
    case
      when may_view_full then c.contact_value_encrypted
      else public.mask_contact(c.contact_type, c.contact_value_encrypted)
    end,
    not may_view_full
  from public.contacts c
  where c.person_id = target_person_id;
end
$$;

alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;
alter table public.contacts enable row level security;
alter table public.event_participants enable row level security;
alter table public.events enable row level security;
alter table public.experiences enable row level security;
alter table public.merge_tasks enable row level security;
alter table public.organizations enable row level security;
alter table public.outreach_records enable row level security;
alter table public.paper_authors enable row level security;
alter table public.papers enable row level security;
alter table public.person_external_ids enable row level security;
alter table public.person_position_matches enable row level security;
alter table public.person_tags enable row level security;
alter table public.persons enable row level security;
alter table public.positions enable row level security;
alter table public.project_contributors enable row level security;
alter table public.projects enable row level security;
alter table public.relationship_evidence enable row level security;
alter table public.relationships enable row level security;
alter table public.source_records enable row level security;
alter table public.tags enable row level security;

grant usage on schema public to authenticated;

grant select on public.organizations, public.source_records, public.persons,
  public.positions, public.tags, public.events, public.papers, public.projects,
  public.experiences, public.person_external_ids, public.person_tags,
  public.event_participants, public.paper_authors, public.project_contributors,
  public.relationships, public.relationship_evidence,
  public.person_position_matches to authenticated;

grant insert, update on public.persons, public.positions, public.contacts,
  public.outreach_records to authenticated;

grant insert, update on public.organizations, public.source_records, public.tags,
  public.events, public.papers, public.projects, public.experiences,
  public.person_external_ids, public.person_tags, public.event_participants,
  public.paper_authors, public.project_contributors, public.relationships,
  public.relationship_evidence, public.person_position_matches,
  public.merge_tasks to authenticated;

grant delete on public.organizations, public.source_records, public.persons,
  public.positions, public.tags, public.events, public.papers, public.projects,
  public.experiences, public.person_external_ids, public.person_tags,
  public.event_participants, public.paper_authors, public.project_contributors,
  public.relationships, public.relationship_evidence,
  public.person_position_matches, public.contacts, public.outreach_records,
  public.merge_tasks to authenticated;

grant select (id, person_id, contact_type, masked_value, source_type, source_url,
  collected_at, verified_at, is_valid, is_public, access_level, created_by,
  created_at, updated_at) on public.contacts to authenticated;
grant select on public.outreach_records to authenticated;
grant select on public.merge_tasks to authenticated;
grant select on public.audit_logs to authenticated;
grant select on public.profiles to authenticated;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.is_active_member() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.can_view_full_contact() to authenticated;
grant execute on function public.masked_contacts_for_person(uuid) to authenticated;

create policy profiles_read_self_or_admin on public.profiles
for select to authenticated
using (public.is_active_member() and (id = (select auth.uid()) or public.is_admin()));

create policy audit_admin_read on public.audit_logs
for select to authenticated using (public.is_admin());

create policy active_member_read on public.organizations
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.source_records
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.persons
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.positions
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.tags
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.events
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.papers
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.projects
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.experiences
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.person_external_ids
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.person_tags
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.event_participants
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.paper_authors
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.project_contributors
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.relationships
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.relationship_evidence
for select to authenticated using (public.is_active_member());
create policy active_member_read on public.person_position_matches
for select to authenticated using (public.is_active_member());

create policy contacts_safe_read on public.contacts
for select to authenticated using (public.is_active_member());

create policy outreach_role_read on public.outreach_records
for select to authenticated
using (
  public.current_app_role() in ('admin', 'leader')
  or (public.current_app_role() = 'consultant' and user_id = (select auth.uid()))
);

create policy merge_task_worker_read on public.merge_tasks
for select to authenticated
using (public.current_app_role() in ('admin', 'operator'));

create policy people_edit on public.persons
for insert to authenticated
with check (public.current_app_role() in ('admin', 'leader', 'consultant'));
create policy people_update on public.persons
for update to authenticated
using (public.current_app_role() in ('admin', 'leader', 'consultant'))
with check (public.current_app_role() in ('admin', 'leader', 'consultant'));

create policy positions_edit on public.positions
for insert to authenticated
with check (public.current_app_role() in ('admin', 'leader', 'consultant'));
create policy positions_update on public.positions
for update to authenticated
using (public.current_app_role() in ('admin', 'leader', 'consultant'))
with check (public.current_app_role() in ('admin', 'leader', 'consultant'));

create policy contacts_privileged_insert on public.contacts
for insert to authenticated
with check (public.current_app_role() in ('admin', 'leader', 'consultant'));
create policy contacts_privileged_update on public.contacts
for update to authenticated
using (public.current_app_role() in ('admin', 'leader', 'consultant'))
with check (public.current_app_role() in ('admin', 'leader', 'consultant'));

create policy outreach_privileged_insert on public.outreach_records
for insert to authenticated
with check (
  public.current_app_role() in ('admin', 'leader', 'consultant')
  and (user_id = (select auth.uid()) or public.is_admin())
);
create policy outreach_privileged_update on public.outreach_records
for update to authenticated
using (
  public.current_app_role() in ('admin', 'leader')
  or (public.current_app_role() = 'consultant' and user_id = (select auth.uid()))
)
with check (
  public.current_app_role() in ('admin', 'leader')
  or (public.current_app_role() = 'consultant' and user_id = (select auth.uid()))
);

create policy operator_factual_insert on public.organizations
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.organizations
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.source_records
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.source_records
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.tags
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.tags
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.events
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.events
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.papers
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.papers
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.projects
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.projects
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.experiences
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.experiences
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.person_external_ids
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.person_external_ids
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.person_tags
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.person_tags
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.event_participants
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.event_participants
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.paper_authors
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.paper_authors
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.project_contributors
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.project_contributors
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.relationships
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.relationships
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.relationship_evidence
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.relationship_evidence
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.person_position_matches
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.person_position_matches
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_insert on public.merge_tasks
for insert to authenticated with check (public.current_app_role() in ('admin', 'operator'));
create policy operator_factual_update on public.merge_tasks
for update to authenticated using (public.current_app_role() in ('admin', 'operator'))
with check (public.current_app_role() in ('admin', 'operator'));

create policy admin_delete on public.organizations for delete to authenticated using (public.is_admin());
create policy admin_delete on public.source_records for delete to authenticated using (public.is_admin());
create policy admin_delete on public.persons for delete to authenticated using (public.is_admin());
create policy admin_delete on public.positions for delete to authenticated using (public.is_admin());
create policy admin_delete on public.tags for delete to authenticated using (public.is_admin());
create policy admin_delete on public.events for delete to authenticated using (public.is_admin());
create policy admin_delete on public.papers for delete to authenticated using (public.is_admin());
create policy admin_delete on public.projects for delete to authenticated using (public.is_admin());
create policy admin_delete on public.experiences for delete to authenticated using (public.is_admin());
create policy admin_delete on public.person_external_ids for delete to authenticated using (public.is_admin());
create policy admin_delete on public.person_tags for delete to authenticated using (public.is_admin());
create policy admin_delete on public.event_participants for delete to authenticated using (public.is_admin());
create policy admin_delete on public.paper_authors for delete to authenticated using (public.is_admin());
create policy admin_delete on public.project_contributors for delete to authenticated using (public.is_admin());
create policy admin_delete on public.relationships for delete to authenticated using (public.is_admin());
create policy admin_delete on public.relationship_evidence for delete to authenticated using (public.is_admin());
create policy admin_delete on public.person_position_matches for delete to authenticated using (public.is_admin());
create policy admin_delete on public.contacts for delete to authenticated using (public.is_admin());
create policy admin_delete on public.outreach_records for delete to authenticated using (public.is_admin());
create policy admin_delete on public.merge_tasks for delete to authenticated using (public.is_admin());
