import type { PersistedWorkspaceHistoryEntry } from '../utils/workspacePersistence';

interface PersistedWorkspaceHandleRecord {
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

export async function readPersistedWorkspaceHandleForSelection(selection: PersistedWorkspaceHistoryEntry): Promise<FileSystemDirectoryHandle | null> {
  try {
    const record = await readRecord('Failed to read persisted workspace handle history');
    const matchingHistoryEntry = record?.history.find((entry) => entry.path === selection.path || entry.name === selection.name);
    return matchingHistoryEntry?.handle ?? record?.currentHandle ?? null;
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
