import test from 'node:test';
import assert from 'node:assert/strict';
import { isSyncConflict, summarizeSide, type SideSummary } from './syncConflict';
import type { CompletedQuestionRecord } from './revisionDb';

const side = (overrides: Partial<SideSummary> = {}): SideSummary => ({
  lessons: 0, tests: 0, roadmaps: 0, questions: 0, stars: 0, ...overrides,
});

test('no conflict when either side is empty', () => {
  assert.equal(isSyncConflict(side(), side({ questions: 5, stars: 9 })), false);
  assert.equal(isSyncConflict(side({ questions: 5 }), side()), false);
});

test('no conflict when both sides match', () => {
  assert.equal(isSyncConflict(side({ questions: 5, stars: 9 }), side({ questions: 5, stars: 9 })), false);
});

test('conflict when both hold data and counts or stars differ', () => {
  assert.equal(isSyncConflict(side({ questions: 5, stars: 9 }), side({ questions: 5, stars: 10 })), true);
  assert.equal(isSyncConflict(side({ lessons: 2 }), side({ questions: 1 })), true);
});

test('summarizeSide counts questions and sums star levels', () => {
  const records = [{ proficiency: '3' }, { proficiency: '2' }, { proficiency: null }] as unknown as CompletedQuestionRecord[];
  assert.deepEqual(summarizeSide(null, records), side({ questions: 3, stars: 5 }));
});
