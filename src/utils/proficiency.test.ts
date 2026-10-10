import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_PROFICIENCY,
  formatProficiencyDisplay,
  getDowngradedProficiency,
  getNextProficiency,
  getNextRevisionTime,
  isQuestionDue,
  normalizeProficiency,
  shouldAdvanceRevision,
} from './proficiency';

const HOUR_MS = 60 * 60 * 1000;

test('normalizeProficiency falls back to the default for empty input', () => {
  assert.equal(normalizeProficiency(null), DEFAULT_PROFICIENCY);
  assert.equal(normalizeProficiency('  '), DEFAULT_PROFICIENCY);
  assert.equal(normalizeProficiency(' 3.2 '), '3.2');
});

test('getNextProficiency walks the master levels and stops at the top', () => {
  assert.equal(getNextProficiency('1.1'), '1.2');
  assert.equal(getNextProficiency('1.5'), '2.1');
  assert.equal(getNextProficiency('5.3'), '5.3');
  assert.equal(getNextProficiency('unknown'), '1.2');
});

test('getDowngradedProficiency drops to the start of the previous stage', () => {
  assert.equal(getDowngradedProficiency('3.4'), '2.1');
  assert.equal(getDowngradedProficiency('1.3'), DEFAULT_PROFICIENCY);
});

test('formatProficiencyDisplay shows one star per stage', () => {
  assert.equal(formatProficiencyDisplay('3.1'), '⭐⭐⭐ 3.1');
  assert.equal(formatProficiencyDisplay(null), '⭐ 1.1');
});

test('getNextRevisionTime adds the stage interval to the last review time', () => {
  // Mid-January has no DST change in common timezones, so local-hour math stays exact.
  const last = '2026-01-15T10:00:00.000Z';
  const stage1 = new Date(getNextRevisionTime(last, '1.2')).getTime();
  const stage5 = new Date(getNextRevisionTime(last, '5.1')).getTime();
  const base = new Date(last).getTime();
  assert.equal(stage1 - base, 8 * HOUR_MS);
  assert.equal(stage5 - base, 168 * HOUR_MS);
});

test('isQuestionDue compares the next review time with now', () => {
  const last = '2026-01-15T10:00:00.000Z';
  assert.equal(isQuestionDue(last, '1.1', new Date('2026-01-15T17:00:00.000Z')), false);
  assert.equal(isQuestionDue(last, '1.1', new Date('2026-01-15T19:00:00.000Z')), true);
});

test('shouldAdvanceRevision only advances once the existing review is due', () => {
  assert.equal(shouldAdvanceRevision(null, '2026-01-15T10:00:00.000Z'), true);
  assert.equal(shouldAdvanceRevision('2026-01-16T10:00:00.000Z', '2026-01-15T10:00:00.000Z'), false);
  assert.equal(shouldAdvanceRevision('2026-01-15T10:00:00.000Z', '2026-01-16T10:00:00.000Z'), true);
});
