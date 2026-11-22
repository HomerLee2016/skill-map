import type { PersistedWorkspaceHistoryEntry } from '../utils/workspacePersistence';

export interface PersistedWorkspaceHandleRecord {
  id: string;
  currentHandle?: FileSystemDirectoryHandle;
  history: Array<PersistedWorkspaceHistoryEntry & { handle?: FileSystemDirectoryHandle }>;
}

const WORKSPACE_HANDLE_DB_NAME = 'skill-map-workspace-db';
const WORKSPACE_HANDLE_STORE_NAME = 'workspace-handle';
const WORKSPACE_HANDLE_ID = 'workspace';
const MAX_HANDLE_HISTORY = 6;

function openWorkspaceHandleDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available in this environment.'));
      return;
    }

    const request = indexedDB.open(WORKSPACE_HANDLE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(WORKSPACE_HANDLE_STORE_NAME)) {
        db.createObjectStore(WORKSPACE_HANDLE_STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open workspace handle database'));
  });
}

function getRecord(store: IDBObjectStore, errorMessage: string): Promise<PersistedWorkspaceHandleRecord | null> {
  return new Promise((resolve, reject) => {
    const request = store.get(WORKSPACE_HANDLE_ID);
    request.onsuccess = () => resolve((request.result as PersistedWorkspaceHandleRecord | null) ?? null);
    request.onerror = () => reject(request.error ?? new Error(errorMessage));
  });
}

async function readRecord(errorMessage: string): Promise<PersistedWorkspaceHandleRecord | null> {
  const db = await openWorkspaceHandleDatabase();
  const store = db.transaction(WORKSPACE_HANDLE_STORE_NAME, 'readonly').objectStore(WORKSPACE_HANDLE_STORE_NAME);
  const record = await getRecord(store, errorMessage);
  db.close();
  return record;
}

export async function readPersistedWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const record = await readRecord('Failed to read persisted workspace handle');
    return record?.currentHandle ?? null;
  } catch {
    return null;
  }
}

/**
 * The stored folder handle for a workspace, or null when this device never kept one.
 * A handle is only returned for the folder that was asked for: falling back to "the current folder" made
 * clicking another workspace silently reload the one already open.
 */
export function findHandleForSelection(
  record: PersistedWorkspaceHandleRecord | null,
  selection: PersistedWorkspaceHistoryEntry,
): FileSystemDirectoryHandle | null {
  if (!record) return null;
  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const matching = record.history.find((entry) => entry.handle && (same(entry.path, selection.path) || same(entry.name, selection.name)));
  if (matching?.handle) return matching.handle;
  const current = record.currentHandle;
  return current && (same(current.name, selection.path) || same(current.name, selection.name)) ? current : null;
}

export async function readPersistedWorkspaceHandleForSelection(selection: PersistedWorkspaceHistoryEntry): Promise<FileSystemDirectoryHandle | null> {
  try {
    return findHandleForSelection(await readRecord('Failed to read persisted workspace handle history'), selection);
  } catch {
    return null;
  }
}

export async function persistWorkspaceHandle(handle: FileSystemDirectoryHandle, selection?: PersistedWorkspaceHistoryEntry): Promise<void> {
  try {
    const db = await openWorkspaceHandleDatabase();
    const store = db.transaction(WORKSPACE_HANDLE_STORE_NAME, 'readwrite').objectStore(WORKSPACE_HANDLE_STORE_NAME);
    const existingRecord = await getRecord(store, 'Failed to read persisted workspace handle record');

    const history = existingRecord?.history ?? [];
    const nextHistory = selection
      ? [
          { ...selection, handle },
          ...history.filter((entry) => entry.path !== selection.path || entry.name !== selection.name),
        ].slice(0, MAX_HANDLE_HISTORY)
      : history;

    await new Promise<void>((resolve, reject) => {
      const request = store.put({ id: WORKSPACE_HANDLE_ID, currentHandle: handle, history: nextHistory });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error('Failed to persist workspace handle'));
    });

    db.close();
  } catch {
    // Best-effort persistence; the visible path is still preserved in localStorage.
  }
}
