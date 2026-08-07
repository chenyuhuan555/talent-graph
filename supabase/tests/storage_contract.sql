begin;

do $$
declare
  bucket storage.buckets%rowtype;
begin
  select * into bucket
  from storage.buckets
  where id = 'private-documents';

  if not found then
    raise exception 'private-documents bucket is missing';
  end if;
  if bucket.public then
    raise exception 'private-documents bucket must be private';
  end if;
  if bucket.file_size_limit <> 20971520 then
    raise exception 'private-documents file size limit is incorrect';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (qual like '%private-documents%' or with_check like '%private-documents%')
  ) then
    raise exception 'first release must not grant browser access to private-documents';
  end if;
end
$$;

rollback;
