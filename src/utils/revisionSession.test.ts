import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRevisionQuestions,
  calcTotalStars,
  countStarLevels,
  getNextRevisionIso,
  upsertCompletedRow,
} from './revisionSession';

test('calcTotalStars sums integer part of proficiency and ignores invalid', () => {
  assert.equal(calcTotalStars([{ proficiency: '2.1' }, { proficiency: '3.4' }, { proficiency: 'x' }]), 5);
});

test('countStarLevels buckets levels 1-5', () => {
  const counts = countStarLevels([{ proficiency: '1.1' }, { proficiency: '1.2' }, { proficiency: '5.1' }, { proficiency: '9' }]);
  assert.deepEqual(counts, { 1: 2, 2: 0, 3: 0, 4: 0, 5: 1 });
});

test('getNextRevisionIso returns earliest time or null', () => {
  assert.equal(getNextRevisionIso([]), null);
  assert.equal(getNextRevisionIso([{ next_revision_time: '2026-02-01' }, { next_revision_time: '2026-01-01' }, {}]), '2026-01-01');
});

test('buildRevisionQuestions numbers rows from 1', () => {
  const [q] = buildRevisionQuestions([{ id: 7, question_name: 'Q', options: ['a'], correct_answer: 'a', proficiency: '1.1' }]);
  assert.equal(q.record_id, 7);
  assert.equal(q.question_number, 1);
  assert.equal(q.question, 'Q');
});

test('upsertCompletedRow merges existing and prepends new', () => {
  assert.deepEqual(upsertCompletedRow([{ id: 1, a: 1 }], { id: 1, b: 2 }), [{ id: 1, a: 1, b: 2 }]);
  assert.deepEqual(upsertCompletedRow([{ id: 1 }], { id: 2 }), [{ id: 2 }, { id: 1 }]);
});
