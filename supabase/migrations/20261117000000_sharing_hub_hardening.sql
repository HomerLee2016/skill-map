-- Sharing hub hardening: the DATABASE (not just the app) decides what may be published.
--
-- NOT RUN AUTOMATICALLY. Paste into the Supabase SQL Editor and click Run (re-running is safe).
-- Run after 20261114000000 (sharing hub) and 20261116000000 (tags).
--
-- What it adds
--   1. Server-side validation of `shared_workspaces.content` on every publish: allowed keys only, item counts,
--      field lengths, ~1 MB total, lessons must be Markdown (the only HTML allowed is
--      <audio controls src="https://translate.google.com/translate_tts?...">; no images, links other than
--      http(s)), tests/roadmaps must have the app's shape, roadmap YAML may not use tags, anchors, aliases or
--      non-empty flow collections. Same rules as src/services/sharingValidation.ts.
--   2. Limits per user: 10 publishes per rolling 24 hours, 20 active (visible) published workspaces.
--   3. Takedown: `hidden` flag. Hidden rows are invisible to everyone except their owner, cannot be cloned, and the
--      owner cannot un-hide them. Only you (SQL Editor / service role) can set or clear `hidden`.
--   4. Reports: any signed-in user can report someone else's share once; 3 different reporters hide it automatically.
--   5. `lesson_count`, `test_count`, `roadmap_count` are now computed by the server from `content`.
--
-- Existing rows are checked once at the bottom: rows that break the new rules are hidden with
-- hidden_reason = 'validation' (the owner still sees them and can fix and republish them).
--
-- Moderation cheat sheet (SQL Editor):
--   select r.created_at, r.reason, r.note, s.id, s.name, s.owner_label from shared_workspace_reports r
--     join shared_workspaces s on s.id = r.shared_id order by r.created_at desc;
--   update shared_workspaces set hidden = true,  hidden_reason = 'moderation', hidden_at = now() where id = '<id>';
--   update shared_workspaces set hidden = false, hidden_reason = null,         hidden_at = null  where id = '<id>';

-- ---------------------------------------------------------------------------------------------------------
-- Columns and tables
-- ---------------------------------------------------------------------------------------------------------

alter table public.shared_workspaces
  add column if not exists hidden        boolean     not null default false,
  add column if not exists hidden_reason text,
  add column if not exists hidden_at     timestamptz;

create index if not exists shared_workspaces_visible_idx on public.shared_workspaces (updated_at desc) where not hidden;

-- One row per publish, for the rate limit. Nobody reads or writes it directly (RLS on, no policies).
create table if not exists public.shared_publish_log (
  id      bigint      generated always as identity primary key,
  user_id uuid        not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now(),
  -- Used to count one upsert once (it fires the insert and the update trigger within one statement).
  workspace_key text,
  stmt    timestamptz not null default statement_timestamp()
);
create index if not exists shared_publish_log_user_idx on public.shared_publish_log (user_id, at desc);
alter table public.shared_publish_log enable row level security;
revoke all on public.shared_publish_log from anon, authenticated, public;

create table if not exists public.shared_workspace_reports (
  id          uuid        primary key default gen_random_uuid(),
  shared_id   uuid        not null references public.shared_workspaces (id) on delete cascade,
  reporter_id uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  reason      text        not null check (reason in ('malicious', 'inappropriate', 'spam', 'copyright', 'other')),
  note        text        not null default '' check (char_length(note) <= 500),
  created_at  timestamptz not null default now(),
  unique (shared_id, reporter_id)
);
create index if not exists shared_workspace_reports_shared_idx on public.shared_workspace_reports (shared_id);
alter table public.shared_workspace_reports enable row level security;

drop policy if exists shared_reports_select_own on public.shared_workspace_reports;
create policy shared_reports_select_own on public.shared_workspace_reports
  for select to authenticated using (reporter_id = (select auth.uid()));

