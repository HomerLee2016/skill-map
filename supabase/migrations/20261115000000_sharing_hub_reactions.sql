-- Sharing hub: up/down votes and stars on shared workspaces.
--
-- One row per (user, shared workspace) holds that user's vote (-1, 0/null = none, 1) and star. Rows are
-- private: a user reads and writes only their own, so nobody can see who voted. Totals come from the
-- `shared_workspace_stats` view, which any signed-in user can read and which exposes counts only.
-- Nobody can vote on or star their own share (checked in the policy, not just the UI).
--
-- Run after 20261114000000. Safe to re-run.

create table if not exists public.shared_workspace_reactions (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  shared_id  uuid        not null references public.shared_workspaces (id) on delete cascade,
  vote       smallint    not null default 0 check (vote in (-1, 0, 1)),
  starred    boolean     not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, shared_id)
);

create index if not exists shared_workspace_reactions_shared_idx on public.shared_workspace_reactions (shared_id);

drop trigger if exists set_updated_at on public.shared_workspace_reactions;
create trigger set_updated_at before insert or update on public.shared_workspace_reactions
  for each row execute function public.set_updated_at();

alter table public.shared_workspace_reactions enable row level security;

drop policy if exists shared_reactions_select_own on public.shared_workspace_reactions;
create policy shared_reactions_select_own on public.shared_workspace_reactions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists shared_reactions_insert_own on public.shared_workspace_reactions;
create policy shared_reactions_insert_own on public.shared_workspace_reactions
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and not exists (select 1 from public.shared_workspaces s where s.id = shared_id and s.owner_id = (select auth.uid()))
  );

drop policy if exists shared_reactions_update_own on public.shared_workspace_reactions;
create policy shared_reactions_update_own on public.shared_workspace_reactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and not exists (select 1 from public.shared_workspaces s where s.id = shared_id and s.owner_id = (select auth.uid()))
  );

drop policy if exists shared_reactions_delete_own on public.shared_workspace_reactions;
create policy shared_reactions_delete_own on public.shared_workspace_reactions
  for delete to authenticated using (user_id = (select auth.uid()));

revoke all on public.shared_workspace_reactions from anon, public;
grant select, insert, update, delete on public.shared_workspace_reactions to authenticated;

-- Totals only. Runs with the view owner's rights on purpose (security_invoker = false) so it can count
-- everyone's rows while the table itself stays private.
create or replace view public.shared_workspace_stats with (security_invoker = false) as
  select shared_id,
         count(*) filter (where vote = 1)  as upvotes,
         count(*) filter (where vote = -1) as downvotes,
         count(*) filter (where starred)   as stars
  from public.shared_workspace_reactions
  group by shared_id;

revoke all on public.shared_workspace_stats from anon, public;
grant select on public.shared_workspace_stats to authenticated;
grant usage on schema public to authenticated;
