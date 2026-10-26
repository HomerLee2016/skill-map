-- Per-workspace cloud rows (bug: switching workspace showed other workspaces' data).
--
-- 20261027000000 keyed every row by user only, so all of a user's workspaces
-- (Spanish, Japanese, ...) shared one pool. Add a `workspaces` table
-- (user_id, key, name) and make lessons, tests, roadmaps, workspace_structures
-- and revision_records reference it with (user_id, workspace_key). The key is
-- the app's `workspace-<hash>` storage key for the selected folder. Deleting a
-- workspace cascades to everything in it.
--
-- Existing rows get workspace_key = 'legacy' (their real workspace is unknown).
-- The app re-uploads each workspace's lessons/tests/roadmaps from its folder
-- under the right key, and moves legacy revision records into the workspace
-- they belong to the first time that workspace syncs.
--
-- Run after 20261027000000 and 20261027010000. Safe to re-run.

create table if not exists public.workspaces (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  key        text        not null check (char_length(key) between 1 and 100),
  name       text        not null check (char_length(name) between 1 and 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

drop trigger if exists set_updated_at on public.workspaces;
create trigger set_updated_at before insert or update on public.workspaces
  for each row execute function public.set_updated_at();

alter table public.workspaces enable row level security;
drop policy if exists workspaces_select_own on public.workspaces;
create policy workspaces_select_own on public.workspaces for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists workspaces_insert_own on public.workspaces;
create policy workspaces_insert_own on public.workspaces for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists workspaces_update_own on public.workspaces;
create policy workspaces_update_own on public.workspaces for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists workspaces_delete_own on public.workspaces;
create policy workspaces_delete_own on public.workspaces for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.workspaces from anon, public;
grant select, insert, update, delete on public.workspaces to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['lessons', 'tests', 'roadmaps', 'workspace_structures', 'revision_records'] loop
    execute format('alter table public.%I add column if not exists workspace_key text not null default %L', t, 'legacy');
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_workspace_key_len');
    execute format('alter table public.%I add constraint %I check (char_length(workspace_key) between 1 and 100)', t, t || '_workspace_key_len');
    -- Clients must always say which workspace a row belongs to.
    execute format('alter table public.%I alter column workspace_key drop default', t);
  end loop;
end;
$$;

-- Every user who already has rows gets one placeholder workspace for them.
insert into public.workspaces (user_id, key, name)
select distinct user_id, 'legacy', 'Legacy (not yet assigned)' from (
  select user_id from public.lessons union select user_id from public.tests
  union select user_id from public.roadmaps union select user_id from public.workspace_structures
  union select user_id from public.revision_records
) existing
on conflict do nothing;

do $$
declare
  t text;
begin
  foreach t in array array['lessons', 'tests', 'roadmaps', 'workspace_structures', 'revision_records'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_workspace_fkey');
    execute format('alter table public.%I add constraint %I foreign key (user_id, workspace_key) references public.workspaces (user_id, key) on delete cascade', t, t || '_workspace_fkey');
  end loop;
end;
$$;

alter table public.lessons drop constraint if exists lessons_pkey;
alter table public.lessons add primary key (user_id, workspace_key, id);

alter table public.tests drop constraint if exists tests_pkey;
alter table public.tests add primary key (user_id, workspace_key, id);

alter table public.roadmaps drop constraint if exists roadmaps_pkey;
alter table public.roadmaps add primary key (user_id, workspace_key, id);

alter table public.workspace_structures drop constraint if exists workspace_structures_pkey;
alter table public.workspace_structures add primary key (user_id, workspace_key, kind);

alter table public.revision_records drop constraint if exists revision_records_pkey;
alter table public.revision_records add primary key (user_id, workspace_key, hash);

drop index if exists public.revision_records_user_last_time_idx;
create index if not exists revision_records_user_ws_last_time_idx
  on public.revision_records (user_id, workspace_key, last_time desc);
