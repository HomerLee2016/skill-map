-- Allow roadmap deletes to leave a tombstone, like lessons and tests do.
-- Safe to re-run. Until it is run, deleting a roadmap works here but other devices keep their copy.

alter table public.content_tombstones drop constraint if exists content_tombstones_kind_check;
alter table public.content_tombstones
  add constraint content_tombstones_kind_check check (kind in ('lessons', 'tests', 'roadmaps'));

insert into public.migration_log (filename) values ('20261127000000_roadmap_tombstones.sql') on conflict do nothing;
