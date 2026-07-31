import test from 'node:test';
import assert from 'node:assert/strict';
import { getFirstUnansweredQuestionIndex, getQuestionTrackerStatus } from './QuestionTracker';

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
