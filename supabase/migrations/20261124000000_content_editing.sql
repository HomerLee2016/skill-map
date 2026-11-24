-- In-app editing of lessons and tests (delete tombstones + per-workspace prompt guide).
--
-- 1. content_tombstones: when a lesson or test is deleted in the app, the cloud row is removed AND a
--    tombstone is written, so a device that still has the file (a PC folder) deletes it instead of
--    uploading it again. Saving the item again in the app removes its tombstone.
-- 2. workspaces.prompt_guide: the markdown the editor shows (with a Copy button) so you can paste it
--    into an AI app. When empty, the app uses its bundled Japanese / Spanish guide.
--
-- Safe to re-run. Until it is run, editing still works; deletes then do not propagate to other
-- devices and the guide is kept in the folder (prompt-guide.md) or the bundled copy is used.

create table if not exists public.content_tombstones (
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  workspace_key text        not null check (char_length(workspace_key) between 1 and 100),
  kind          text        not null check (kind in ('lessons', 'tests')),
  id            text        not null check (char_length(id) between 1 and 200),
  deleted_at    timestamptz not null default now(),
  primary key (user_id, workspace_key, kind, id),
  foreign key (user_id, workspace_key) references public.workspaces (user_id, key) on delete cascade
);

alter table public.content_tombstones enable row level security;
drop policy if exists content_tombstones_select_own on public.content_tombstones;
create policy content_tombstones_select_own on public.content_tombstones for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists content_tombstones_insert_own on public.content_tombstones;
create policy content_tombstones_insert_own on public.content_tombstones for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists content_tombstones_update_own on public.content_tombstones;
create policy content_tombstones_update_own on public.content_tombstones for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists content_tombstones_delete_own on public.content_tombstones;
create policy content_tombstones_delete_own on public.content_tombstones for delete to authenticated using (user_id = (select auth.uid()));
revoke all on public.content_tombstones from anon, public;
grant select, insert, update, delete on public.content_tombstones to authenticated;

alter table public.workspaces add column if not exists prompt_guide text;
alter table public.workspaces drop constraint if exists workspaces_prompt_guide_len;
alter table public.workspaces add constraint workspaces_prompt_guide_len check (prompt_guide is null or char_length(prompt_guide) <= 200000);
