import assert from 'node:assert/strict';
import test from 'node:test';
import { formatLastSync } from './syncStatus';

const at = 1_000_000;

test('formatLastSync shows just now under a minute', () => {
  assert.equal(formatLastSync({ at, trigger: 'manual' }, at + 30_000), 'sync just now (after manual)');
  assert.equal(formatLastSync({ at, trigger: 'manual' }, at - 5_000), 'sync just now (after manual)');
});

test('formatLastSync pluralises minutes', () => {
  assert.equal(formatLastSync({ at, trigger: 'revision' }, at + 60_000), 'sync 1 min ago (after revision)');
  assert.equal(formatLastSync({ at, trigger: 'manual' }, at + 3 * 60_000 + 5_000), 'sync 3 mins ago (after manual)');
});

test('formatLastSync switches to hours and days', () => {
  assert.equal(formatLastSync({ at, trigger: 'workspace' }, at + 2 * 3_600_000), 'sync 2 hrs ago (after workspace)');
  assert.equal(formatLastSync({ at, trigger: 'workspace' }, at + 86_400_000), 'sync 1 day ago (after workspace)');
});
