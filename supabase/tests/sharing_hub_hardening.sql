-- Checks for migrations/20261117000000_sharing_hub_hardening.sql.
-- Run against a SCRATCH database (never production) after all migrations, e.g.
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/sharing_hub_hardening.sql
-- It needs `auth.users` and `auth.uid()` as Supabase provides them, and cleans up after itself (single transaction, rolled back; helper functions live in a throw-away schema `t`).
-- Prints "ALL SHARING HUB HARDENING CHECKS PASSED" or fails with the first broken expectation.

begin;

insert into auth.users (id) values
  ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2'),
  ('00000000-0000-0000-0000-0000000000a3'), ('00000000-0000-0000-0000-0000000000a4'), ('00000000-0000-0000-0000-0000000000a5');

create schema t;
grant usage on schema t to authenticated;

create function t.as_user(n int) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000a' || n, true);
  execute 'set local role authenticated';
end $$;

create function t.back_to_admin() returns void language plpgsql as $$
begin execute 'reset role'; perform set_config('request.jwt.claim.sub', '', true); end $$;

-- Runs a publish as the current user and returns the error message, or 'ok'.
create function t.publish(key text, content jsonb) returns text language plpgsql as $$
begin
  insert into public.shared_workspaces (source_workspace_key, name, content) values (key, 'n', content)
    on conflict (owner_id, source_workspace_key) do update set content = excluded.content;
  return 'ok';
exception when others then return sqlerrm;
end $$;

create function t.expect(label text, actual text, pattern text) returns void language plpgsql as $$
begin
  if actual !~* pattern then raise exception 'FAILED %: got "%", wanted /%/', label, actual, pattern; end if;
end $$;

grant execute on all functions in schema t to authenticated;

-- A good snapshot, as the app publishes it (roadmap YAML as YAML.stringify writes it).
create function t.good(lesson text default '# Hi' ) returns jsonb language sql as $$
  select jsonb_build_object(
    'lessons', jsonb_build_array(jsonb_build_object('id', 'l1', 'title', 'One', 'content', lesson)),
    'tests', jsonb_build_array(jsonb_build_object('id', 't1', 'title', 'T', 'questions', jsonb_build_array(
      jsonb_build_object('question_number', 1, 'question', 'Q', 'options', jsonb_build_array('a', 'b'), 'correct_answer', 'a',
        'audio_track_url', 'https://translate.google.com/translate_tts?ie=UTF-8&q=Hola')))),
    'roadmaps', jsonb_build_array(jsonb_build_object('id', 'r1', 'name', 'Map', 'yaml',
      E'- id: a\n  label: Learn *args and &more\n  lessons:\n    - l1\n  dependsOn: []\n  children:\n    - id: b\n      label: "!quoted"\n')),
    'lessonStructure', jsonb_build_object('folders', jsonb_build_array(jsonb_build_object('name', 'F', 'items', jsonb_build_array('l1'), 'children', '[]'::jsonb)), 'items', '[]'::jsonb),
    'testsStructure', jsonb_build_object('revision', jsonb_build_object('folders', '[]'::jsonb, 'items', jsonb_build_array('t1')), 'new_tests', jsonb_build_object('folders', '[]'::jsonb, 'items', '[]'::jsonb)));
$$;

grant execute on all functions in schema t to authenticated;
select t.as_user(1);

-- 1. A good publish works, the server computes the counts, audio players with the TTS url are fine.
select t.expect('good publish', t.publish('good', t.good()), '^ok$');
select t.expect('audio lesson', t.publish('audio', t.good(E'# Hola\n<audio controls src="https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=Seis Hola" type="audio/mpeg">\n  Your browser does not support audio.\n</audio>\n[x](https://example.com) <https://example.com>')), '^ok$');
do $$ begin
  if (select lesson_count::text || test_count::text || roadmap_count::text from public.shared_workspaces where source_workspace_key = 'good') <> '111' then raise exception 'FAILED counts'; end if;
end $$;

