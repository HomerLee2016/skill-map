-- Sharing hub: tags on a published workspace, to make the hub easier to search.
--
-- Tags are short lowercase labels chosen by the owner when publishing (the app normalises them:
-- at most 10 per workspace, 30 characters each). They are public like the rest of the snapshot
-- summary. The existing owner-only update policy already covers them.
--
-- Run after 20261114000000. Safe to re-run. Until it is run, the hub still works and simply
-- shows no tags (publishing with tags then fails with a clear message).

alter table public.shared_workspaces
  add column if not exists tags text[] not null default '{}';

alter table public.shared_workspaces drop constraint if exists shared_workspaces_tags_check;
alter table public.shared_workspaces
  add constraint shared_workspaces_tags_check
  check (cardinality(tags) <= 10 and char_length(array_to_string(tags, ',')) <= 400);

create index if not exists shared_workspaces_tags_idx on public.shared_workspaces using gin (tags);
