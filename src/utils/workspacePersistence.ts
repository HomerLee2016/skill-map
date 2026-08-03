export interface PersistedWorkspaceSelection {
  name: string;
  path: string;
}

export interface PersistedWorkspaceHistoryEntry {
  name: string;
  path: string;
}

interface PersistedWorkspaceHandleRecord {
  id: string;
  currentHandle?: FileSystemDirectoryHandle;
  history: Array<PersistedWorkspaceHistoryEntry & { handle?: FileSystemDirectoryHandle }>;
}

const WORKSPACE_SELECTION_STORAGE_KEY = 'skill-map.workspace-selection';
const WORKSPACE_HISTORY_STORAGE_KEY = 'skill-map.workspace-history';
const WORKSPACE_HANDLE_DB_NAME = 'skill-map-workspace-db';
const WORKSPACE_HANDLE_STORE_NAME = 'workspace-handle';
const WORKSPACE_HANDLE_ID = 'workspace';

function resolveStorage(storage?: Storage | null): Storage | null {
  if (storage) {
    return storage;
  }

  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage;
}

export function readPersistedWorkspaceSelection(storage?: Storage | null): PersistedWorkspaceSelection | null {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return null;
  }

  const rawValue = resolvedStorage.getItem(WORKSPACE_SELECTION_STORAGE_KEY);
  if (!rawValue) {
    return null;
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedWorkspaceSelection>;
    if (parsed && typeof parsed.name === 'string' && typeof parsed.path === 'string') {
      return { name: parsed.name, path: parsed.path };
    }
  } catch {
    // Ignore invalid persisted entries and fall back to null.
  }

  return null;
}

export function writePersistedWorkspaceSelection(selection: PersistedWorkspaceSelection, storage?: Storage | null): void {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return;
  }

  resolvedStorage.setItem(WORKSPACE_SELECTION_STORAGE_KEY, JSON.stringify(selection));
}

export function clearPersistedWorkspaceSelection(storage?: Storage | null): void {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return;
  }

  resolvedStorage.removeItem(WORKSPACE_SELECTION_STORAGE_KEY);
}

export function readPersistedWorkspaceHistory(storage?: Storage | null): PersistedWorkspaceHistoryEntry[] {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return [];
  }

  const rawValue = resolvedStorage.getItem(WORKSPACE_HISTORY_STORAGE_KEY);
  if (!rawValue) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<PersistedWorkspaceHistoryEntry>[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry): entry is PersistedWorkspaceHistoryEntry => Boolean(entry && typeof entry.name === 'string' && typeof entry.path === 'string'));
  } catch {
    return [];
  }
}

export function writePersistedWorkspaceHistory(history: PersistedWorkspaceHistoryEntry[], storage?: Storage | null): void {
  const resolvedStorage = resolveStorage(storage);
  if (!resolvedStorage) {
    return;
  }

  resolvedStorage.setItem(WORKSPACE_HISTORY_STORAGE_KEY, JSON.stringify(history));
}

export function upsertWorkspaceHistoryEntry(
  history: PersistedWorkspaceHistoryEntry[],
  nextEntry: PersistedWorkspaceHistoryEntry,
  limit = 6
): PersistedWorkspaceHistoryEntry[] {
  const withoutCurrent = history.filter((entry) => entry.path !== nextEntry.path || entry.name !== nextEntry.name);
  const updated = [nextEntry, ...withoutCurrent].slice(0, limit);
  return updated;
}

export function removeWorkspaceHistoryEntry(
  history: PersistedWorkspaceHistoryEntry[],
  target: PersistedWorkspaceHistoryEntry
): PersistedWorkspaceHistoryEntry[] {
  return history.filter((entry) => entry.path !== target.path || entry.name !== target.name);
}

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

export async function readPersistedWorkspaceHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openWorkspaceHandleDatabase();
    const transaction = db.transaction(WORKSPACE_HANDLE_STORE_NAME, 'readonly');
    const store = transaction.objectStore(WORKSPACE_HANDLE_STORE_NAME);

    const result = await new Promise<PersistedWorkspaceHandleRecord | null>((resolve, reject) => {
      const request = store.get(WORKSPACE_HANDLE_ID);
      request.onsuccess = () => resolve((request.result as PersistedWorkspaceHandleRecord | null) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Failed to read persisted workspace handle'));
    });

    db.close();
    return result?.currentHandle ?? null;
  } catch {
    return null;
  }
}

export async function readPersistedWorkspaceHandleForSelection(selection: PersistedWorkspaceHistoryEntry): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openWorkspaceHandleDatabase();
    const transaction = db.transaction(WORKSPACE_HANDLE_STORE_NAME, 'readonly');
    const store = transaction.objectStore(WORKSPACE_HANDLE_STORE_NAME);

    const result = await new Promise<PersistedWorkspaceHandleRecord | null>((resolve, reject) => {
      const request = store.get(WORKSPACE_HANDLE_ID);
      request.onsuccess = () => resolve((request.result as PersistedWorkspaceHandleRecord | null) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Failed to read persisted workspace handle history'));
    });

    db.close();

    const matchingHistoryEntry = result?.history.find((entry) => entry.path === selection.path || entry.name === selection.name);
    return matchingHistoryEntry?.handle ?? result?.currentHandle ?? null;
  } catch {
    return null;
  }
}

export async function persistWorkspaceHandle(handle: FileSystemDirectoryHandle, selection?: PersistedWorkspaceHistoryEntry): Promise<void> {
  try {
    const db = await openWorkspaceHandleDatabase();
    const transaction = db.transaction(WORKSPACE_HANDLE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(WORKSPACE_HANDLE_STORE_NAME);

    const existingRecord = await new Promise<PersistedWorkspaceHandleRecord | null>((resolve, reject) => {
      const request = store.get(WORKSPACE_HANDLE_ID);
      request.onsuccess = () => resolve((request.result as PersistedWorkspaceHandleRecord | null) ?? null);
      request.onerror = () => reject(request.error ?? new Error('Failed to read persisted workspace handle record'));
    });

    const history = existingRecord?.history ?? [];
    const nextHistory = selection
      ? (() => {
          const withoutSelection = history.filter((entry) => entry.path !== selection.path || entry.name !== selection.name);
          return [{ ...selection, handle }, ...withoutSelection].slice(0, 6);
        })()
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
