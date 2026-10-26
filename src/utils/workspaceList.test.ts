import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveWorkspaceStorageKey } from '../services/revisionDb';
import { mergeWorkspaceLists } from './workspaceList';

test('a workspace imported on the PC shows up once on a phone with only cloud rows', () => {
  const list = mergeWorkspaceLists([], [{ key: 'workspace-aaaa', name: 'spanish' }]);
  assert.deepEqual(list, [{ key: 'workspace-aaaa', name: 'spanish', inCloud: true }]);
});

test('a local folder and its cloud copy are one entry', () => {
  const key = deriveWorkspaceStorageKey('japanese');
  const list = mergeWorkspaceLists([{ name: 'japanese', path: 'japanese', pendingCount: 3 }], [{ key, name: 'japanese' }, { key: 'workspace-other', name: 'x' }]);
  assert.equal(list.length, 2);
  assert.equal(list[0].inCloud, true);
  assert.deepEqual(list[0].local, { name: 'japanese', path: 'japanese' });
  assert.equal(list[0].pendingCount, 3);
});

test('the bundled demo workspace is not listed even though it has a cloud row', () => {
  assert.deepEqual(mergeWorkspaceLists([], [{ key: deriveWorkspaceStorageKey(null), name: 'Default workspace' }]), []);
});
