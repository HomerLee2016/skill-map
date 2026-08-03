import assert from 'node:assert/strict';
import test from 'node:test';
import { countCorrectAnswers } from './testScoring';

test('counts correct answers from the correctness map', () => {
  const correctMap = { 1: true, 2: false, 3: true, 4: true };

  assert.equal(countCorrectAnswers(correctMap), 3);
});
