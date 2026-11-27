-- Fixes the Admin tab showing 20261127000000_roadmap_tombstones.sql as Not run: that script was merged
-- before migration_log existed, so it never logged itself and had no object check. Needs
-- 20261127020000_admin_migration_status.sql first. Safe to re-run.
-- 1. Logs the roadmap tombstones script (only if its constraint really allows 'roadmaps').
-- 2. Replaces admin_migration_status() with the same list plus the roadmap tombstones check.

insert into public.migration_log (filename)
select '20261127000000_roadmap_tombstones.sql'
where exists (select 1 from pg_constraint
              where conname = 'content_tombstones_kind_check' and pg_get_constraintdef(oid) like '%roadmaps%')
on conflict do nothing;

create or replace function public.admin_migration_status()
returns table (filename text, logged boolean, applied_at timestamptz, objects_ok boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  return query
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
    ('20261127020000_admin_migration_status.sql',
      to_regclass('public.app_admins') is not null),
    ('20261127030000_roadmap_tombstones_log.sql',
      to_regprocedure('public.admin_migration_status()') is not null)
  )
  select coalesce(l.filename, c.migration) as filename,
         l.filename is not null as logged,
         l.applied_at,
         c.present as objects_ok
  from public.migration_log l
  full join checks c on c.migration = l.filename
  order by 1;
end;
$$;

revoke all on function public.admin_migration_status() from public, anon;
grant execute on function public.admin_migration_status() to authenticated;

insert into public.migration_log (filename) values ('20261127030000_roadmap_tombstones_log.sql') on conflict do nothing;
