import test from 'node:test';
import assert from 'node:assert/strict';
import { applyPlanToBase, describeRef, hashContent, planContentSync, stableStringify } from './contentSync';
import type { WorkspaceContent } from './workspaceTypes';

const plan = (input: Partial<Parameters<typeof planContentSync>[0]>) =>
  planContentSync({ local: {}, cloud: {}, tombstoned: new Set(), base: {}, ...input });

test('only the side that changed is copied', () => {
  const result = plan({
    local: { 'lessons:a': 'L2', 'lessons:b': 'B', 'lessons:c': 'C' },
    cloud: { 'lessons:a': 'A', 'lessons:b': 'B2', 'lessons:c': 'C' },
    base: { 'lessons:a': 'A', 'lessons:b': 'B', 'lessons:c': 'C' },
  });
  assert.deepEqual(result.push, ['lessons:a']);
  assert.deepEqual(result.pull, ['lessons:b']);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.base['lessons:c'], 'C');
});

test('a phone edit is not overwritten by the PC folder (the old blind-upsert bug)', () => {
  const result = plan({ local: { 'lessons:a': 'old' }, cloud: { 'lessons:a': 'phone edit' }, base: { 'lessons:a': 'old' } });
  assert.deepEqual(result.pull, ['lessons:a']);
  assert.deepEqual(result.push, []);
});

test('both sides changed: nothing is overwritten and the base is kept', () => {
  const result = plan({ local: { 'tests:t': 'mine' }, cloud: { 'tests:t': 'theirs' }, base: { 'tests:t': 'orig' } });
  assert.deepEqual(result.conflicts, ['tests:t']);
  assert.deepEqual([result.push, result.pull], [[], []]);
  assert.equal(result.base['tests:t'], 'orig');
});

test('new items go to the side that lacks them', () => {
  const result = plan({ local: { 'lessons:new-local': 'x' }, cloud: { 'lessons:new-cloud': 'y' } });
  assert.deepEqual(result.push, ['lessons:new-local']);
  assert.deepEqual(result.pull, ['lessons:new-cloud']);
});

test('an item missing from the folder is never deleted from the cloud', () => {
  const result = plan({ local: {}, cloud: { 'lessons:a': 'A' }, base: { 'lessons:a': 'A' } });
  assert.deepEqual(result.pull, ['lessons:a']);
});

test('a tombstoned item is deleted here only when unchanged here', () => {
  const tombstoned = new Set(['lessons:a', 'lessons:b']);
  const result = plan({ local: { 'lessons:a': 'A', 'lessons:b': 'B edited' }, tombstoned, base: { 'lessons:a': 'A', 'lessons:b': 'B' } });
  assert.deepEqual(result.deleteLocal, ['lessons:a']);
  assert.deepEqual(result.conflicts, ['lessons:b']);
  assert.deepEqual(result.push, [], 'a deleted lesson is never uploaded again');
});

test('first sync with this version (no base): this device wins as before, then the base is recorded', () => {
  const result = plan({ local: { 'lessons:a': 'edited' }, cloud: { 'lessons:a': 'old' }, base: null });
  assert.deepEqual(result.push, ['lessons:a']);
  assert.deepEqual(applyPlanToBase(result, { 'lessons:a': 'edited' }), { 'lessons:a': 'edited' });
});

test('with a base, an item that differs but has no base entry is a conflict, not a silent overwrite', () => {
  assert.deepEqual(plan({ local: { 'lessons:a': 'x' }, cloud: { 'lessons:a': 'y' }, base: {} }).conflicts, ['lessons:a']);
});

test('hashes ignore key order, empty optional fields and YAML formatting', () => {
  const content = (questionKeys: 'a' | 'b'): WorkspaceContent => ({
    lessons: [{ id: 'l', title: 'L', content: '# L' }],
    tests: [{ id: 't', title: 'T', questions: [
      questionKeys === 'a'
        ? { question_number: 1, question: 'q', options: ['a', 'b'], correct_answer: 'a', explanation: '' }
        : { correct_answer: 'a', options: ['a', 'b'], question: 'q', question_number: 9 },
    ] }],
    roadmaps: [{ id: 'r', name: 'R', yaml: questionKeys === 'a' ? '- {id: a, label: A}\n' : '- id: a\n  label: A\n' }],
    lessonStructure: { folders: [], items: [] },
    testsStructure: { revision: {}, new_tests: { items: [] } },
  });
  assert.deepEqual(hashContent(content('a')), hashContent(content('b')));
  assert.equal(stableStringify({ b: 1, a: [2, { d: 1, c: undefined }] }), '{"a":[2,{"d":1}],"b":1}');
  assert.equal(describeRef('structure:lessons'), 'lessons folders');
  assert.equal(describeRef('tests:t1'), 'test "t1"');
});

test('a roadmap deleted on another device is dropped here when unchanged here', () => {
  const result = plan({ local: { 'roadmaps:r': 'R' }, tombstoned: new Set(['roadmaps:r']), base: { 'roadmaps:r': 'R' } });
  assert.deepEqual(result.deleteLocal, ['roadmaps:r']);
});
