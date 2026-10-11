import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createDefaultWorkspaceContent, loadWorkspaceContent, type WorkspaceContent } from '../services/workspace';
import { setActiveWorkspaceStorageKey } from '../services/revisionDb';
import {
  persistWorkspaceHandle,
  readPersistedWorkspaceHandle,
  readPersistedWorkspaceHandleForSelection,
} from '../services/workspaceHandleStore';
import { useWorkspaceHistory } from '../hooks/useWorkspaceHistory';
import {
  readPersistedWorkspaceSelection,
  writePersistedWorkspaceSelection,
} from '../utils/workspacePersistence';

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

const DEFAULT_WORKSPACE_LABEL = 'Default workspace';

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspace] = useState<WorkspaceContent>(() => createDefaultWorkspaceContent());
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDirectoryHandle, setSelectedDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [workspaceSelectionLabel, setWorkspaceSelectionLabel] = useState<string>(DEFAULT_WORKSPACE_LABEL);
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const {
    workspaceHistory,
    syncPendingRevisionCount,
    restoreWorkspaceHistory,
    recordWorkspaceSelection,
    removeWorkspaceHistoryItem,
  } = useWorkspaceHistory();

  const loadWorkspaceForHandle = useCallback(async (handle: FileSystemDirectoryHandle | null, fallbackLabel: string) => {
    const workspaceIdentity = handle?.name ?? null;
    setActiveWorkspaceStorageKey(workspaceIdentity);

    setIsLoading(true);
    try {
      const nextWorkspace = await loadWorkspaceContent(handle);
      setWorkspace(nextWorkspace);
      setWorkspaceVersion((value) => value + 1);
      await syncPendingRevisionCount(workspaceIdentity, handle?.name ?? fallbackLabel);
    } finally {
      setIsLoading(false);
    }
  }, [syncPendingRevisionCount]);

  const refreshWorkspace = useCallback(async () => {
    await loadWorkspaceForHandle(selectedDirectoryHandle, workspaceSelectionLabel);
  }, [loadWorkspaceForHandle, selectedDirectoryHandle, workspaceSelectionLabel]);

  const refreshWorkspaceHistoryCounts = useCallback(async () => {
    const identity = selectedDirectoryHandle?.name ?? workspaceSelectionLabel ?? null;
    if (!identity) {
      return;
    }

    await syncPendingRevisionCount(identity, workspaceSelectionLabel);
  }, [selectedDirectoryHandle, workspaceSelectionLabel, syncPendingRevisionCount]);

  useEffect(() => {
    const restoreWorkspace = async () => {
      const persistedSelection = readPersistedWorkspaceSelection();
      if (persistedSelection) {
        setWorkspaceSelectionLabel(persistedSelection.path || persistedSelection.name);
        document.title = `Skill Map · ${persistedSelection.path || persistedSelection.name}`;
      }

      await restoreWorkspaceHistory();

      const restoredHandle = await readPersistedWorkspaceHandle();
      if (restoredHandle) {
        setSelectedDirectoryHandle(restoredHandle);
        const selectionLabel = persistedSelection?.path || persistedSelection?.name || restoredHandle.name;
        setWorkspaceSelectionLabel(selectionLabel);
        document.title = `Skill Map · ${selectionLabel}`;
        await loadWorkspaceForHandle(restoredHandle, DEFAULT_WORKSPACE_LABEL);
        return;
      }

      await loadWorkspaceForHandle(null, DEFAULT_WORKSPACE_LABEL);
    };

    void restoreWorkspace();
  }, [restoreWorkspaceHistory, loadWorkspaceForHandle]);

  const updateWorkspaceSelection = useCallback(async (handle: FileSystemDirectoryHandle | null, selectionPath: string, selectionLabel: string) => {
    setSelectedDirectoryHandle(handle);
    setWorkspaceSelectionLabel(selectionPath);
    if (handle) {
      await persistWorkspaceHandle(handle, { name: selectionLabel, path: selectionPath });
      await recordWorkspaceSelection({ name: selectionLabel, path: selectionPath });
    }
    writePersistedWorkspaceSelection({ name: selectionLabel, path: selectionPath });
    document.title = `Skill Map · ${selectionPath}`;
    await loadWorkspaceForHandle(handle, selectionPath);
  }, [recordWorkspaceSelection, loadWorkspaceForHandle]);

  const selectWorkspace = useCallback(async () => {
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
  }, [updateWorkspaceSelection]);

  const selectWorkspaceFromHistory = useCallback(async (entry: { name: string; path: string }) => {
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
  }, [updateWorkspaceSelection]);

  const value = useMemo(() => ({
    workspace,
    isLoading,
    selectedDirectoryHandle,
    workspaceSelectionLabel,
    workspaceVersion,
    workspaceHistory,
    selectWorkspace,
    selectWorkspaceFromHistory,
    removeWorkspaceHistoryEntry: removeWorkspaceHistoryItem,
    refreshWorkspace,
    refreshWorkspaceHistoryCounts,
  }), [workspace, isLoading, selectedDirectoryHandle, workspaceSelectionLabel, workspaceVersion, workspaceHistory, selectWorkspace, selectWorkspaceFromHistory, refreshWorkspace, refreshWorkspaceHistoryCounts, removeWorkspaceHistoryItem]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
