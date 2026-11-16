import test from 'node:test';
import assert from 'node:assert/strict';
import { formatPublishedAt, myPublished, unpublishedOptions } from './publishedList';
import type { SharedWorkspaceSummary } from './sharedWorkspaces';

function item(id: string, ownerId: string, key: string, publishedAt: string): SharedWorkspaceSummary {
  return { id, ownerId, sourceWorkspaceKey: key, name: 'Spanish', description: '', ownerLabel: 'Ann', tags: [], lessonCount: 1, testCount: 0, roadmapCount: 0, publishedAt, updatedAt: publishedAt };
}

test('myPublished keeps only my snapshots, newest first, and tells same-named ones apart by date', () => {
  const list = [
    item('a', 'me', 'k1', '2026-11-01T10:00:00Z'),
    item('b', 'other', 'k9', '2026-11-05T10:00:00Z'),
    item('c', 'me', 'k2', '2026-11-10T10:00:00Z'),
  ];
  assert.deepEqual(myPublished(list, 'me').map((entry) => entry.id), ['c', 'a']);
  assert.deepEqual(myPublished(list, undefined), []);
  assert.deepEqual(list.map((entry) => entry.id), ['a', 'b', 'c'], 'input is not reordered');
});

test('unpublishedOptions drops workspaces that already have a snapshot', () => {
  const options = [{ key: 'k1', name: 'Spanish' }, { key: 'k2', name: 'Spanish' }, { key: 'k3', name: 'Japanese' }];
  const mine = [item('a', 'me', 'k1', '2026-11-01T10:00:00Z')];
  assert.deepEqual(unpublishedOptions(options, mine).map((option) => option.key), ['k2', 'k3']);
  assert.equal(unpublishedOptions(options, []).length, 3);
});

test('formatPublishedAt is empty for garbage and includes the year otherwise', () => {
  assert.equal(formatPublishedAt('nope'), '');
  assert.match(formatPublishedAt('2026-11-16T13:47:00Z'), /2026/);
});
