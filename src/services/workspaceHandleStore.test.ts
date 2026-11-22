import test from 'node:test';
import assert from 'node:assert/strict';
import { findHandleForSelection, type PersistedWorkspaceHandleRecord } from './workspaceHandleStore';

const handle = (name: string) => ({ name }) as unknown as FileSystemDirectoryHandle;

function record(current: string, kept: string[]): PersistedWorkspaceHandleRecord {
  return { id: 'workspace', currentHandle: handle(current), history: kept.map((name) => ({ name, path: name, handle: handle(name) })) };
}

test('each workspace gets its own stored folder handle', () => {
  const r = record('japanese', ['japanese', 'spanish']);
  assert.equal(findHandleForSelection(r, { name: 'spanish', path: 'spanish' })?.name, 'spanish');
  assert.equal(findHandleForSelection(r, { name: 'japanese', path: 'japanese' })?.name, 'japanese');
});

test('a workspace with no stored handle does not fall back to the folder that is open', () => {
  const r = record('japanese', ['japanese']);
  assert.equal(findHandleForSelection(r, { name: 'spanish', path: 'spanish' }), null);
});

test('the current handle is used when it is that workspace (history written before handles were kept per folder)', () => {
  const r: PersistedWorkspaceHandleRecord = { id: 'workspace', currentHandle: handle('Spanish'), history: [] };
  assert.equal(findHandleForSelection(r, { name: 'spanish', path: 'spanish' })?.name, 'Spanish');
  assert.equal(findHandleForSelection(null, { name: 'spanish', path: 'spanish' }), null);
});
