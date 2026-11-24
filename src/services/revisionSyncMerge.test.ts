import test from 'node:test';
import assert from 'node:assert/strict';
import { filterOwnRecords, mergeRevisionRecords, splitLegacyRecords } from './revisionSyncMerge';
import type { CompletedQuestionRecord } from './revisionDb';

const rec = (hash: string, last_time: string, id?: number): CompletedQuestionRecord => ({
  id, hash, last_time, question_name: hash, options: [], correct_answer: 'a', quiz_title: 'q',
});

test('local-only records are pushed, remote-only records are pulled', () => {
  const { toLocal, toRemote } = mergeRevisionRecords([rec('a', '2026-01-01T00:00:00Z', 1)], [rec('b', '2026-01-01T00:00:00Z')]);
  assert.deepEqual(toRemote.map((r) => r.hash), ['a']);
  assert.deepEqual(toLocal.map((r) => r.hash), ['b']);
});

test('newest last_time wins and remote keeps the local id', () => {
  const { toLocal, toRemote } = mergeRevisionRecords(
    [rec('a', '2026-01-01T00:00:00Z', 7), rec('b', '2026-03-01T00:00:00Z', 8)],
    [rec('a', '2026-02-01T00:00:00Z', 99), rec('b', '2026-02-01T00:00:00Z', 99)],
  );
  assert.deepEqual(toLocal.map((r) => [r.hash, r.id]), [['a', 7]]);
  assert.deepEqual(toRemote.map((r) => r.hash), ['b']);
});

test('ties change nothing', () => {
  const { toLocal, toRemote } = mergeRevisionRecords([rec('a', '2026-01-01T00:00:00Z', 1)], [rec('a', '2026-01-01T00:00:00Z')]);
  assert.equal(toLocal.length + toRemote.length, 0);
});

test('duplicate local hashes are pushed once, keeping the newest', () => {
  const { toRemote } = mergeRevisionRecords(
    [rec('a', '2026-01-01T00:00:00Z', 1), rec('a', '2026-03-01T00:00:00Z', 2), rec('a', '2026-02-01T00:00:00Z', 3)],
    [],
  );
  assert.deepEqual(toRemote.map((r) => [r.hash, r.id]), [['a', 2]]);
});

test('duplicate local hashes older than remote pull one record with a local id', () => {
  const { toLocal, toRemote } = mergeRevisionRecords(
    [rec('a', '2026-01-01T00:00:00Z', 1), rec('a', '2026-01-02T00:00:00Z', 2)],
    [rec('a', '2026-02-01T00:00:00Z', 99)],
  );
  assert.equal(toRemote.length, 0);
  assert.deepEqual(toLocal.map((r) => [r.hash, r.id]), [['a', 2]]);
});

test('duplicate remote hashes are pulled once', () => {
  const { toLocal } = mergeRevisionRecords([], [rec('a', '2026-01-01T00:00:00Z'), rec('a', '2026-02-01T00:00:00Z')]);
  assert.equal(toLocal.length, 1);
  assert.equal(toLocal[0].last_time, '2026-02-01T00:00:00Z');
});

test('legacy split adopts this workspace\'s quizzes and drops leaked local copies of the others', () => {
  const withQuiz = (hash: string, quiz_title: string, id?: number): CompletedQuestionRecord => ({ ...rec(hash, '2026-01-01T00:00:00Z', id), quiz_title });
  const legacy = [withQuiz('es1', 'Spanish'), withQuiz('jp1', 'Japanese')];
  const local = [withQuiz('es1', 'Spanish', 1), withQuiz('jp1', 'Japanese', 2), withQuiz('own', 'Other', 3)];
  const { adopt, dropLocalIds } = splitLegacyRecords(local, legacy, new Set(['Spanish']));
  assert.deepEqual(adopt.map((r) => r.hash), ['es1']);
  assert.deepEqual(dropLocalIds, [2]); // only the leaked Japanese row; 'own' is not in legacy
});

test('legacy split does nothing without quiz titles', () => {
  assert.deepEqual(splitLegacyRecords([rec('a', '2026-01-01T00:00:00Z', 1)], [rec('a', '2026-01-01T00:00:00Z')], new Set()), { adopt: [], dropLocalIds: [] });
});

const tomb = (hash: string, deleted_at: string) => ({ hash, deleted_at });

test('a cloud removal deletes the stale local record and is remembered locally', () => {
  const r = mergeRevisionRecords([rec('a', '2026-01-01T00:00:00Z', 1)], [], { local: [], remote: [tomb('a', '2026-02-01T00:00:00Z')] });
  assert.deepEqual(r.deleteLocalHashes, ['a']);
  assert.deepEqual(r.tombstonesToLocal.map((t) => t.hash), ['a']);
  assert.equal(r.toRemote.length + r.toLocal.length, 0);
});

test('a local removal replaces the live cloud row and is not resurrected', () => {
  const r = mergeRevisionRecords([], [rec('a', '2026-01-01T00:00:00Z')], { local: [tomb('a', '2026-02-01T00:00:00Z')], remote: [] });
  assert.deepEqual(r.tombstonesToRemote.map((t) => t.hash), ['a']);
  assert.equal(r.toLocal.length, 0);
  assert.equal(r.toRemote.length, 0);
});

test('answering again after a removal revives the question', () => {
  const r = mergeRevisionRecords([rec('a', '2026-03-01T00:00:00Z', 1)], [], { local: [tomb('a', '2026-02-01T00:00:00Z')], remote: [] });
  assert.deepEqual(r.toRemote.map((x) => x.hash), ['a']);
  assert.deepEqual(r.clearLocalTombstones, ['a']);
  assert.equal(r.tombstonesToRemote.length, 0);
});

test('a record answered elsewhere after the removal comes back', () => {
  const r = mergeRevisionRecords([], [rec('a', '2026-03-01T00:00:00Z')], { local: [tomb('a', '2026-02-01T00:00:00Z')], remote: [] });
  assert.deepEqual(r.toLocal.map((x) => x.hash), ['a']);
  assert.deepEqual(r.clearLocalTombstones, ['a']);
});

const titled = (hash: string, quiz_title: string): CompletedQuestionRecord => ({ ...rec(hash, '2026-01-01T00:00:00Z', 1), quiz_title });

test('filterOwnRecords keeps only records of the workspace tests, so strays are not uploaded', () => {
  const stray = titled('jp-1', '第1週：1日目のテスト');
  const own = titled('es-1', 'Spanish Numbers 1-10');
  const kept = filterOwnRecords([stray, own], new Set(['Spanish Numbers 1-10']), []);
  assert.deepEqual(kept.map((r) => r.hash), ['es-1']);
});

test('filterOwnRecords keeps records already in the cloud copy so existing rows still update', () => {
  const existing = titled('old-1', 'Renamed quiz');
  const kept = filterOwnRecords([existing], new Set(['Other quiz']), [titled('old-1', 'Renamed quiz')]);
  assert.deepEqual(kept.map((r) => r.hash), ['old-1']);
});

test('filterOwnRecords uploads nothing new for a workspace without tests', () => {
  assert.deepEqual(filterOwnRecords([titled('jp-1', '第1週：1日目のテスト')], new Set(), []), []);
});

test('a stray local record in a Spanish workspace is not part of the upload after the merge', () => {
  const stray = titled('jp-1', '第1週：1日目のテスト');
  const merged = mergeRevisionRecords([stray], []);
  assert.equal(merged.toRemote.length, 1); // the merge alone would upload it...
  assert.equal(filterOwnRecords(merged.toRemote, new Set(['Spanish Numbers 1-10']), []).length, 0); // ...the guard stops it
});
