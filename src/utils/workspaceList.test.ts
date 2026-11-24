import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveWorkspaceStorageKey } from '../services/workspaceKey';
import { localFolderTitle, mergeWorkspaceLists } from './workspaceList';

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

test('the local-folder hover shows a kept full path as it is', () => {
  const path = ['C:', 'dev', 'temp', 'test_workspace', 'spanish'].join('\\');
  assert.equal(localFolderTitle({ name: 'spanish', path }), `Linked to local folder: ${path}`);
});

test('the local-folder hover explains that a bare folder name is all the browser shares', () => {
  const title = localFolderTitle({ name: 'spanish', path: 'spanish' });
  assert.match(title, /^Linked to local folder: spanish /);
  assert.match(title, /only the folder name/);
});

test('only entries with a stored folder carry the local marker data', () => {
  const list = mergeWorkspaceLists(
    [{ name: 'japanese', path: 'japanese' }],
    [{ key: deriveWorkspaceStorageKey('japanese'), name: 'japanese' }, { key: 'workspace-cloudonly', name: 'spanish' }],
  );
  assert.deepEqual(list.map((entry) => [entry.name, Boolean(entry.local), entry.inCloud]), [['japanese', true, true], ['spanish', false, true]]);
});

test('cloud-only workspaces get the same due-revision badge as folder ones, by key', () => {
  const list = mergeWorkspaceLists(
    [{ name: 'japanese', path: 'japanese', pendingCount: 1 }],
    [{ key: 'workspace-cloudonly', name: 'spanish' }, { key: 'shared-abc', name: 'shared' }],
    { 'workspace-cloudonly': 59, [deriveWorkspaceStorageKey('japanese')]: 83 },
  );
  assert.deepEqual(list.map((entry) => [entry.name, entry.pendingCount]), [['japanese', 83], ['spanish', 59], ['shared', undefined]]);
});
