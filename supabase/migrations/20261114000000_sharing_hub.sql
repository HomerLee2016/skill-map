-- Sharing hub: publish a snapshot of a workspace so other signed-in users can browse and clone it.
--
-- A snapshot is NOT live: `content` is a jsonb copy of the lessons, tests, roadmaps and folder
-- structures the owner ticked at publish time (revision records are never included). Re-publishing
-- overwrites the snapshot; unpublishing deletes the row. Cloning happens in the app: the browser
-- reads the snapshot and writes the user's own new workspace through the existing per-user tables,
-- so no function or elevated key is needed.
--
-- Access: any signed-in user can read every snapshot; only the owner can insert/update/delete theirs.
-- `anon` gets nothing (see supabase/README.md to open browsing to signed-out visitors).
--
-- Run after 20261027020000. Safe to re-run.

create table if not exists public.shared_workspaces (
  id                   uuid        primary key default gen_random_uuid(),
  owner_id             uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  source_workspace_key text        not null check (char_length(source_workspace_key) between 1 and 100),
  name                 text        not null check (char_length(name) between 1 and 200),
  description          text        not null default '' check (char_length(description) <= 2000),
  -- Shown to other users instead of the owner's email.
  owner_label          text        not null default 'Anonymous' check (char_length(owner_label) between 1 and 100),
  lesson_count         integer     not null default 0 check (lesson_count between 0 and 500),
  test_count           integer     not null default 0 check (test_count between 0 and 500),
  roadmap_count        integer     not null default 0 check (roadmap_count between 0 and 500),
  content              jsonb       not null
                       check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 5000000),
  published_at         timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- One snapshot per workspace: publishing again updates it.
  unique (owner_id, source_workspace_key)
);

create index if not exists shared_workspaces_updated_idx on public.shared_workspaces (updated_at desc);

-- The server owns updated_at (set_updated_at() comes from 20261027000000).
drop trigger if exists set_updated_at on public.shared_workspaces;
create trigger set_updated_at before insert or update on public.shared_workspaces
  for each row execute function public.set_updated_at();

alter table public.shared_workspaces enable row level security;

drop policy if exists shared_workspaces_select_signed_in on public.shared_workspaces;
create policy shared_workspaces_select_signed_in on public.shared_workspaces
  for select to authenticated using (true);

drop policy if exists shared_workspaces_insert_own on public.shared_workspaces;
create policy shared_workspaces_insert_own on public.shared_workspaces
  for insert to authenticated with check (owner_id = (select auth.uid()));

drop policy if exists shared_workspaces_update_own on public.shared_workspaces;
create policy shared_workspaces_update_own on public.shared_workspaces
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

drop policy if exists shared_workspaces_delete_own on public.shared_workspaces;
create policy shared_workspaces_delete_own on public.shared_workspaces
  for delete to authenticated using (owner_id = (select auth.uid()));

-- RLS only filters rows; without table privileges PostgREST answers 403 Forbidden.
revoke all on public.shared_workspaces from anon, public;
grant select, insert, update, delete on public.shared_workspaces to authenticated;
grant usage on schema public to authenticated;
