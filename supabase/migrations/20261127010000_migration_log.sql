-- Log of which migration scripts have been run by hand in the SQL Editor.
-- Each migration should end with:
--   insert into public.migration_log (filename) values ('<this file name>') on conflict do nothing;
-- Private on purpose: RLS on, no policies, no grants to anon/authenticated. The SQL Editor runs as
-- the postgres role, so it can still read and write. Safe to re-run.

create table if not exists public.migration_log (
  filename   text        primary key check (char_length(filename) between 1 and 200),
  applied_at timestamptz not null default now()
);

alter table public.migration_log enable row level security;
revoke all on public.migration_log from anon, authenticated;

-- Backfill: scripts already run before this log existed. Edit this list to match what you really ran.
-- Homer confirmed every script up to this one has been run (2026-11-27).
insert into public.migration_log (filename) values
  ('20261026000000_revision_records.sql'),
  ('20261026010000_revision_records_grants.sql'),
  ('20261027000000_user_workspace.sql'),
  ('20261027010000_revision_records_last_time.sql'),
  ('20261027020000_workspace_key.sql'),
  ('20261114000000_sharing_hub.sql'),
  ('20261115000000_sharing_hub_reactions.sql'),
  ('20261116000000_sharing_hub_tags.sql'),
  ('20261117000000_sharing_hub_hardening.sql'),
  ('20261124000000_content_editing.sql'),
  ('20261127010000_migration_log.sql')
on conflict do nothing;
