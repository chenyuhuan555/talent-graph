create extension if not exists pgcrypto with schema extensions;

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

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  english_name text,
  organization_type text not null,
  parent_id uuid references public.organizations(id) on delete set null,
  industry text,
  country text,
  city text,
  website text,
  description text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.source_records (
  id uuid primary key default gen_random_uuid(),
  source_name text,
  source_type text,
  source_url text,
  external_record_id text,
  raw_data text,
  fetched_at timestamptz default now(),
  processing_status text default 'processed',
  checksum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  chinese_name text,
  english_name text,
  aliases text,
  avatar_url text,
  current_organization_id uuid references public.organizations(id) on delete set null,
  current_position text,
  location text,
  country text,
  industry text default '人工智能',
  primary_domain text,
  secondary_domains text,
  talent_level text,
  summary text,
  summary_raw text,
  source_type text,
  owner_user_id uuid references public.profiles(id) on delete set null,
  review_status text default 'pending',
  outreach_status text default '未触达',
  data_completeness numeric(5,2) default 0,
  is_do_not_contact boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.organizations(id) on delete set null,
  title text not null,
  industry text default '人工智能',
  primary_domain text,
  secondary_domains text,
  level text,
  location text,
  salary_min numeric(12,2),
  salary_max numeric(12,2),
  responsibilities text,
  requirements text,
  preferred_conditions text,
  target_companies text,
  target_schools text,
  exclusion_conditions text,
  status text default 'open',
  owner_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag_type text default 'custom',
  parent_id uuid references public.tags(id) on delete set null,
  color text default '#2D6A4F',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  event_type text,
  organizer text,
  start_date date,
  end_date date,
  location text,
  url text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.papers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  abstract text,
  publication_date date,
  venue text,
  doi text,
  arxiv_id text,
  openalex_id text,
  citation_count integer default 0,
  domains text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  project_type text,
  organization_id uuid references public.organizations(id) on delete set null,
  url text,
  description text,
  domains text,
  stars_count integer default 0,
  downloads_count bigint default 0,
  start_date date,
  last_active_at text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.experiences (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  organization_id uuid references public.organizations(id) on delete set null,
  experience_type text not null,
  title text,
  department text,
  major text,
  advisor_person_id uuid references public.persons(id) on delete set null,
  start_date date,
  end_date date,
  is_current boolean default false,
  description text,
  source_record_id uuid references public.source_records(id) on delete set null,
  confidence numeric(5,2) default 1.0,
  verified boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  contact_type text not null,
  contact_value_encrypted text,
  masked_value text,
  source_type text,
  source_url text,
  collected_at timestamptz,
  verified_at timestamptz,
  is_valid boolean default true,
  is_public boolean default true,
  access_level text default 'default',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.person_external_ids (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  platform text not null,
  external_id text not null,
  profile_url text,
  confidence numeric(5,2) default 1.0,
  verified boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_platform_external_id unique (platform, external_id)
);

create table public.person_tags (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  source_type text default 'manual',
  confidence numeric(5,2) default 1.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_person_tag unique (person_id, tag_id)
);

create table public.event_participants (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  participant_role text,
  topic text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.paper_authors (
  id uuid primary key default gen_random_uuid(),
  paper_id uuid not null references public.papers(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  author_order integer default 1,
  is_corresponding text default 'false',
  organization_id uuid references public.organizations(id) on delete set null,
  raw_author_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_contributors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  person_id uuid not null references public.persons(id) on delete cascade,
  role text,
  contribution_score numeric(7,2) default 0,
  start_date date,
  end_date date,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.relationships (
  id uuid primary key default gen_random_uuid(),
  person_a_id uuid not null references public.persons(id) on delete cascade,
  person_b_id uuid not null references public.persons(id) on delete cascade,
  relationship_type text not null,
  relationship_strength text default 'medium',
  score numeric(6,2) default 0,
  start_date date,
  end_date date,
  is_inferred boolean default true,
  is_verified boolean default false,
  verification_status text default 'pending',
  can_introduce boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_relationship_pair_type unique (person_a_id, person_b_id, relationship_type),
  constraint ck_relationship_distinct_people check (person_a_id <> person_b_id)
);

create table public.relationship_evidence (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null references public.relationships(id) on delete cascade,
  evidence_type text,
  related_entity_id uuid,
  description text,
  source_url text,
  base_score numeric(6,2) default 0,
  confidence numeric(5,2) default 1.0,
  time_overlap_score numeric(5,2) default 1.0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.person_position_matches (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  position_id uuid not null references public.positions(id) on delete cascade,
  match_score numeric(5,2) default 0,
  match_reasons text,
  risks text,
  questions_to_confirm text,
  ai_generated boolean default true,
  consultant_rating text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.outreach_records (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references public.persons(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  outreach_channel text,
  outreach_at timestamptz default now(),
  content_summary text,
  response_status text default 'pending',
  response_summary text,
  intention_level text default 'none',
  next_action text,
  next_follow_up_at timestamptz,
  willing_to_refer boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.merge_tasks (
  id uuid primary key default gen_random_uuid(),
  primary_person_id uuid not null references public.persons(id) on delete cascade,
  duplicate_person_id uuid not null references public.persons(id) on delete cascade,
  similarity_score numeric(5,2) default 0,
  matching_evidence text,
  conflict_fields text,
  status text default 'pending',
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  action text,
  entity_type text,
  entity_id uuid,
  before_data text,
  after_data text,
  ip_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_organizations_name on public.organizations (name);
create index idx_organizations_type on public.organizations (organization_type);
create index idx_source_records_external on public.source_records (source_type, external_record_id);
create index idx_persons_chinese_name on public.persons (chinese_name);
create index idx_persons_english_name on public.persons (english_name);
create index idx_persons_domain on public.persons (primary_domain);
create index idx_persons_level on public.persons (talent_level);
create index idx_persons_organization on public.persons (current_organization_id);
create index idx_persons_owner on public.persons (owner_user_id);
create index idx_positions_status on public.positions (status);
create index idx_positions_owner on public.positions (owner_user_id);
create index idx_relationships_endpoints on public.relationships (person_a_id, person_b_id);
create index idx_relationships_verification on public.relationships (verification_status);
create index idx_relationship_evidence_relationship on public.relationship_evidence (relationship_id);
create index idx_paper_authors_paper_person on public.paper_authors (paper_id, person_id);
create index idx_outreach_follow_up on public.outreach_records (next_follow_up_at);
create index idx_outreach_user on public.outreach_records (user_id);
