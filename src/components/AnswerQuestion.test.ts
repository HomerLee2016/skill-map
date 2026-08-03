import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoAdvanceOnCorrect, shouldShowAutoAdvanceToggle, shouldShowNextButton } from './AnswerQuestion';

test('auto-advance is disabled for correct answers when the toggle is off', () => {
  assert.equal(shouldAutoAdvanceOnCorrect({ hasAnswered: true, isCorrectAnswer: true, autoAdvanceOnCorrect: false }), false);
  assert.equal(shouldShowNextButton({ hasAnswered: true, isCorrectAnswer: true, autoAdvanceOnCorrect: false, showNextButton: true }), true);
});

test('auto-advance stays enabled for correct answers when the toggle is on', () => {
  assert.equal(shouldAutoAdvanceOnCorrect({ hasAnswered: true, isCorrectAnswer: true, autoAdvanceOnCorrect: true }), true);
  assert.equal(shouldShowNextButton({ hasAnswered: true, isCorrectAnswer: true, autoAdvanceOnCorrect: true }), false);
});

test('hides the auto-advance toggle when review mode disables it', () => {
  assert.equal(shouldShowAutoAdvanceToggle(true), true);
  assert.equal(shouldShowAutoAdvanceToggle(false), false);
  assert.equal(shouldShowAutoAdvanceToggle(undefined), true);
});
