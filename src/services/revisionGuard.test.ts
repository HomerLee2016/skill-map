import test from 'node:test';
import assert from 'node:assert/strict';
import { applyBlockedChanges, changeKey, collectRevisionChanges, needsRevisionReview } from './revisionGuard';
import { mergeRevisionRecords } from './revisionSyncMerge';
import type { CompletedQuestionRecord } from './revisionDb';

const rec = (hash: string, last_time = '2026-01-01T00:00:00Z'): CompletedQuestionRecord => ({
  hash, last_time, question_name: `Q ${hash}`, options: [], correct_answer: 'a', quiz_title: 'Quiz',
});

test('inserts and deletes are counted; updates are not', () => {
  const local = [rec('a', '2026-02-01T00:00:00Z'), rec('b'), rec('only-local')];
  const remote = [rec('a'), rec('b', '2026-02-01T00:00:00Z'), rec('only-remote')];
  const merged = mergeRevisionRecords(local, remote, { local: [], remote: [] });
  const rows = collectRevisionChanges(merged, local, remote);
  assert.deepEqual(rows.map((row) => row.key).sort(), [changeKey('cloud', 'insert', 'only-local'), changeKey('device', 'insert', 'only-remote')].sort());
});

test('removals show up as delete rows in both directions with the question text', () => {
  const local = [rec('gone-here', '2026-01-01T00:00:00Z'), rec('keep')];
  const remote = [rec('keep')];
  const merged = mergeRevisionRecords(local, remote, {
    local: [{ hash: 'removed-here', deleted_at: '2026-03-01T00:00:00Z' }],
    remote: [{ hash: 'gone-here', deleted_at: '2026-03-01T00:00:00Z' }],
  });
  const rows = collectRevisionChanges(merged, local, remote);
  const keys = rows.map((row) => row.key);
  assert.ok(keys.includes(changeKey('device', 'delete', 'gone-here')));
  assert.ok(keys.includes(changeKey('cloud', 'delete', 'removed-here')));
  assert.equal(rows.find((row) => row.hash === 'gone-here')?.label, 'Q gone-here');
});

test('blocked rows are dropped from the merge result, others stay', () => {
  const local = [rec('x'), rec('y')];
  const merged = mergeRevisionRecords(local, [], { local: [], remote: [] });
  const result = applyBlockedChanges(merged, new Set([changeKey('cloud', 'insert', 'x')]));
  assert.deepEqual(result.toRemote.map((r) => r.hash), ['y']);
  assert.equal(applyBlockedChanges(merged, new Set()), merged);
});

test('the guard asks only above 10 rows', () => {
  const rows = Array.from({ length: 11 }, (_, i) => rec(`h${i}`));
  const merged = mergeRevisionRecords(rows, [], { local: [], remote: [] });
  assert.equal(needsRevisionReview(collectRevisionChanges(merged, rows, [])), true);
  assert.equal(needsRevisionReview(collectRevisionChanges(mergeRevisionRecords(rows.slice(0, 10), [], { local: [], remote: [] }), rows.slice(0, 10), [])), false);
});
