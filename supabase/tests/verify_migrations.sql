-- Read-only check that every migration's objects exist in the database (and are logged).
-- Paste into the Supabase SQL Editor. One row per migration: objects_ok should be true for all,
-- and logged should be true for all once migration_log is filled.
with checks(migration, present) as (values
  ('20261026000000_revision_records.sql',
    to_regclass('public.revision_records') is not null),
  ('20261026010000_revision_records_grants.sql',
    has_table_privilege('authenticated', 'public.revision_records', 'select,insert,update,delete')),
  ('20261027000000_user_workspace.sql',
    to_regclass('public.lessons') is not null and to_regclass('public.tests') is not null
    and to_regclass('public.roadmaps') is not null and to_regclass('public.workspace_structures') is not null),
  ('20261027010000_revision_records_last_time.sql',
    exists (select 1 from pg_constraint where conname = 'revision_records_last_time_sane')),
  ('20261027020000_workspace_key.sql',
    to_regclass('public.workspaces') is not null
    and exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'lessons' and column_name = 'workspace_key')),
  ('20261114000000_sharing_hub.sql',
    to_regclass('public.shared_workspaces') is not null),
  ('20261115000000_sharing_hub_reactions.sql',
    to_regclass('public.shared_workspace_reactions') is not null
    and to_regclass('public.shared_workspace_stats') is not null),
  ('20261116000000_sharing_hub_tags.sql',
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'shared_workspaces' and column_name = 'tags')),
  ('20261117000000_sharing_hub_hardening.sql',
    exists (select 1 from information_schema.columns
            where table_schema = 'public' and table_name = 'shared_workspaces' and column_name = 'hidden_at')
    and to_regclass('public.shared_publish_log') is not null
    and to_regclass('public.shared_workspace_reports') is not null
    and exists (select 1 from pg_trigger where tgname = 'shared_workspaces_guard' and not tgisinternal)
    and exists (select 1 from pg_trigger where tgname = 'shared_reports_after_insert' and not tgisinternal)
    and to_regprocedure('public.shared_content_problem(jsonb)') is not null),
  ('20261124000000_content_editing.sql',
    to_regclass('public.content_tombstones') is not null
    and exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'workspaces' and column_name = 'prompt_guide')),
  ('20261127000000_roadmap_tombstones.sql',
    exists (select 1 from pg_constraint
            where conname = 'content_tombstones_kind_check' and pg_get_constraintdef(oid) like '%roadmaps%')),
  ('20261127010000_migration_log.sql',
    to_regclass('public.migration_log') is not null),
  ('20261127030000_roadmap_tombstones_log.sql',
    to_regprocedure('public.admin_migration_status()') is not null)
)
select c.migration,
       c.present as objects_ok,
       exists (select 1 from public.migration_log l where l.filename = c.migration) as logged
from checks c
order by c.migration;
