# Supabase schema

A signed-in user has many workspaces (one per local folder). `workspaces(user_id, key, name)` is the parent table; lessons, tests, roadmaps, workspace_structures and revision_records reference it with `(user_id, workspace_key)` and cascade on delete. `key` is the app's `workspace-<hash>` storage key. Every table has `user_id uuid default auth.uid() references auth.users on delete cascade` and RLS limiting select/insert/update/delete to `user_id = auth.uid()`. `anon` has no access; `authenticated` has table privileges only.

| Table | Primary key | Holds |
| --- | --- | --- |
| `workspaces` | `(user_id, key)` | one row per workspace |
| `lessons` | `(user_id, workspace_key, id)` | markdown lessons |
| `tests` | `(user_id, workspace_key, id)` | tests, questions as a jsonb array |
| `roadmaps` | `(user_id, workspace_key, id)` | roadmap YAML |
| `workspace_structures` | `(user_id, workspace_key, kind)` | folder trees (`lessons`, `tests`) |
| `revision_records` | `(user_id, workspace_key, hash)` | per-question progress (stars = `proficiency`) |

`updated_at` is set by a trigger. Size caps are check constraints. Migrations are idempotent.

## Running the migration (Supabase SQL Editor)

1. Open the Supabase project, then **SQL Editor** > **New query**.
2. Paste the whole of `migrations/20261027000000_user_workspace.sql` and click **Run**. Expect "Success. No rows returned". Re-running is safe.
3. Check **Table Editor**: `lessons`, `tests`, `roadmaps`, `workspace_structures` exist and `revision_records` no longer has a `workspace_key` column. Existing rows keep their `user_id`; rows that differed only by `workspace_key` collapse to the newest `last_time`.
4. Deploy this branch, sign in, and approve the "Two copies found" prompt if it appears.

Run it before deploying the frontend: the new frontend no longer sends `workspace_key`.

## Running the per-workspace migration

Run after the two migrations above (`20261027000000`, `20261027010000`): paste `migrations/20261027020000_workspace_key.sql` into the SQL Editor and click **Run**. Re-running is safe. Existing rows move to a `legacy` workspace; the app re-uploads each workspace's content from its folder and moves legacy revision records into the workspace whose tests they belong to the first time that workspace syncs.
