import assert from 'node:assert/strict';
import test from 'node:test';
import { indexedDB, IDBKeyRange } from 'fake-indexeddb';

(globalThis as typeof globalThis & { indexedDB: typeof indexedDB }).indexedDB = indexedDB;
(globalThis as typeof globalThis & { IDBKeyRange: typeof IDBKeyRange }).IDBKeyRange = IDBKeyRange;

const {
  DEFAULT_PROFICIENCY,
  buildIncorrectReviewQuestions,
  deriveWorkspaceStorageKey,
  getDowngradedProficiency,
  getNextProficiency,
  getNextRevisionTime,
  formatRevisionTimestamp,
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

test('formats revision backup filenames with a timestamp', () => {
  const date = new Date('2026-08-02T12:05:30.000Z');
  const expected = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}${String(date.getSeconds()).padStart(2, '0')}`;

  assert.equal(formatRevisionTimestamp(date), expected);
});

test('builds review items from incorrect answers only', () => {
  const questions = [
    { question_number: 1, question: 'Question 1', options: ['A', 'B'], correct_answer: 'A' },
    { question_number: 2, question: 'Question 2', options: ['A', 'B'], correct_answer: 'A' },
    { question_number: 3, question: 'Question 3', options: ['A', 'B'], correct_answer: 'A' },
  ];
  const answers = { 1: 'B', 2: 'A', 3: 'C' };
  const correctMap = { 1: false, 2: true, 3: false };

  const reviewItems = buildIncorrectReviewQuestions(questions, answers, correctMap);

  assert.equal(reviewItems.length, 2);
  assert.deepEqual(reviewItems.map((item) => item.question.question_number), [1, 3]);
  assert.deepEqual(reviewItems.map((item) => item.selectedAnswer), ['B', 'C']);
});

test('uses the submitted answer to identify incorrect questions when the correctness map is incomplete', () => {
  const questions = [
    { question_number: 1, question: 'Question 1', options: ['A', 'B'], correct_answer: 'A' },
    { question_number: 2, question: 'Question 2', options: ['A', 'B'], correct_answer: 'A' },
  ];
  const answers = { 1: 'B' };
  const correctMap = {};

  const reviewItems = buildIncorrectReviewQuestions(questions, answers, correctMap);

  assert.equal(reviewItems.length, 1);
  assert.equal(reviewItems[0].question.question_number, 1);
});

test('returns no review items when every answered question is correct', () => {
  const questions = [
    { question_number: 1, question: 'Question 1', options: ['A', 'B'], correct_answer: 'A' },
    { question_number: 2, question: 'Question 2', options: ['A', 'B'], correct_answer: 'A' },
  ];
  const answers = { 1: 'A', 2: 'A' };
  const correctMap = { 1: true, 2: true };

  const reviewItems = buildIncorrectReviewQuestions(questions, answers, correctMap);

  assert.equal(reviewItems.length, 0);
});

test('persists an explanation alongside revision results', async () => {
  setActiveWorkspaceStorageKey('persist-explanation-test');

  const record = await insertCompletedQuestion({
    question_name: 'Question 1',
    options: ['A', 'B'],
    correct_answer: 'A',
    last_time: new Date('2026-07-27T04:00:00.000Z').toISOString(),
    proficiency: DEFAULT_PROFICIENCY,
    quiz_title: 'Revision Quiz',
    selected_answer: 'B',
    correct: 0,
    explanation: 'Because A is the correct option.',
  });

  assert.equal(record.explanation, 'Because A is the correct option.');
});

test('persists audio_track_url alongside revision results', async () => {
  setActiveWorkspaceStorageKey('persist-audio-url-test');

  const record = await insertCompletedQuestion({
    question_name: 'Question 1',
    options: ['A', 'B'],
    correct_answer: 'A',
    last_time: new Date('2026-07-27T04:00:00.000Z').toISOString(),
    proficiency: DEFAULT_PROFICIENCY,
    quiz_title: 'Revision Quiz',
    selected_answer: 'A',
    correct: 1,
    audio_track_url: 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=Hola',
  });

  assert.equal(record.audio_track_url, 'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=es&q=Hola');
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
