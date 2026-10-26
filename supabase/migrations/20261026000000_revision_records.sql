-- Per-user cloud copy of local (Dexie) revision records.
-- Dexie stays the offline source of truth; rows merge by newest last_time.
create table if not exists public.revision_records (
  user_id       uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  workspace_key text        not null,
  hash          text        not null,
  last_time     timestamptz not null,
  data          jsonb       not null,
  updated_at    timestamptz not null default now(),
  primary key (user_id, workspace_key, hash)
);

alter table public.revision_records enable row level security;

create policy "revision_records_select_own" on public.revision_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy "revision_records_insert_own" on public.revision_records
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "revision_records_update_own" on public.revision_records
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "revision_records_delete_own" on public.revision_records
  for delete to authenticated using (user_id = (select auth.uid()));
