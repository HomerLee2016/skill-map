import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

(globalThis as typeof globalThis & { indexedDB: typeof indexedDB }).indexedDB = indexedDB;
(globalThis as typeof globalThis & { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

const {
  DEFAULT_PROFICIENCY,
  deriveWorkspaceStorageKey,
  getDowngradedProficiency,
  getNextProficiency,
  getNextRevisionTime,
  insertCompletedQuestion,
  isQuestionDue,
  normalizeProficiency,
  setActiveWorkspaceStorageKey,
  shouldAdvanceRevision,
} = await import('./revision');

test('advances proficiency correctly for correct answers and caps at the top', () => {
  assert.equal(getNextProficiency('1.5'), '2.1');
  assert.equal(getNextProficiency('5.3'), '5.3');
  assert.equal(getDowngradedProficiency('2.1'), '1.1');
  assert.equal(getDowngradedProficiency('1.1'), '1.1');
});

test('normalizes missing proficiency values to the default level', () => {
  assert.equal(normalizeProficiency(null), DEFAULT_PROFICIENCY);
  assert.equal(normalizeProficiency('   '), DEFAULT_PROFICIENCY);
});

test('computes due dates from the current major stage interval', () => {
  const now = new Date('2026-07-27T12:00:00.000Z');
  const initialLastTime = new Date('2026-07-27T04:00:00.000Z').toISOString();
  const nextRevisionTime = getNextRevisionTime(initialLastTime, DEFAULT_PROFICIENCY);

  assert.equal(nextRevisionTime, new Date('2026-07-27T12:00:00.000Z').toISOString());
  assert.equal(isQuestionDue(initialLastTime, DEFAULT_PROFICIENCY, now), true);
  assert.equal(isQuestionDue(initialLastTime, '2.1', now), false);
});

test('does not advance revision state before the existing next revision window has passed', () => {
  const existingNextRevisionTime = new Date('2026-07-27T20:00:00.000Z').toISOString();
  const retakeAt = new Date('2026-07-27T12:00:00.000Z').toISOString();

  assert.equal(shouldAdvanceRevision(existingNextRevisionTime, retakeAt), false);
  assert.equal(shouldAdvanceRevision(null, retakeAt), true);
  assert.equal(shouldAdvanceRevision(existingNextRevisionTime, existingNextRevisionTime), true);
});

test('derives deterministic storage keys for different workspace paths', () => {
  const first = deriveWorkspaceStorageKey('C:/Users/demo/workspaces/spanish');
  const second = deriveWorkspaceStorageKey('C:/Users/demo/workspaces/spanish');
  const third = deriveWorkspaceStorageKey('C:/Users/demo/workspaces/french');

  assert.equal(first, second);
  assert.notEqual(first, third);
  assert.match(first, /^workspace-/);
});

test('preserves the original quiz title when updating an existing revision entry', async () => {
  setActiveWorkspaceStorageKey('preserve-quiz-title-test');

  const initial = await insertCompletedQuestion({
    question_name: 'Question 1',
    options: ['A', 'B'],
    correct_answer: 'A',
    last_time: new Date('2026-07-27T04:00:00.000Z').toISOString(),
    proficiency: DEFAULT_PROFICIENCY,
    quiz_title: 'Original Quiz',
    selected_answer: 'A',
    correct: 1,
  });

  const updated = await insertCompletedQuestion({
    question_name: 'Question 1',
    options: ['A', 'B'],
    correct_answer: 'A',
    last_time: new Date('2026-07-27T12:00:00.000Z').toISOString(),
    proficiency: DEFAULT_PROFICIENCY,
    quiz_title: 'Revision',
    selected_answer: 'A',
    correct: 1,
    question_id: initial.id,
  });

  assert.equal(updated.quiz_title, 'Original Quiz');
});