-- You can report a visible share that is not yours. No update or delete: a report stays.
drop policy if exists shared_reports_insert_own on public.shared_workspace_reports;
create policy shared_reports_insert_own on public.shared_workspace_reports
  for insert to authenticated with check (
    reporter_id = (select auth.uid())
    and exists (select 1 from public.shared_workspaces s where s.id = shared_id and s.owner_id <> (select auth.uid()))
  );

revoke all on public.shared_workspace_reports from anon, public;
grant select, insert on public.shared_workspace_reports to authenticated;

-- Hidden shares are visible only to their owner.
drop policy if exists shared_workspaces_select_signed_in on public.shared_workspaces;
create policy shared_workspaces_select_signed_in on public.shared_workspaces
  for select to authenticated using (not hidden or owner_id = (select auth.uid()));

-- ---------------------------------------------------------------------------------------------------------
-- Content validation (pure functions: return NULL when fine, otherwise a short sentence)
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.shared_lesson_problem(body text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  rest text;
begin
  if char_length(body) > 200000 then return 'a lesson is longer than 200000 characters'; end if;
  if body ~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]' then return 'a lesson contains control characters'; end if;
  if body ~* '!\[[^\]]*\](\([^)]*\)|\[[^\]]*\])' or body ~* '<\s*img\M' then return 'lessons cannot contain images'; end if;
  -- Take out the only HTML we accept (audio players with the text-to-speech url) and plain <https://...> autolinks;
  -- anything that still looks like a tag is raw HTML.
  rest := regexp_replace(body,
    '<audio(\s+(controls|loop)(="")?|\s+preload="[a-z]+"|\s+type="audio/[a-z0-9.+-]+"|\s+src="https://translate\.google\.com/translate_tts\?[^"<>]*")*\s*>|</audio\s*>|<https?://[^\s<>]+>',
    '', 'gi');
  if rest ~ '<\s*/?\s*[a-zA-Z!?]' then return 'lessons must be Markdown: raw HTML is not allowed (only audio players with a Google text-to-speech url)'; end if;
  if body ~* '\]\(\s*<?\s*(?!https?:)[a-z][a-z0-9+.-]*:'
     or body ~* '(^|\n) {0,3}\[[^\]\n]+\]:[ \t]*<?(?!https?:)[a-z][a-z0-9+.-]*:'
     or body ~ '\]\([^)]*&#\w' then
    return 'lessons can only link to http(s) addresses';
  end if;
  return null;
end;
$$;