-- 2. Content the rules reject.
select t.expect('script', t.publish('bad', t.good('<script>alert(1)</script>')), 'raw HTML');
select t.expect('img tag', t.publish('bad', t.good('<img src=x onerror=alert(1)>')), 'images');
select t.expect('md image', t.publish('bad', t.good('![a](https://x/y.png)')), 'images');
select t.expect('iframe', t.publish('bad', t.good('<IFRAME src="https://evil"></IFRAME>')), 'raw HTML');
select t.expect('anchor html', t.publish('bad', t.good('<a href="https://x">x</a>')), 'raw HTML');
select t.expect('js link', t.publish('bad', t.good('[x](javascript:alert(1))')), 'http');
select t.expect('data link', t.publish('bad', t.good('[x]( data:text/html,x)')), 'http');
select t.expect('entity link', t.publish('bad', t.good('[x](&#106;avascript:alert(1))')), 'http');
select t.expect('ref def', t.publish('bad', t.good(E'[x]\n\n[x]: vbscript:evil')), 'http');
select t.expect('foreign audio', t.publish('bad', t.good('<audio controls src="https://evil.example/a.mp3"></audio>')), 'raw HTML');
select t.expect('audio handler', t.publish('bad', t.good('<audio controls src="https://translate.google.com/translate_tts?q=a" onerror="x()"></audio>')), 'raw HTML');
select t.expect('control chars', t.publish('bad', t.good(E'a\u0001b')), 'control');
select t.expect('huge lesson', t.publish('bad', t.good(repeat('x', 200001))), 'longer than');
select t.expect('top key', t.publish('bad', t.good() || '{"files": []}'), 'top-level');
select t.expect('lesson key', t.publish('bad', jsonb_set(t.good(), '{lessons,0,html}', '"x"')), 'unexpected keys');
select t.expect('question key', t.publish('bad', jsonb_set(t.good(), '{tests,0,questions,0,image}', '"x"')), 'unexpected keys');
select t.expect('foreign question audio', t.publish('bad', jsonb_set(t.good(), '{tests,0,questions,0,audio_track_url}', '"https://evil.example/a.mp3"')), 'text-to-speech');
select t.expect('bad id', t.publish('bad', jsonb_set(t.good(), '{lessons,0,id}', '"../../etc"')), 'invalid id');
select t.expect('proto id', t.publish('bad', jsonb_set(t.good(), '{lessons,0,id}', '"__proto__"')), 'invalid id');
select t.expect('yaml anchor', t.publish('bad', jsonb_set(t.good(), '{roadmaps,0,yaml}', to_jsonb(E'a: &x 1\nb: *x\n'::text))), 'tags, anchors');
select t.expect('yaml tag', t.publish('bad', jsonb_set(t.good(), '{roadmaps,0,yaml}', to_jsonb(E'- id: a\n  evil: !!js/function "x"\n'::text))), 'tags, anchors');
select t.expect('yaml list anchor', t.publish('bad', jsonb_set(t.good(), '{roadmaps,0,yaml}', to_jsonb(E'- &a x\n- *a\n'::text))), 'tags, anchors');
select t.expect('yaml flow', t.publish('bad', jsonb_set(t.good(), '{roadmaps,0,yaml}', to_jsonb(E'a: [&x 1, *x]\n'::text))), 'block style');
select t.expect('yaml multi doc', t.publish('bad', jsonb_set(t.good(), '{roadmaps,0,yaml}', to_jsonb(E'a: 1\n--- b\n'::text))), 'documents');
select t.expect('deep tree', t.publish('bad', jsonb_set(t.good(), '{lessonStructure}', (select jsonb_build_object('folders', jsonb_build_array(
   (with recursive d(n, j) as (select 0, '{"name":"x","items":[],"children":[]}'::jsonb union all select n + 1, jsonb_build_object('name', 'x', 'items', '[]'::jsonb, 'children', jsonb_build_array(j)) from d where n < 15) select j from d order by n desc limit 1)), 'items', '[]'::jsonb)))), 'nested too deeply');
select t.expect('over 1 MB', t.publish('bad', jsonb_build_object('lessons', (select jsonb_agg(jsonb_build_object('id', 'l' || i, 'title', 't', 'content', repeat('x', 150000))) from generate_series(1, 8) i))), '1 MB');
select t.expect('too many items', t.publish('bad', jsonb_build_object('lessons', (select jsonb_agg(jsonb_build_object('id', 'l' || i, 'title', 't', 'content', 'x')) from generate_series(1, 501) i))), 'too many lessons');
select t.expect('nothing stored', (select count(*)::text from public.shared_workspaces where source_workspace_key = 'bad'), '^0$');

-- 3. Owners cannot touch moderation columns or change the owner.
do $$ begin
  update public.shared_workspaces set hidden = true, hidden_reason = 'x' where source_workspace_key = 'good';
  if (select hidden from public.shared_workspaces where source_workspace_key = 'good') then raise exception 'FAILED owner could hide'; end if;
end $$;
select t.expect('forge hidden=false on insert', t.publish('forged', t.good()), '^ok$');
insert into public.shared_workspaces (source_workspace_key, name, content, hidden) values ('forged2', 'n', t.good(), true) on conflict do nothing;
do $$ begin
  if (select hidden from public.shared_workspaces where source_workspace_key = 'forged2') then raise exception 'FAILED insert with hidden=true kept it'; end if;
end $$;

-- 4. Rate limit: 10 publishes per rolling 24 hours (each upsert counts once). 4 so far above (good, audio, forged, forged2) + ...
select t.expect('publish 5', t.publish('r5', t.good()), '^ok$');
select t.expect('publish 6', t.publish('r6', t.good()), '^ok$');
select t.expect('publish 7', t.publish('r7', t.good()), '^ok$');
select t.expect('publish 8', t.publish('r8', t.good()), '^ok$');
select t.expect('publish 9', t.publish('good', t.good('# Again')), '^ok$');
select t.expect('publish 10', t.publish('r10', t.good()), '^ok$');
select t.expect('publish 11 blocked', t.publish('r11', t.good()), 'Publish limit');
select t.expect('re-publish blocked too', t.publish('good', t.good('# Third')), 'Publish limit');

