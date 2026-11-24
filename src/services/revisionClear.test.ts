import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

(globalThis as typeof globalThis & { indexedDB: typeof indexedDB }).indexedDB = indexedDB;
(globalThis as typeof globalThis & { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

const { RevisionDexieStore, clearLocalRevisionData, onRevisionRecordsChanged, onRevisionRecordsPulled } = await import('./revisionDb');

const record = (hash: string) => ({
  hash, last_time: '2026-01-01T00:00:00Z', question_name: hash, options: ['a'], correct_answer: 'a', quiz_title: 'Quiz',
}) as never;

test('clearing local revision data empties records and removal marks and reports how many records went', async () => {
  const store = new RevisionDexieStore('workspace-clear-test');
  await store.completed_questions.bulkAdd([record('a'), record('b'), record('c')]);
  await store.deleted_records.put({ hash: 'x', deleted_at: '2026-01-01T00:00:00Z' });

  assert.equal(await clearLocalRevisionData(store), 3);
  assert.equal(await store.completed_questions.count(), 0);
  assert.equal(await store.deleted_records.count(), 0);
  store.close();
});

test('clearing leaves no tombstone behind, so the cloud copy is not deleted by the next sync', async () => {
  const store = new RevisionDexieStore('workspace-clear-no-tombstone');
  await store.completed_questions.add(record('a'));
  await clearLocalRevisionData(store);
  assert.deepEqual(await store.deleted_records.toArray(), []);
  store.close();
});

test('clearing refreshes open pages but does not trigger a cloud sync', async () => {
  const store = new RevisionDexieStore('workspace-clear-notify');
  await store.completed_questions.add(record('a'));
  let pulled = 0;
  let changed = 0;
  const offPulled = onRevisionRecordsPulled(() => { pulled += 1; });
  const offChanged = onRevisionRecordsChanged(() => { changed += 1; });
  await clearLocalRevisionData(store);
  offPulled();
  offChanged();
  assert.equal(pulled, 1);
  assert.equal(changed, 0);
  store.close();
});

test('editing a question moves its record to the new text, keeps its stars and tombstones the old hash', async () => {
  const { createQuestionHash } = await import('./questionHash');
  const { findEditedQuestions } = await import('./questionProgress');
  const { applyTestEditToRevision } = await import('./revisionDb');
  const store = new RevisionDexieStore('workspace-edit-progress');
  const before = [
    { question_number: 1, question: 'Old?', options: ['a', 'b'], correct_answer: 'a' },
    { question_number: 2, question: 'Same?', options: ['x', 'y'], correct_answer: 'x' },
  ];
  const after = [
    { question_number: 1, question: 'New?', options: ['a', 'b'], correct_answer: 'b' },
    { question_number: 2, question: 'Same?', options: ['x', 'y'], correct_answer: 'x' },
  ];
  await store.completed_questions.bulkAdd([
    { ...(record('x') as object), hash: createQuestionHash('Old?', ['a', 'b']), question_name: 'Old?', options: ['a', 'b'], proficiency: 'star-3', quiz_title: 'Quiz' },
    { ...(record('y') as object), hash: createQuestionHash('Same?', ['x', 'y']), quiz_title: 'Quiz' },
  ] as never);
  const moves = findEditedQuestions(before, after);
  assert.equal(moves.length, 1);

  assert.equal(await applyTestEditToRevision({ oldTitle: 'Quiz', newTitle: 'Renamed quiz', moves }, store), 1);
  const rows = await store.completed_questions.toArray();
  const moved = rows.find((row) => row.question_name === 'New?');
  assert.equal(moved?.proficiency, 'star-3');
  assert.equal(moved?.correct_answer, 'b');
  assert.equal(moved?.hash, createQuestionHash('New?', ['a', 'b']));
  assert.deepEqual(rows.map((row) => row.quiz_title), ['Renamed quiz', 'Renamed quiz']);
  assert.deepEqual((await store.deleted_records.toArray()).map((row) => row.hash), [createQuestionHash('Old?', ['a', 'b'])]);
  store.close();
});

test('questions that are only added or removed are not treated as edits', async () => {
  const { findEditedQuestions } = await import('./questionProgress');
  const q = (text: string) => ({ question_number: 1, question: text, options: ['a', 'b'], correct_answer: 'a' });
  assert.deepEqual(findEditedQuestions([q('A'), q('B')], [q('A'), q('B'), q('C')]), []);
  assert.deepEqual(findEditedQuestions([q('A'), q('B')], [q('B'), q('A')]), []);
});
