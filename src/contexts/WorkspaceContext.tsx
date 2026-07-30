import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createDefaultWorkspaceContent, loadWorkspaceContent, type WorkspaceContent } from '../services/workspace';
import {
  persistWorkspaceHandle,
  readPersistedWorkspaceHandle,
  readPersistedWorkspaceSelection,
  writePersistedWorkspaceSelection,
} from '../utils/workspacePersistence';

interface WorkspaceContextValue {
  workspace: WorkspaceContent;
  isLoading: boolean;
  selectedDirectoryHandle: FileSystemDirectoryHandle | null;
  workspaceSelectionLabel: string;
  selectWorkspace: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspace] = useState<WorkspaceContent>(() => createDefaultWorkspaceContent());
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDirectoryHandle, setSelectedDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [workspaceSelectionLabel, setWorkspaceSelectionLabel] = useState<string>('Default workspace');

  const loadWorkspaceForHandle = async (handle: FileSystemDirectoryHandle | null) => {
    setIsLoading(true);
    try {
      const nextWorkspace = await loadWorkspaceContent(handle);
      setWorkspace(nextWorkspace);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshWorkspace = async () => {
    await loadWorkspaceForHandle(selectedDirectoryHandle);
  };

  useEffect(() => {
    const restoreWorkspace = async () => {
      const persistedSelection = readPersistedWorkspaceSelection();
      if (persistedSelection) {
        setWorkspaceSelectionLabel(persistedSelection.path || persistedSelection.name);
        document.title = `Skill Map · ${persistedSelection.path || persistedSelection.name}`;
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
      setSelectedDirectoryHandle(handle);
      setWorkspaceSelectionLabel(selectionPath);
      await persistWorkspaceHandle(handle);
      writePersistedWorkspaceSelection({ name: selectionLabel, path: selectionPath });
      document.title = `Skill Map · ${selectionPath}`;
      await loadWorkspaceForHandle(handle);
    } catch (error) {
      console.error('Failed to select workspace directory', error);
    } finally {
      setIsLoading(false);
    }
  };

  const value = useMemo(() => ({
    workspace,
    isLoading,
    selectedDirectoryHandle,
    workspaceSelectionLabel,
    selectWorkspace,
    refreshWorkspace,
  }), [workspace, isLoading, selectedDirectoryHandle, workspaceSelectionLabel]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
