import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateCompleteness, getRoadmapLabel } from './roadmapYaml';

test('calculateCompleteness handles flat list, tree and invalid yaml', () => {
  assert.equal(calculateCompleteness('- id: a\n  finished: true\n- id: b\n  finished: false'), 50);
  assert.equal(calculateCompleteness('id: a\nfinished: true\nchildren:\n  - id: b\n    finished: false'), 50);
  assert.equal(calculateCompleteness(''), 0);
  assert.equal(calculateCompleteness('a: [unclosed'), 0);
});

test('getRoadmapLabel prefers the root node label', () => {
  const yaml = '- id: b\n  label: Child\n  dependsOn: [a]\n- id: a\n  label: Root';
  assert.equal(getRoadmapLabel(yaml, 'Old'), 'Root');
  assert.equal(getRoadmapLabel('label: Single', 'Old'), 'Single');
  assert.equal(getRoadmapLabel('a: [unclosed', 'Old'), 'Old');
});
