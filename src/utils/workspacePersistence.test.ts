import test from 'node:test';
import assert from 'node:assert/strict';
import { readPersistedWorkspaceSelection, writePersistedWorkspaceSelection } from './workspacePersistence';

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
