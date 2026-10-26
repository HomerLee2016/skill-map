-- Run after 20261027000000_user_workspace.sql (which adds the size caps and the
-- updated_at trigger). Stops a client from pinning last_time in the future so
-- it always wins the newest-last_time merge.
alter table public.revision_records drop constraint if exists revision_records_last_time_sane;
alter table public.revision_records add constraint revision_records_last_time_sane
  check (last_time <= now() + interval '1 day') not valid;
