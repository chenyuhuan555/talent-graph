-- Applies the server-only privileges to projects provisioned before the
-- service_role grants were added to the initial RLS migration.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
