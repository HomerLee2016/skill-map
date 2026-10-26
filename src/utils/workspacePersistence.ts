export interface PersistedWorkspaceSelection {
  name: string;
  path: string;
  /** Set when the workspace has no folder on this device (opened from the cloud or imported); it is reopened by this key. */
  cloudKey?: string;
}

export interface PersistedWorkspaceHistoryEntry {
  name: string;
  path: string;
}

export interface WorkspaceHistoryEntryWithPendingCount extends PersistedWorkspaceHistoryEntry {
  pendingCount?: number;
}

const WORKSPACE_SELECTION_STORAGE_KEY = 'skill-map.workspace-selection';
const WORKSPACE_HISTORY_STORAGE_KEY = 'skill-map.workspace-history';

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
      return typeof parsed.cloudKey === 'string'
        ? { name: parsed.name, path: parsed.path, cloudKey: parsed.cloudKey }
        : { name: parsed.name, path: parsed.path };
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

export function applyPendingCountToWorkspaceHistory(
  history: WorkspaceHistoryEntryWithPendingCount[],
  target: PersistedWorkspaceHistoryEntry,
  pendingCount: number
): WorkspaceHistoryEntryWithPendingCount[] {
  return history.map((entry) => ({
    ...entry,
    pendingCount: entry.path === target.path && entry.name === target.name ? pendingCount : entry.pendingCount,
  }));
}
