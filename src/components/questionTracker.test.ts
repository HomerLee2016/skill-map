import test from 'node:test';
import assert from 'node:assert/strict';
import { getFirstUnansweredQuestionIndex, getQuestionTrackerStatus, getVisibleQuestionTrackerItems } from './QuestionTracker';

test('marks answered questions as correct or incorrect and finds first unanswered question', () => {
  const answers = { 1: 'A', 3: 'B' };
  const correctMap = { 1: true, 3: false };

  assert.equal(getQuestionTrackerStatus(1, answers, correctMap), 'correct');
  assert.equal(getQuestionTrackerStatus(2, answers, correctMap), 'unanswered');
  assert.equal(getQuestionTrackerStatus(3, answers, correctMap), 'incorrect');
  assert.equal(getFirstUnansweredQuestionIndex(4, answers), 1);
});

test('returns -1 when all questions are answered', () => {
  const answers = { 1: 'A', 2: 'B', 3: 'C' };
  assert.equal(getFirstUnansweredQuestionIndex(3, answers), -1);
});

test('grows progressively until the tracker reaches 15 boxes', () => {
  const items = getVisibleQuestionTrackerItems({ totalQuestions: 15, currentIndex: 14, limit: 15, questionNumbers: undefined, slidingWindow: true });
  assert.equal(items.length, 15);
  assert.deepEqual(items.map((item) => item.label), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  assert.equal(items[14].isCurrent, true);
});

test('keeps only the latest 15 questions once the tracker exceeds 15', () => {
  const items = getVisibleQuestionTrackerItems({ totalQuestions: 16, currentIndex: 15, limit: 15, questionNumbers: undefined, slidingWindow: true });
  assert.equal(items.length, 15);
  assert.deepEqual(items.map((item) => item.label), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
  assert.equal(items[14].isCurrent, true);
});
