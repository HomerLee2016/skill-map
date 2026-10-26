-- Cloud workspace keyed by the signed-in user (issue #35).
--
-- Model: one workspace per user. Every row is owned by auth.users(id); the old
-- folder-derived workspace_key is dropped so any browser or phone signed in as
-- the user sees the same lessons, tests, roadmaps and revision progress.
--
-- Safe to re-run: every statement is idempotent. Run in the Supabase SQL Editor.

-- ---------------------------------------------------------------------------
-- Shared trigger: the server owns updated_at (clients cannot back-date it).
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Content tables. PK starts with user_id, so it doubles as the per-user index.
-- Size caps stop one account from filling the free tier through the public API.
-- ---------------------------------------------------------------------------
create table if not exists public.lessons (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null check (char_length(id) between 1 and 200),
  title      text        not null check (char_length(title) between 1 and 500),
  content    text        not null check (char_length(content) <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Questions are always read and written together with their test, so they stay
-- a jsonb array on the test row instead of a separate table.
create table if not exists public.tests (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null check (char_length(id) between 1 and 200),
  title      text        not null check (char_length(title) between 1 and 500),
  questions  jsonb       not null default '[]'::jsonb
             check (jsonb_typeof(questions) = 'array' and pg_column_size(questions) <= 1000000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.roadmaps (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null check (char_length(id) between 1 and 200),
  name       text        not null check (char_length(name) between 1 and 500),
  yaml       text        not null check (char_length(yaml) <= 500000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Folder trees for the lessons page and the tests page (revision / new_tests).
create table if not exists public.workspace_structures (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  kind       text        not null check (kind in ('lessons', 'tests')),
  data       jsonb       not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 200000),
  updated_at timestamptz not null default now(),
  primary key (user_id, kind)
);

-- ---------------------------------------------------------------------------
-- revision_records: drop workspace_key, key by (user_id, hash).
-- Existing rows already carry user_id, so nothing is re-assigned; rows that
-- only differed by workspace_key collapse to the one with the newest last_time.
-- ---------------------------------------------------------------------------
create table if not exists public.revision_records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  hash       text        not null,
  last_time  timestamptz not null,
  data       jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, hash)
);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'revision_records' and column_name = 'workspace_key'
  ) then
    delete from public.revision_records r
    using (
      select ctid as row_id,
             row_number() over (partition by user_id, hash order by last_time desc, updated_at desc) as rn
      from public.revision_records
    ) ranked
    where r.ctid = ranked.row_id and ranked.rn > 1;

    alter table public.revision_records drop constraint if exists revision_records_pkey;
    alter table public.revision_records drop column workspace_key;
    alter table public.revision_records add primary key (user_id, hash);
  end if;
end;
$$;

alter table public.revision_records drop constraint if exists revision_records_hash_len;
alter table public.revision_records add constraint revision_records_hash_len
  check (char_length(hash) between 1 and 16384);
alter table public.revision_records drop constraint if exists revision_records_data_shape;
alter table public.revision_records add constraint revision_records_data_shape
  check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 100000);

create index if not exists revision_records_user_last_time_idx
  on public.revision_records (user_id, last_time desc);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.lessons;
create trigger set_updated_at before insert or update on public.lessons
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.tests;
create trigger set_updated_at before insert or update on public.tests
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.roadmaps;
create trigger set_updated_at before insert or update on public.roadmaps
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.workspace_structures;
create trigger set_updated_at before insert or update on public.workspace_structures
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.revision_records;
create trigger set_updated_at before insert or update on public.revision_records
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security: a user can only touch their own rows, for every operation.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['lessons', 'tests', 'roadmaps', 'workspace_structures', 'revision_records'] loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format('create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
                   t || '_select_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (user_id = (select auth.uid()))',
                   t || '_insert_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_update_own', t);
    execute format('create policy %I on public.%I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))',
                   t || '_update_own', t);

    execute format('drop policy if exists %I on public.%I', t || '_delete_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using (user_id = (select auth.uid()))',
                   t || '_delete_own', t);

    -- Least privilege: signed-out (anon) visitors get nothing.
    execute format('revoke all on public.%I from anon, public', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end;
$$;

grant usage on schema public to authenticated;
