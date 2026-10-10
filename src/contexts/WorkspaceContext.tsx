import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createDefaultWorkspaceContent, loadWorkspaceContent, type WorkspaceContent } from '../services/workspace';
import { setActiveWorkspaceStorageKey } from '../utils/revision';
import {
  applyPendingCountToWorkspaceHistory,
  persistWorkspaceHandle,
  readPersistedWorkspaceHandle,
  readPersistedWorkspaceHandleForSelection,
  readPersistedWorkspaceHistory,
  readPersistedWorkspaceSelection,
  removeWorkspaceHistoryEntry,
  upsertWorkspaceHistoryEntry,
  writePersistedWorkspaceHistory,
  writePersistedWorkspaceSelection,
} from '../utils/workspacePersistence';
import { getDueRevisionCountForWorkspace } from '../utils/revision';

interface WorkspaceContextValue {
  workspace: WorkspaceContent;
  isLoading: boolean;
  selectedDirectoryHandle: FileSystemDirectoryHandle | null;
  workspaceSelectionLabel: string;
  workspaceVersion: number;
  workspaceHistory: Array<{ name: string; path: string; pendingCount?: number }>;
  selectWorkspace: () => Promise<void>;
  selectWorkspaceFromHistory: (entry: { name: string; path: string }) => Promise<void>;
  removeWorkspaceHistoryEntry: (entry: { name: string; path: string }) => void;
  refreshWorkspace: () => Promise<void>;
  refreshWorkspaceHistoryCounts: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspace] = useState<WorkspaceContent>(() => createDefaultWorkspaceContent());
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDirectoryHandle, setSelectedDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [workspaceSelectionLabel, setWorkspaceSelectionLabel] = useState<string>('Default workspace');
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [workspaceHistory, setWorkspaceHistory] = useState<Array<{ name: string; path: string; pendingCount?: number }>>([]);

  const syncPendingRevisionCount = async (workspaceIdentity: string | null, fallbackLabel?: string) => {
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
  };

  const loadWorkspaceForHandle = async (handle: FileSystemDirectoryHandle | null) => {
    const workspaceIdentity = handle?.name ?? null;
    setActiveWorkspaceStorageKey(workspaceIdentity);

    setIsLoading(true);
    try {
      const nextWorkspace = await loadWorkspaceContent(handle);
      setWorkspace(nextWorkspace);
      setWorkspaceVersion((value) => value + 1);
      await syncPendingRevisionCount(workspaceIdentity, handle?.name ?? workspaceSelectionLabel);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshWorkspace = async () => {
    await loadWorkspaceForHandle(selectedDirectoryHandle);
  };

  const refreshWorkspaceHistoryCounts = async () => {
    const identity = selectedDirectoryHandle?.name ?? workspaceSelectionLabel ?? null;
    if (!identity) {
      return;
    }

    await syncPendingRevisionCount(identity, workspaceSelectionLabel);
  };

  useEffect(() => {
    const restoreWorkspace = async () => {
      const persistedSelection = readPersistedWorkspaceSelection();
      const rawHistory = readPersistedWorkspaceHistory();
      setWorkspaceHistory(rawHistory.map((h) => ({ ...h, pendingCount: undefined })));
      if (persistedSelection) {
        setWorkspaceSelectionLabel(persistedSelection.path || persistedSelection.name);
        document.title = `Skill Map · ${persistedSelection.path || persistedSelection.name}`;
      }

      // populate pending counts for history entries
      try {
        const counts = await Promise.all(rawHistory.map((entry) => getDueRevisionCountForWorkspace(entry.path)));
        const withCounts = rawHistory.map((entry, idx) => ({ ...entry, pendingCount: counts[idx] }));
        setWorkspaceHistory(withCounts);
      } catch {
        // ignore per-entry failures
      }

      const restoredHandle = await readPersistedWorkspaceHandle();
      if (restoredHandle) {
        setSelectedDirectoryHandle(restoredHandle);
        const selectionLabel = persistedSelection?.path || persistedSelection?.name || restoredHandle.name;
        setWorkspaceSelectionLabel(selectionLabel);
        document.title = `Skill Map · ${selectionLabel}`;
        await loadWorkspaceForHandle(restoredHandle);
        return;
      }

      await loadWorkspaceForHandle(null);
    };

    void restoreWorkspace();
  }, []);

  const updateWorkspaceSelection = async (handle: FileSystemDirectoryHandle | null, selectionPath: string, selectionLabel: string) => {
    setSelectedDirectoryHandle(handle);
    setWorkspaceSelectionLabel(selectionPath);
    if (handle) {
      await persistWorkspaceHandle(handle, { name: selectionLabel, path: selectionPath });
      const nextHistoryEntries = upsertWorkspaceHistoryEntry(workspaceHistory, { name: selectionLabel, path: selectionPath });
      const count = await getDueRevisionCountForWorkspace(selectionPath);
      const nextHistory = applyPendingCountToWorkspaceHistory(nextHistoryEntries, { name: selectionLabel, path: selectionPath }, count);
      setWorkspaceHistory(nextHistory);
      writePersistedWorkspaceHistory(nextHistory.map(({ name, path }) => ({ name, path })));
    }
    writePersistedWorkspaceSelection({ name: selectionLabel, path: selectionPath });
    document.title = `Skill Map · ${selectionPath}`;
    await loadWorkspaceForHandle(handle);
  };

  const selectWorkspace = async () => {
    if (typeof window === 'undefined') {
      return;
    }

    const showDirectoryPicker = (window as Window & {
      showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;

    if (typeof showDirectoryPicker !== 'function') {
      return;
    }

    try {
      const handle = await showDirectoryPicker();
      const selectionPath = handle.name || 'Local workspace';
      const selectionLabel = selectionPath || 'Local workspace';
      await updateWorkspaceSelection(handle, selectionPath, selectionLabel);
    } catch (error) {
      console.error('Failed to select workspace directory', error);
    } finally {
      setIsLoading(false);
    }
  };

  const selectWorkspaceFromHistory = async (entry: { name: string; path: string }) => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const selectionPath = entry.path || entry.name || 'Local workspace';
      const selectionLabel = entry.name || selectionPath || 'Local workspace';
      const persistedHandle = await readPersistedWorkspaceHandleForSelection({ name: selectionLabel, path: selectionPath });
      if (!persistedHandle) {
        return;
      }

      await updateWorkspaceSelection(persistedHandle, selectionPath, selectionLabel);
    } catch (error) {
      console.error('Failed to restore workspace from history', error);
    } finally {
      setIsLoading(false);
    }
  };

  const removeWorkspaceHistoryEntryFromContext = (entry: { name: string; path: string }) => {
    const nextHistory = removeWorkspaceHistoryEntry(workspaceHistory, entry);
    setWorkspaceHistory(nextHistory);
    writePersistedWorkspaceHistory(nextHistory);
  };

  const value = useMemo(() => ({
    workspace,
    isLoading,
    selectedDirectoryHandle,
    workspaceSelectionLabel,
    workspaceVersion,
    workspaceHistory,
    selectWorkspace,
    selectWorkspaceFromHistory,
    removeWorkspaceHistoryEntry: removeWorkspaceHistoryEntryFromContext,
    refreshWorkspace,
    refreshWorkspaceHistoryCounts,
  }), [workspace, isLoading, selectedDirectoryHandle, workspaceSelectionLabel, workspaceVersion, workspaceHistory]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