-- 5. Cap of 20 active published workspaces (user 2 has no rate-limit history).
select t.back_to_admin();
insert into public.shared_workspaces (owner_id, source_workspace_key, name, content)
  select '00000000-0000-0000-0000-0000000000a2', 'k' || i, 'n', t.good() from generate_series(1, 20) i;
select t.as_user(2);
select t.expect('21st active blocked', t.publish('k21', t.good()), 'already have 20');
select t.expect('re-publish at the cap works', t.publish('k1', t.good('# Edited')), '^ok$');

-- 6. Reports: not your own, once each, 3 reporters hide it; hidden shares vanish for others but not the owner.
select t.as_user(1);
do $$ declare m text; begin
  begin insert into public.shared_workspace_reports (shared_id, reason) select id, 'spam' from public.shared_workspaces where source_workspace_key = 'good'; m := 'ok';
  exception when others then m := sqlerrm; end;
  perform t.expect('report own share', m, 'row-level security');
end $$;
select t.as_user(3);
insert into public.shared_workspace_reports (shared_id, reason, note) select id, 'malicious', 'bad' from public.shared_workspaces where source_workspace_key = 'good';
do $$ declare m text; begin
  begin insert into public.shared_workspace_reports (shared_id, reason) select id, 'spam' from public.shared_workspaces where source_workspace_key = 'good'; m := 'ok';
  exception when others then m := sqlerrm; end;
  perform t.expect('duplicate report', m, 'duplicate key');
  begin insert into public.shared_workspace_reports (shared_id, reason) select id, 'bogus' from public.shared_workspaces where source_workspace_key = 'good'; m := 'ok';
  exception when others then m := sqlerrm; end;
  perform t.expect('bad reason', m, 'check constraint');
end $$;
select t.as_user(4);
insert into public.shared_workspace_reports (shared_id, reason) select id, 'spam' from public.shared_workspaces where source_workspace_key = 'good';
select t.as_user(5);
do $$ begin
  if not exists (select 1 from public.shared_workspaces where source_workspace_key = 'good') then raise exception 'FAILED hidden too early (2 reports)'; end if;
end $$;
insert into public.shared_workspace_reports (shared_id, reason) select id, 'inappropriate' from public.shared_workspaces where source_workspace_key = 'good';
do $$ begin
  if exists (select 1 from public.shared_workspaces where source_workspace_key = 'good') then raise exception 'FAILED 3 reports did not hide the share'; end if;
  if exists (select 1 from public.shared_workspace_reports r where r.reporter_id <> '00000000-0000-0000-0000-0000000000a5') then raise exception 'FAILED reporter sees others reports'; end if;
end $$;
select t.as_user(1);
do $$ declare m text; begin
  if not exists (select 1 from public.shared_workspaces where source_workspace_key = 'good' and hidden and hidden_reason = 'reports') then raise exception 'FAILED owner cannot see their hidden share'; end if;
end $$;
select t.back_to_admin();
-- A taken-down share cannot be edited by the owner (rate limit aside: use a fresh owner state via admin clear of the log).
delete from public.shared_publish_log;
select t.as_user(1);
select t.expect('edit taken-down share', t.publish('good', t.good('# Sneaky')), 'taken down');
do $$ declare m text; begin
  begin update public.shared_workspaces set hidden = false, hidden_reason = null where source_workspace_key = 'good'; m := 'ok';
  exception when others then m := sqlerrm; end;
  perform t.expect('owner un-hide', m, 'taken down');
end $$;
-- ...but the owner can unpublish it.
delete from public.shared_workspaces where source_workspace_key = 'good';

-- 7. Only the admin can restore: a validation-hidden row repairs itself when the owner republishes valid content.
select t.back_to_admin();
insert into public.shared_workspaces (owner_id, source_workspace_key, name, content, hidden, hidden_reason)
  values ('00000000-0000-0000-0000-0000000000a3', 'legacy', 'n', '{"lessons":[]}', true, 'validation');
select t.as_user(3);
select t.expect('republish fixed row', t.publish('legacy', t.good()), '^ok$');
do $$ begin
  if (select hidden from public.shared_workspaces where source_workspace_key = 'legacy') then raise exception 'FAILED repaired row still hidden'; end if;
end $$;

-- 8. anon and other users cannot reach the publish log; direct access is denied.
do $$ declare m text; begin
  begin perform count(*) from public.shared_publish_log; m := 'ok'; exception when others then m := sqlerrm; end;
  perform t.expect('publish log is private', m, 'permission denied');
end $$;

select 'ALL SHARING HUB HARDENING CHECKS PASSED' as result;
rollback;
