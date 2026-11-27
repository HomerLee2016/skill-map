#!/usr/bin/env bash
# Prints a SQL query listing repo migrations that are NOT in public.migration_log.
# Paste the output into the Supabase SQL Editor. Needs no credentials.
set -euo pipefail
cd "$(dirname "$0")/../supabase/migrations"
values=$(ls *.sql | sort | sed "s/.*/('&')/" | paste -sd, -)
cat <<SQL
select r.filename as not_run_yet
from (values $values) as r(filename)
left join public.migration_log l using (filename)
where l.filename is null
order by 1;
SQL
