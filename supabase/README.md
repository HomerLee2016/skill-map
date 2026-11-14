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
| `shared_workspaces` | `id` (unique `(owner_id, source_workspace_key)`) | Sharing hub snapshots (see below) |

`updated_at` is set by a trigger. Size caps are check constraints. Migrations are idempotent.

## Running the migration (Supabase SQL Editor)

1. Open the Supabase project, then **SQL Editor** > **New query**.
2. Paste the whole of `migrations/20261027000000_user_workspace.sql` and click **Run**. Expect "Success. No rows returned". Re-running is safe.
3. Check **Table Editor**: `lessons`, `tests`, `roadmaps`, `workspace_structures` exist and `revision_records` no longer has a `workspace_key` column. Existing rows keep their `user_id`; rows that differed only by `workspace_key` collapse to the newest `last_time`.
4. Deploy this branch, sign in, and approve the "Two copies found" prompt if it appears.

Run it before deploying the frontend: the new frontend no longer sends `workspace_key`.

## Running the per-workspace migration

Run after the two migrations above (`20261027000000`, `20261027010000`): paste `migrations/20261027020000_workspace_key.sql` into the SQL Editor and click **Run**. Re-running is safe. Existing rows move to a `legacy` workspace; the app re-uploads each workspace's content from its folder and moves legacy revision records into the workspace whose tests they belong to the first time that workspace syncs.

## Sharing hub migration

Run after the migrations above: paste `migrations/20261114000000_sharing_hub.sql` into the SQL Editor and click **Run**. Re-running is safe. It creates `shared_workspaces` with RLS **and** the table grants (`grant select, insert, update, delete ... to authenticated`; without grants PostgREST answers 403 even when the policies are right).

- A row is a snapshot: `content` (jsonb) holds the lessons, tests, roadmaps and folder trees the owner ticked when publishing. Revision records are never included. Publishing again overwrites the row; unpublishing deletes it.
- Read: every **signed-in** user (`using (true)`). Insert/update/delete: the owner only (`owner_id = auth.uid()`). `anon` has no access. To let signed-out visitors browse too, add `grant select on public.shared_workspaces to anon;` and a select policy `to anon using (true)` (cloning still needs sign-in).
- The list screen selects every column except `content`; the content is fetched on preview or clone.
- Owners choose the name shown to others (`owner_label`); the email is never stored in the row.
- Cloning is done by the browser: it reads the snapshot, cleans it (`sanitizeSharedContent`: ids, markdown, quiz shape, roadmap fields and links), and writes a new workspace `shared-<random>` into the cloner's own tables. No function and no service role key are involved. Lesson markdown is sanitised again when rendered.
- Size caps: 5 MB per snapshot, 500 items per kind.

Merging workspaces needs no migration: it reads and writes the merging user's own rows.
