-- Bound client-controlled fields and make updated_at server-authoritative.
alter table public.revision_records
  add constraint revision_records_data_size check (pg_column_size(data) < 20000),
  add constraint revision_records_key_length check (char_length(workspace_key) <= 200 and char_length(hash) <= 200),
  add constraint revision_records_last_time_sane check (last_time <= now() + interval '1 day');

create or replace function public.revision_records_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists revision_records_touch on public.revision_records;
create trigger revision_records_touch before insert or update on public.revision_records
  for each row execute function public.revision_records_touch();
