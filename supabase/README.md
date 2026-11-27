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

## Votes and stars migration

Run after the sharing hub migration: paste `migrations/20261115000000_sharing_hub_reactions.sql` into the SQL Editor and click **Run** (re-running is safe). Until it is run, the hub still works and simply hides the vote and star buttons.

- `shared_workspace_reactions (user_id, shared_id, vote -1/0/1, starred)`: one private row per user and share. RLS: a user reads and writes only their own rows, so nobody can see who voted; nobody can react to their own share (enforced in the policy).
- `shared_workspace_stats` (view, counts only): any signed-in user reads it. It runs with the owner's rights on purpose so it can count everyone's rows; it exposes no user ids.
- Grants are included (`authenticated` only; `anon` has none).

## Tags migration

Run after the sharing hub migration: paste `migrations/20261116000000_sharing_hub_tags.sql` into the SQL Editor and click **Run** (re-running is safe). It adds a `tags` column (at most 10 tags per workspace) to `shared_workspaces`. Until it is run, the hub still works and simply shows no tags.

Duplicate workspace needs no migration: it writes a new `copy-<random>` workspace into the user's own rows.

## Sharing hub hardening migration

Run after the sharing hub, tags and votes migrations: paste `migrations/20261117000000_sharing_hub_hardening.sql` into the SQL Editor and click **Run** (re-running is safe). Until it is run, the app still works but the database does not enforce the rules below, and Report shows "needs the migration".

- Server-side validation of `shared_workspaces.content` (trigger `shared_workspaces_guard`): allowed keys only, item counts, field lengths, 1 MB total, lessons are Markdown (only `<audio>` with a Google TTS url as HTML; no images; http(s) links only), questions and roadmaps have the app's shape, roadmap YAML has no tags/anchors/aliases/flow style. Mirrors `src/services/sharingValidation.ts`.
- Limits per user: 10 publishes per 24 h, 20 active published workspaces.
- Moderation: `hidden`, `hidden_reason`, `hidden_at`. Hidden shares are visible only to their owner; owners cannot un-hide. Three reports from different users hide a share (`hidden_reason = 'reports'`). Existing rows that fail the new rules are hidden with `'validation'` (the owner can fix and republish).
- Reports: `shared_workspace_reports`; read your own only. Review them in the SQL Editor (queries at the top of the migration).
- Checks: `supabase/tests/sharing_hub_hardening.sql` (run on a scratch database, never production).

## Content editing migration

Run after the migrations above: paste `migrations/20261124000000_content_editing.sql` into the SQL Editor and click **Run** (re-running is safe).

- `content_tombstones (user_id, workspace_key, kind, id, deleted_at)`: written when a lesson or test is deleted in the app, so other devices delete their copy instead of uploading it again. Saving the item again removes the row. RLS own-rows only; grants to `authenticated` only; cascades with the workspace.
- `workspaces.prompt_guide` (text, at most 200 000 characters): the markdown guide shown in the lesson/test editors. Empty means the app's bundled guide for the workspace's language.
- Until it is run, adding, editing and deleting still work. Deletes just do not reach other devices (the app says so), and a guide edited in a cloud-only workspace cannot be saved.

## Migration log (which scripts have I run?)

Run `migrations/20261127010000_migration_log.sql` first in the SQL Editor (re-running is safe). It creates `migration_log (filename, applied_at)`, private (RLS on, no policies, no grants to `anon`/`authenticated`; the SQL Editor still works) and backfills the scripts run so far. Edit the backfill list to match what you really ran.

- **After running any migration**, log it: `insert into public.migration_log (filename) values ('<file name>') on conflict do nothing;`. New migrations should end with that line.
- **See what you missed**: run `scripts/unlogged-migrations.sh`, paste its output into the SQL Editor; it lists repo scripts not in the log.
- No keys are involved; nothing here touches the frontend.

## Admin tab (which scripts are applied?)

Run `migrations/20261127020000_admin_migration_status.sql` (after the migration log script). It creates `app_admins` (private), `is_app_admin()` and `admin_migration_status()` (admins only; security definer, so no service key or secret is needed anywhere). Then make yourself an admin once, in the SQL Editor, with your sign-in email:

```sql
insert into public.app_admins (user_id) select id from auth.users where email = 'you@example.com' on conflict do nothing;
```

Signed in as that user, an **Admin** link appears in the top bar. It compares the scripts bundled with the build (`supabase/migrations/*.sql` at build time) with the database: *Applied* = logged and its objects exist, *Applied (logged only)* = logged, no object check written, *Not run* = not logged. Other users never see the link, and the database refuses the function to them.

For each new script: end it with its `migration_log` insert; optionally add an object check to `admin_migration_status()` (same list as `supabase/tests/verify_migrations.sql`).
