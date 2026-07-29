import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { createDefaultWorkspaceContent, loadWorkspaceContent, type WorkspaceContent } from '../services/workspace';

interface WorkspaceContextValue {
  workspace: WorkspaceContent;
  isLoading: boolean;
  selectedDirectoryHandle: FileSystemDirectoryHandle | null;
  selectWorkspace: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspace, setWorkspace] = useState<WorkspaceContent>(() => createDefaultWorkspaceContent());
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDirectoryHandle, setSelectedDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);

  const refreshWorkspace = async () => {
    setIsLoading(true);
    try {
      const nextWorkspace = await loadWorkspaceContent(selectedDirectoryHandle);
      setWorkspace(nextWorkspace);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refreshWorkspace();
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
      setSelectedDirectoryHandle(handle);
      setIsLoading(true);
      const nextWorkspace = await loadWorkspaceContent(handle);
      setWorkspace(nextWorkspace);
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
    selectWorkspace,
    refreshWorkspace,
  }), [workspace, isLoading, selectedDirectoryHandle]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
