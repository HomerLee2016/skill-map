import test from 'node:test';
import assert from 'node:assert/strict';
import { newWorkspaceKey } from './sharedWorkspaces';
import { deriveWorkspaceStorageKey } from './workspaceKey';

test('new workspace keys cannot collide with folder-derived keys and fit the 100 char column', () => {
  const key = newWorkspaceKey('shared', () => '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(key, 'shared-123e4567e89b12d3');
  assert.notEqual(key, deriveWorkspaceStorageKey('shared-123e4567e89b12d3'));
  assert.ok(key.length <= 100);
  assert.ok(newWorkspaceKey('merged').startsWith('merged-'));
});
