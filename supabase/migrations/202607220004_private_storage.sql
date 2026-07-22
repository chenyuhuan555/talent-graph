insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'private-documents',
  'private-documents',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- First release intentionally creates no storage.objects policies.
