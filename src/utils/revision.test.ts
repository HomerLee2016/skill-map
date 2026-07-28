import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PROFICIENCY, getDowngradedProficiency, getNextProficiency, getNextRevisionTime, isQuestionDue, normalizeProficiency } from './revision';

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
