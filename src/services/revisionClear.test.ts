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
