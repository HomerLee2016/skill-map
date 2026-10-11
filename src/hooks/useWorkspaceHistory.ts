import { useCallback, useState } from 'react';
import { getDueRevisionCountForWorkspace } from '../services/revisionDb';
import {
  applyPendingCountToWorkspaceHistory,
  readPersistedWorkspaceHistory,
  removeWorkspaceHistoryEntry,
  upsertWorkspaceHistoryEntry,
  writePersistedWorkspaceHistory,
  type PersistedWorkspaceHistoryEntry,
  type WorkspaceHistoryEntryWithPendingCount,
} from '../utils/workspacePersistence';

/** Recent-workspace list with per-entry pending revision counts (the sidebar badges). */
export function useWorkspaceHistory() {
  const [workspaceHistory, setWorkspaceHistory] = useState<WorkspaceHistoryEntryWithPendingCount[]>([]);

  const syncPendingRevisionCount = useCallback(async (workspaceIdentity: string | null, fallbackLabel?: string) => {
    const effectiveIdentity = workspaceIdentity || fallbackLabel || null;
    if (!effectiveIdentity) {
      return;
    }

    try {
      const count = await getDueRevisionCountForWorkspace(effectiveIdentity);
      setWorkspaceHistory((currentHistory) => currentHistory.map((entry) => {
        const matchesIdentity = entry.path === effectiveIdentity || entry.name === effectiveIdentity;
        return matchesIdentity ? { ...entry, pendingCount: count } : entry;
      }));
    } catch {
      // Ignore count refresh failures and keep the existing badge state.
    }
  }, []);

  /** Loads the persisted history, then fills in the pending counts. */
  const restoreWorkspaceHistory = useCallback(async () => {
    const rawHistory = readPersistedWorkspaceHistory();
    setWorkspaceHistory(rawHistory.map((h) => ({ ...h, pendingCount: undefined })));

    try {
      const counts = await Promise.all(rawHistory.map((entry) => getDueRevisionCountForWorkspace(entry.path)));
      setWorkspaceHistory(rawHistory.map((entry, idx) => ({ ...entry, pendingCount: counts[idx] })));
    } catch {
      // ignore per-entry failures
    }
  }, []);

  const recordWorkspaceSelection = useCallback(async (entry: PersistedWorkspaceHistoryEntry) => {
    const nextHistoryEntries = upsertWorkspaceHistoryEntry(workspaceHistory, entry);
    const count = await getDueRevisionCountForWorkspace(entry.path);
    const nextHistory = applyPendingCountToWorkspaceHistory(nextHistoryEntries, entry, count);
    setWorkspaceHistory(nextHistory);
    writePersistedWorkspaceHistory(nextHistory.map(({ name, path }) => ({ name, path })));
  }, [workspaceHistory]);

  const removeWorkspaceHistoryItem = useCallback((entry: PersistedWorkspaceHistoryEntry) => {
    const nextHistory = removeWorkspaceHistoryEntry(workspaceHistory, entry);
    setWorkspaceHistory(nextHistory);
    writePersistedWorkspaceHistory(nextHistory);
  }, [workspaceHistory]);

  return {
    workspaceHistory,
    syncPendingRevisionCount,
    restoreWorkspaceHistory,
    recordWorkspaceSelection,
    removeWorkspaceHistoryItem,
  };
}
