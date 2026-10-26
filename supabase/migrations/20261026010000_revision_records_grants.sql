-- RLS policies only filter rows; the authenticated role also needs table privileges,
-- otherwise PostgREST returns 403 Forbidden. Grants are idempotent.
grant usage on schema public to authenticated;
grant select, insert, update, delete on public.revision_records to authenticated;
