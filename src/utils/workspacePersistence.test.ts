import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readPersistedWorkspaceSelection,
  upsertWorkspaceHistoryEntry,
  writePersistedWorkspaceSelection,
} from './workspacePersistence';

test('persists and restores workspace selection metadata', () => {
  const storage = new MapStorage();

  writePersistedWorkspaceSelection({
    name: 'my-workspace',
    path: '/Users/demo/my-workspace',
  }, storage as unknown as Storage);

  assert.deepEqual(readPersistedWorkspaceSelection(storage as unknown as Storage), {
    name: 'my-workspace',
    path: '/Users/demo/my-workspace',
  });
});

test('upserts workspace history entries to the front and trims older entries', () => {
  const history = [
    { name: 'Alpha', path: 'alpha' },
    { name: 'Beta', path: 'beta' },
    { name: 'Gamma', path: 'gamma' },
  ];

  const next = upsertWorkspaceHistoryEntry(history, { name: 'Delta', path: 'delta' }, 3);

  assert.deepEqual(next.map((entry) => entry.path), ['delta', 'alpha', 'beta']);
});

test('moves an existing workspace entry to the front without duplicating it', () => {
  const history = [
    { name: 'Alpha', path: 'alpha' },
    { name: 'Beta', path: 'beta' },
  ];

  const next = upsertWorkspaceHistoryEntry(history, { name: 'Alpha', path: 'alpha' }, 5);

  assert.deepEqual(next.map((entry) => entry.path), ['alpha', 'beta']);
});

class MapStorage implements Storage {
  private store = new Map<string, string>();

  get length() {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}