create or replace function public.shared_yaml_problem(doc text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  -- Start of a YAML node: line start, any "- " markers, an optional "key: ".
  node_start constant text := '(^|\n)[ \t]*(-[ \t]+)*([^\n:#''"]{1,200}:[ \t]+)?';
begin
  if char_length(doc) > 200000 then return 'roadmap YAML is longer than 200000 characters'; end if;
  if doc ~ '[\u0001-\u0008\u000b\u000c\u000e-\u001f\u007f]' then return 'roadmap YAML contains control characters'; end if;
  if doc ~ (node_start || '[&*!]\S') then return 'roadmap YAML cannot use tags, anchors or aliases'; end if;
  if doc ~ (node_start || '[\[{][ \t]*[^\]}\s]') then return 'roadmap YAML must be plain block style'; end if;
  if doc ~ '(^|\n)[ \t]*(---|\.\.\.)[ \t]*\S' or doc ~ '(^|\n)%' then return 'roadmap YAML cannot hold directives or several documents'; end if;
  return null;
end;
$$;

-- A folder tree is { folders: [folder], items: [id] }; a folder is { name, items: [id], children: [folder] }.
create or replace function public.shared_tree_problem(tree jsonb, is_root boolean default true, depth int default 0)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  child jsonb;
  item jsonb;
  list_key text := case when is_root then 'folders' else 'children' end;
  inner_problem text;
begin
  if tree is null then return null; end if;
  if jsonb_typeof(tree) <> 'object' then return 'a folder tree must be an object'; end if;
  if depth > 12 then return 'folders are nested too deeply'; end if;
  if exists (select 1 from jsonb_object_keys(tree) k where k <> all (case when is_root then array['folders', 'items'] else array['name', 'items', 'children'] end)) then
    return 'a folder tree has unexpected keys';
  end if;
  if not is_root and (jsonb_typeof(tree->'name') is distinct from 'string' or char_length(tree->>'name') not between 1 and 200) then
    return 'a folder name is invalid';
  end if;
  if tree ? 'items' then
    if jsonb_typeof(tree->'items') <> 'array' or jsonb_array_length(tree->'items') > 500 then return 'a folder has too many items'; end if;
    for item in select * from jsonb_array_elements(tree->'items') loop
      if jsonb_typeof(item) <> 'string' or char_length(item #>> '{}') > 200 then return 'a folder item is invalid'; end if;
    end loop;
  end if;
  if tree ? list_key then
    if jsonb_typeof(tree->list_key) <> 'array' or jsonb_array_length(tree->list_key) > 500 then return 'a folder list is invalid or too long'; end if;
    for child in select * from jsonb_array_elements(tree->list_key) loop
      inner_problem := public.shared_tree_problem(child, false, depth + 1);
      if inner_problem is not null then return inner_problem; end if;
    end loop;
  end if;
  return null;
end;
$$;

create or replace function public.shared_content_problem(c jsonb)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  kind text;
  arr jsonb;
  elem jsonb;
  q jsonb;
  o jsonb;
  problem text;
  id_pattern constant text := '^[[:alnum:]._ -]{1,200}$';
begin
  if c is null or jsonb_typeof(c) <> 'object' then return 'content must be an object'; end if;
  if octet_length(c::text) > 1000000 then return 'the snapshot is larger than 1 MB'; end if;
  if exists (select 1 from jsonb_object_keys(c) k where k not in ('lessons', 'tests', 'roadmaps', 'lessonStructure', 'testsStructure')) then
    return 'the snapshot has unexpected top-level keys';
  end if;

  foreach kind in array array['lessons', 'tests', 'roadmaps'] loop
    arr := coalesce(c->kind, '[]'::jsonb);
    if jsonb_typeof(arr) <> 'array' then return kind || ' must be a list'; end if;
    if jsonb_array_length(arr) > 500 then return 'too many ' || kind || ' (max 500)'; end if;
    for elem in select * from jsonb_array_elements(arr) loop
      if jsonb_typeof(elem) <> 'object' then return 'every item in ' || kind || ' must be an object'; end if;
      if exists (select 1 from jsonb_object_keys(elem) k where k not in ('id', 'title', 'name', 'content', 'questions', 'yaml')) then return 'an item in ' || kind || ' has unexpected keys'; end if;
      if jsonb_typeof(elem->'id') is distinct from 'string' or (elem->>'id') !~ id_pattern or (elem->>'id') in ('__proto__', 'constructor', 'prototype') then
        return 'an item in ' || kind || ' has an invalid id';
      end if;
      if kind = 'lessons' then
        if exists (select 1 from jsonb_object_keys(elem) k where k not in ('id', 'title', 'content')) then return 'a lesson has unexpected keys'; end if;
        if jsonb_typeof(elem->'title') is distinct from 'string' or char_length(elem->>'title') > 500 then return 'a lesson title is invalid'; end if;
        if jsonb_typeof(elem->'content') is distinct from 'string' then return 'lesson content must be text'; end if;
        problem := public.shared_lesson_problem(elem->>'content');
        if problem is not null then return problem; end if;
      elsif kind = 'roadmaps' then
        if exists (select 1 from jsonb_object_keys(elem) k where k not in ('id', 'name', 'yaml')) then return 'a roadmap has unexpected keys'; end if;
        if jsonb_typeof(elem->'name') is distinct from 'string' or char_length(elem->>'name') > 500 then return 'a roadmap name is invalid'; end if;
        if jsonb_typeof(elem->'yaml') is distinct from 'string' then return 'roadmaps must be YAML text'; end if;
        problem := public.shared_yaml_problem(elem->>'yaml');
        if problem is not null then return problem; end if;
      else
        if exists (select 1 from jsonb_object_keys(elem) k where k not in ('id', 'title', 'questions')) then return 'a test has unexpected keys'; end if;
        if jsonb_typeof(elem->'title') is distinct from 'string' or char_length(elem->>'title') > 500 then return 'a test title is invalid'; end if;
        if jsonb_typeof(elem->'questions') is distinct from 'array' or jsonb_array_length(elem->'questions') > 2000 then return 'a test has an invalid or too long question list'; end if;
        for q in select * from jsonb_array_elements(elem->'questions') loop
          if jsonb_typeof(q) <> 'object' then return 'a question must be an object'; end if;
          if exists (select 1 from jsonb_object_keys(q) k where k not in ('question_number', 'question', 'options', 'correct_answer', 'explanation', 'audio_track_url')) then return 'a question has unexpected keys'; end if;
          if jsonb_typeof(q->'question') is distinct from 'string' or char_length(q->>'question') > 5000 then return 'a question text is invalid'; end if;
          if jsonb_typeof(q->'correct_answer') is distinct from 'string' or char_length(q->>'correct_answer') > 5000 then return 'a correct answer is invalid'; end if;
          if q ? 'question_number' and jsonb_typeof(q->'question_number') <> 'number' then return 'a question number is invalid'; end if;
          if q ? 'explanation' and (jsonb_typeof(q->'explanation') <> 'string' or char_length(q->>'explanation') > 5000) then return 'a question explanation is invalid'; end if;
          if q ? 'audio_track_url' and (jsonb_typeof(q->'audio_track_url') <> 'string' or (q->>'audio_track_url') !~ '^https://translate\.google\.com/translate_tts\?' or char_length(q->>'audio_track_url') > 600) then
            return 'question audio must be a Google text-to-speech url';
          end if;
          if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options') not between 1 and 20 then return 'a question needs 1 to 20 options'; end if;
          for o in select * from jsonb_array_elements(q->'options') loop
            if jsonb_typeof(o) <> 'string' or char_length(o #>> '{}') > 5000 then return 'a question option is invalid'; end if;
          end loop;
        end loop;
      end if;
    end loop;
  end loop;

  problem := public.shared_tree_problem(c->'lessonStructure');
  if problem is not null then return problem; end if;
  if c ? 'testsStructure' then
    if jsonb_typeof(c->'testsStructure') <> 'object' or exists (select 1 from jsonb_object_keys(c->'testsStructure') k where k not in ('revision', 'new_tests')) then
      return 'testsStructure has unexpected keys';
    end if;
    problem := coalesce(public.shared_tree_problem(c->'testsStructure'->'revision'), public.shared_tree_problem(c->'testsStructure'->'new_tests'));
    if problem is not null then return problem; end if;
  end if;
  return null;
end;
$$;

-- ---------------------------------------------------------------------------------------------------------
-- Guard trigger on shared_workspaces
-- ---------------------------------------------------------------------------------------------------------
-- "Client" = a signed-in app user (auth.uid() is set) acting directly. You in the SQL Editor, and triggers that
-- fire other triggers (the auto-hide below), are trusted and may change the server-owned columns.

create or replace function public.shared_workspaces_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  client boolean := auth.uid() is not null and pg_trigger_depth() = 1;
  problem text;
  content_changed boolean;
  repaired boolean := false;
begin
  content_changed := tg_op = 'INSERT' or new.content is distinct from old.content;

  if tg_op = 'INSERT' then
    if client then
      new.owner_id := uid;
      new.hidden := false; new.hidden_reason := null; new.hidden_at := null;
    end if;
  elsif client then
    new.owner_id := old.owner_id;
    -- Moderation columns belong to the server. A row hidden for failing validation may be fixed and republished;
    -- one taken down by moderation or reports may not.
    if old.hidden and coalesce(old.hidden_reason, '') <> 'validation' then
      raise exception 'This workspace was taken down and cannot be changed. Unpublish it instead.' using errcode = 'check_violation';
    end if;
    repaired := old.hidden and old.hidden_reason = 'validation';
    new.hidden := old.hidden; new.hidden_reason := old.hidden_reason; new.hidden_at := old.hidden_at;
  end if;

  if content_changed then
    problem := public.shared_content_problem(new.content);
    if problem is not null then raise exception 'Cannot publish: %', problem using errcode = 'check_violation'; end if;
    new.lesson_count  := coalesce(jsonb_array_length(new.content->'lessons'), 0);
    new.test_count    := coalesce(jsonb_array_length(new.content->'tests'), 0);
    new.roadmap_count := coalesce(jsonb_array_length(new.content->'roadmaps'), 0);
    -- A row hidden only for failing validation is visible again once it passes.
    if client and repaired then
      new.hidden := false; new.hidden_reason := null; new.hidden_at := null;
    end if;
  end if;

  if exists (select 1 from unnest(new.tags) t where char_length(t) not between 1 and 30) then
    raise exception 'Cannot publish: a tag is empty or longer than 30 characters' using errcode = 'check_violation';
  end if;

  if client and content_changed then
    -- 20 active (visible) published workspaces per user. A re-publish of an existing one is not a new one.
    if tg_op = 'INSERT' and not exists (select 1 from public.shared_workspaces s where s.owner_id = new.owner_id and s.source_workspace_key = new.source_workspace_key)
       and (select count(*) from public.shared_workspaces s where s.owner_id = new.owner_id and not s.hidden) >= 20 then
      raise exception 'You already have 20 published workspaces. Unpublish one first.' using errcode = 'check_violation';
    end if;
    -- 10 publishes per rolling 24 hours. An upsert fires insert and update triggers in one statement: count that row once.
    if not exists (select 1 from public.shared_publish_log l where l.user_id = uid and l.workspace_key = new.source_workspace_key and l.stmt = statement_timestamp()) then
      if (select count(*) from public.shared_publish_log l where l.user_id = uid and l.at > now() - interval '24 hours') >= 10 then
        raise exception 'Publish limit reached (10 per 24 hours). Try again later.' using errcode = 'check_violation';
      end if;
      insert into public.shared_publish_log (user_id, workspace_key) values (uid, new.source_workspace_key);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists shared_workspaces_guard on public.shared_workspaces;
create trigger shared_workspaces_guard before insert or update on public.shared_workspaces
  for each row execute function public.shared_workspaces_guard();
-- Triggers run alphabetically: the guard (g) runs before set_updated_at (s).

-- ---------------------------------------------------------------------------------------------------------
-- Reports: rate limit and auto-hide
-- ---------------------------------------------------------------------------------------------------------

create or replace function public.shared_reports_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.shared_workspace_reports r where r.reporter_id = new.reporter_id and r.created_at > now() - interval '24 hours') > 20 then
    raise exception 'Report limit reached for today.' using errcode = 'check_violation';
  end if;
  if (select count(*) from public.shared_workspace_reports r where r.shared_id = new.shared_id) >= 3 then
    update public.shared_workspaces
       set hidden = true, hidden_reason = 'reports', hidden_at = now()
     where id = new.shared_id and not hidden;
  end if;
  return new;
end;
$$;

drop trigger if exists shared_reports_after_insert on public.shared_workspace_reports;
create trigger shared_reports_after_insert after insert on public.shared_workspace_reports
  for each row execute function public.shared_reports_after_insert();

-- ---------------------------------------------------------------------------------------------------------
-- One-time check of rows that already exist (runs as you, so the guard treats it as trusted)
-- ---------------------------------------------------------------------------------------------------------

update public.shared_workspaces
   set hidden = true, hidden_reason = 'validation', hidden_at = now()
 where not hidden and public.shared_content_problem(content) is not null;

select id, name, owner_label, public.shared_content_problem(content) as problem
  from public.shared_workspaces
 where hidden_reason = 'validation';
