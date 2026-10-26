import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeRevisionRecords } from './revisionSyncMerge';
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
