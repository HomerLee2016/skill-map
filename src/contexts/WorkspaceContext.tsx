import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createDefaultWorkspaceContent, loadWorkspaceContent, type WorkspaceContent } from '../services/workspace';
import { deriveWorkspaceStorageKey, setActiveWorkspaceStorageKey } from '../services/revisionDb';
import { ensureCloudWorkspace, fetchCloudWorkspace, saveCloudRoadmap, saveCloudStructure } from '../services/cloudWorkspace';
import { isCloudPreferred } from '../services/syncConflict';
import { writeWorkspaceRoadmapFile } from '../services/workspaceRoadmapPersistence';
import { writeWorkspaceStructureFile, type WorkspaceStructureFolder } from '../services/workspaceStructurePersistence';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from './AuthContext';
import type { SavedRoadmap } from '../types';
import type { StructureTree } from '../utils/folderStructure';
import type { TestsStructure } from '../services/workspaceTypes';
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
  /** Storage key of the workspace that `workspace` was loaded for; cloud rows and revision records are scoped by it. */
  workspaceKey: string;
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
  /** Writes to the selected folder and, when signed in, to the user's cloud workspace. True if either succeeded. */
  persistRoadmap: (roadmap: SavedRoadmap) => Promise<boolean>;
  persistStructure: (folder: WorkspaceStructureFolder, structure: StructureTree | TestsStructure) => Promise<boolean>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const DEFAULT_WORKSPACE_LABEL = 'Default workspace';

/** Runs a cloud write for the signed-in user; false when signed out or the write fails. */
async function tryCloudWrite(userId: string | null, write: () => Promise<void>): Promise<boolean> {
  if (!supabase || !userId) return false;
  try {
    await write();
    return true;
  } catch (error) {
    console.error('Failed to save to the cloud workspace', error);
    return false;
  }
}

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [workspace, setWorkspace] = useState<WorkspaceContent>(() => createDefaultWorkspaceContent());
  const [workspaceKey, setWorkspaceKey] = useState(() => deriveWorkspaceStorageKey(null));
  const loadRequest = useRef(0);
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
    const requestId = ++loadRequest.current;
    const nextKey = deriveWorkspaceStorageKey(workspaceIdentity);
    setActiveWorkspaceStorageKey(workspaceIdentity);

    setIsLoading(true);
    try {
      // Signed in: this workspace's cloud copy is shown when there is no folder (e.g. phones)
      // and wherever the user chose "keep cloud". Cloud rows are per workspace, never the whole account.
      let cloudWorkspace = null;
      if (supabase && userId && (!handle || isCloudPreferred(userId, nextKey))) {
        try {
          cloudWorkspace = await fetchCloudWorkspace(supabase, nextKey);
        } catch (error) {
          console.error('Failed to load the cloud workspace', error);
        }
      }
      const nextWorkspace = cloudWorkspace ?? await loadWorkspaceContent(handle);
      // A newer switch started while this one was loading; its result wins.
      if (requestId !== loadRequest.current) return;
      setWorkspace(nextWorkspace);
      setWorkspaceKey(nextKey);
      setWorkspaceVersion((value) => value + 1);
      await syncPendingRevisionCount(workspaceIdentity, handle?.name ?? fallbackLabel);
    } finally {
      if (requestId === loadRequest.current) setIsLoading(false);
    }
  }, [syncPendingRevisionCount, userId]);

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

  const persistRoadmap = useCallback(async (roadmap: SavedRoadmap) => {
    const [folderSaved, cloudSaved] = await Promise.all([
      writeWorkspaceRoadmapFile(selectedDirectoryHandle, roadmap),
      tryCloudWrite(userId, async () => {
        await ensureCloudWorkspace(supabase!, workspaceKey, workspaceSelectionLabel);
        await saveCloudRoadmap(supabase!, workspaceKey, roadmap);
      }),
    ]);
    return folderSaved || cloudSaved;
  }, [selectedDirectoryHandle, userId, workspaceKey, workspaceSelectionLabel]);

  const persistStructure = useCallback(async (folder: WorkspaceStructureFolder, structure: StructureTree | TestsStructure) => {
    const [folderSaved, cloudSaved] = await Promise.all([
      writeWorkspaceStructureFile(selectedDirectoryHandle, folder, structure),
      tryCloudWrite(userId, async () => {
        await ensureCloudWorkspace(supabase!, workspaceKey, workspaceSelectionLabel);
        await saveCloudStructure(supabase!, workspaceKey, folder, structure);
      }),
    ]);
    return folderSaved || cloudSaved;
  }, [selectedDirectoryHandle, userId, workspaceKey, workspaceSelectionLabel]);

  const value = useMemo(() => ({
    workspace,
    workspaceKey,
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
    persistRoadmap,
    persistStructure,
  }), [persistRoadmap, persistStructure, workspace, workspaceKey, isLoading, selectedDirectoryHandle, workspaceSelectionLabel, workspaceVersion, workspaceHistory, selectWorkspace, selectWorkspaceFromHistory, refreshWorkspace, refreshWorkspaceHistoryCounts, removeWorkspaceHistoryItem]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
