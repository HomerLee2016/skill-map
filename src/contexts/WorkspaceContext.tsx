import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createDefaultWorkspaceContent, loadWorkspaceContent, type WorkspaceContent } from '../services/workspace';
import { deriveWorkspaceStorageKey, setActiveWorkspaceStorageKey, setActiveWorkspaceStorageKeyDirect } from '../services/revisionDb';
import {
  deleteCloudWorkspace,
  ensureCloudWorkspace,
  fetchCloudWorkspace,
  listCloudWorkspaces,
  saveCloudRoadmap,
  saveCloudStructure,
  type CloudWorkspaceInfo,
} from '../services/cloudWorkspace';
import { clearWorkspaceFlags, isCloudPreferred } from '../services/syncConflict';
import { hasImportedContent, type ImportedWorkspace } from '../services/workspaceImport';
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
  /** The content came from a folder or import on this device (so it is uploaded), not from the cloud copy or the bundled demo. */
  hasLocalContent: boolean;
  /** The signed-in user's workspaces in the cloud; empty when signed out. */
  cloudWorkspaces: CloudWorkspaceInfo[];
  workspaceSelectionLabel: string;
  workspaceVersion: number;
  workspaceHistory: Array<{ name: string; path: string; pendingCount?: number }>;
  selectWorkspace: () => Promise<void>;
  selectWorkspaceFromHistory: (entry: { name: string; path: string }) => Promise<void>;
  /** Opens a cloud workspace by key with no local folder (phones). */
  selectCloudWorkspace: (entry: CloudWorkspaceInfo) => Promise<void>;
  /** Opens a workspace from files the user picked (folder input or zip), for browsers without the directory picker. */
  importWorkspace: (imported: ImportedWorkspace) => Promise<void>;
  refreshCloudWorkspaces: () => Promise<void>;
  /** Forgets the workspace on this device; with `alsoCloud` it also deletes the user's cloud copy (all devices). */
  removeWorkspace: (target: { key: string; name: string; local?: { name: string; path: string } }, options: { alsoCloud: boolean }) => Promise<void>;
  /** Reads one workspace's content without switching to it (for export); null when it cannot be read. */
  readWorkspaceContent: (entry: { key: string; local?: { name: string; path: string } }) => Promise<WorkspaceContent | null>;
  /** Set when the saved folder is known but the browser needs permission again; cleared once reconnected. */
  folderToReconnect: { name: string } | null;
  /** Asks the browser for folder access (needs a click) and loads the folder. */
  reconnectFolder: () => Promise<void>;
  refreshWorkspace: () => Promise<void>;
  refreshWorkspaceHistoryCounts: () => Promise<void>;
  /** Writes to the selected folder and, when signed in, to the user's cloud workspace. True if either succeeded. */
  persistRoadmap: (roadmap: SavedRoadmap) => Promise<boolean>;
  persistStructure: (folder: WorkspaceStructureFolder, structure: StructureTree | TestsStructure) => Promise<boolean>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined);

const DEFAULT_WORKSPACE_LABEL = 'Default workspace';

interface LoadTarget {
  handle: FileSystemDirectoryHandle | null;
  imported?: ImportedWorkspace;
  /** Open this workspace by its cloud key instead of deriving the key from a folder name. */
  cloudKey?: string;
  fallbackLabel: string;
}

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

type PermissionHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'readwrite' }) => Promise<PermissionState>;
};

/** Browsers drop folder access after a while; handles without these methods are treated as readable. */
async function hasFolderAccess(handle: FileSystemDirectoryHandle, ask: boolean): Promise<boolean> {
  const h = handle as PermissionHandle;
  try {
    if (!h.queryPermission) return true;
    if ((await h.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
    return ask && h.requestPermission ? (await h.requestPermission({ mode: 'readwrite' })) === 'granted' : false;
  } catch {
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
  const [hasLocalContent, setHasLocalContent] = useState(false);
  const [folderToReconnect, setFolderToReconnect] = useState<{ name: string; handle: FileSystemDirectoryHandle; label: string } | null>(null);
  const [cloudWorkspaces, setCloudWorkspaces] = useState<CloudWorkspaceInfo[]>([]);
  const {
    workspaceHistory,
    syncPendingRevisionCount,
    restoreWorkspaceHistory,
    recordWorkspaceSelection,
    removeWorkspaceHistoryItem,
  } = useWorkspaceHistory();

  /** Loads one workspace: a folder handle, imported files, or (no handle) its cloud copy by `cloudKey`/name. */
  const loadWorkspaceFor = useCallback(async (target: LoadTarget) => {
    const { handle, imported, cloudKey, fallbackLabel } = target;
    const workspaceIdentity = handle?.name ?? imported?.name ?? null;
    const requestId = ++loadRequest.current;
    let nextKey = cloudKey ?? deriveWorkspaceStorageKey(workspaceIdentity);
    if (cloudKey) setActiveWorkspaceStorageKeyDirect(cloudKey);
    else setActiveWorkspaceStorageKey(workspaceIdentity);

    setIsLoading(true);
    try {
      // Signed in: this workspace's cloud copy is shown when there is no folder (e.g. phones)
      // and wherever the user chose "keep cloud". Cloud rows are per workspace, never the whole account.
      let cloudWorkspace = null;
      if (supabase && userId && (!(handle || imported) || isCloudPreferred(userId, nextKey))) {
        try {
          cloudWorkspace = await fetchCloudWorkspace(supabase, nextKey);
        } catch (error) {
          console.error('Failed to load the cloud workspace', error);
        }
      }
      let nextWorkspace = cloudWorkspace ?? imported?.content ?? null;
      if (!nextWorkspace && cloudKey) {
        // Signed out (or the cloud copy is gone): show the bundled demo under its own key rather than an empty cloud key.
        nextKey = deriveWorkspaceStorageKey(null);
        setActiveWorkspaceStorageKey(null);
      }
      nextWorkspace ??= await loadWorkspaceContent(handle);
      // A newer switch started while this one was loading; its result wins.
      if (requestId !== loadRequest.current) return;
      setWorkspace(nextWorkspace);
      setWorkspaceKey(nextKey);
      setHasLocalContent(Boolean(handle || imported));
      setWorkspaceVersion((value) => value + 1);
      if (!cloudKey) await syncPendingRevisionCount(workspaceIdentity, handle?.name ?? fallbackLabel);
    } finally {
      if (requestId === loadRequest.current) setIsLoading(false);
    }
  }, [syncPendingRevisionCount, userId]);

  const loadWorkspaceForHandle = useCallback(
    (handle: FileSystemDirectoryHandle | null, fallbackLabel: string) => loadWorkspaceFor({ handle, fallbackLabel }),
    [loadWorkspaceFor],
  );

  const refreshCloudWorkspaces = useCallback(async () => {
    if (!supabase || !userId) {
      setCloudWorkspaces([]);
      return;
    }
    try {
      setCloudWorkspaces(await listCloudWorkspaces(supabase));
    } catch (error) {
      console.error('Failed to list cloud workspaces', error);
    }
  }, [userId]);

  useEffect(() => { void refreshCloudWorkspaces(); }, [refreshCloudWorkspaces, workspaceVersion]);

  const refreshWorkspace = useCallback(async () => {
    await loadWorkspaceFor({
      handle: selectedDirectoryHandle,
      cloudKey: selectedDirectoryHandle ? undefined : workspaceKey,
      fallbackLabel: workspaceSelectionLabel,
    });
  }, [loadWorkspaceFor, selectedDirectoryHandle, workspaceKey, workspaceSelectionLabel]);

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

      if (persistedSelection?.cloudKey) {
        // No folder on this device: reopen by key (cloud copy), whatever folder was used before.
        await loadWorkspaceFor({ handle: null, cloudKey: persistedSelection.cloudKey, fallbackLabel: DEFAULT_WORKSPACE_LABEL });
        return;
      }

      const restoredHandle = await readPersistedWorkspaceHandle();
      if (restoredHandle) {
        setSelectedDirectoryHandle(restoredHandle);
        const selectionLabel = persistedSelection?.path || persistedSelection?.name || restoredHandle.name;
        setWorkspaceSelectionLabel(selectionLabel);
        document.title = `Skill Map · ${selectionLabel}`;
        if (!(await hasFolderAccess(restoredHandle, false))) {
          // Keep the user's folder selected and ask for access, instead of silently showing the bundled demo.
          setFolderToReconnect({ name: selectionLabel, handle: restoredHandle, label: selectionLabel });
          return;
        }
        setFolderToReconnect(null);
        await loadWorkspaceForHandle(restoredHandle, DEFAULT_WORKSPACE_LABEL);
        return;
      }

      await loadWorkspaceForHandle(null, DEFAULT_WORKSPACE_LABEL);
    };

    void restoreWorkspace();
  }, [restoreWorkspaceHistory, loadWorkspaceForHandle, loadWorkspaceFor]);

  const updateWorkspaceSelection = useCallback(async (handle: FileSystemDirectoryHandle | null, selectionPath: string, selectionLabel: string) => {
    setSelectedDirectoryHandle(handle);
    setFolderToReconnect(null);
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

  const selectCloudWorkspace = useCallback(async (entry: CloudWorkspaceInfo) => {
    setSelectedDirectoryHandle(null);
    setFolderToReconnect(null);
    setWorkspaceSelectionLabel(entry.name);
    writePersistedWorkspaceSelection({ name: entry.name, path: entry.name, cloudKey: entry.key });
    document.title = `Skill Map · ${entry.name}`;
    await loadWorkspaceFor({ handle: null, cloudKey: entry.key, fallbackLabel: entry.name });
  }, [loadWorkspaceFor]);

  const selectWorkspaceFromHistory = useCallback(async (entry: { name: string; path: string }) => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const selectionPath = entry.path || entry.name || 'Local workspace';
      const selectionLabel = entry.name || selectionPath || 'Local workspace';
      const persistedHandle = await readPersistedWorkspaceHandleForSelection({ name: selectionLabel, path: selectionPath });
      if (!persistedHandle) {
        // No folder is kept for this workspace on this device: open its cloud copy if there is one, otherwise say so.
        const cloudCopy = cloudWorkspaces.find((workspace) => workspace.key === deriveWorkspaceStorageKey(selectionPath));
        if (cloudCopy) {
          setFolderToReconnect(null);
          await selectCloudWorkspace(cloudCopy);
        } else {
          window.alert(`This device no longer has the folder for "${selectionLabel}". Use "Browse from local" to pick it again.`);
        }
        return;
      }
      if (!(await hasFolderAccess(persistedHandle, true))) {
        setFolderToReconnect({ name: selectionLabel, handle: persistedHandle, label: selectionPath });
        return;
      }
      setFolderToReconnect(null);

      await updateWorkspaceSelection(persistedHandle, selectionPath, selectionLabel);
    } catch (error) {
      console.error('Failed to restore workspace from history', error);
    } finally {
      setIsLoading(false);
    }
  }, [updateWorkspaceSelection, cloudWorkspaces, selectCloudWorkspace]);

  const importWorkspace = useCallback(async (imported: ImportedWorkspace) => {
    if (!hasImportedContent(imported)) {
      window.alert(`No lessons, tests or roadmaps were found in "${imported.name}". Pick the workspace folder (or a zip) that contains lessons/, tests/ or roadmaps/.`);
      return;
    }
    const key = deriveWorkspaceStorageKey(imported.name);
    setSelectedDirectoryHandle(null);
    setFolderToReconnect(null);
    setWorkspaceSelectionLabel(imported.name);
    writePersistedWorkspaceSelection({ name: imported.name, path: imported.name, cloudKey: key });
    document.title = `Skill Map · ${imported.name}`;
    await loadWorkspaceFor({ handle: null, imported, fallbackLabel: imported.name });
  }, [loadWorkspaceFor]);

  const reconnectFolder = useCallback(async () => {
    const pending = folderToReconnect;
    if (!pending) return;
    if (!(await hasFolderAccess(pending.handle, true))) return;
    setFolderToReconnect(null);
    await updateWorkspaceSelection(pending.handle, pending.label, pending.name);
  }, [folderToReconnect, updateWorkspaceSelection]);

  const readWorkspaceContent = useCallback(async (entry: { key: string; local?: { name: string; path: string } }) => {
    if (entry.key === workspaceKey) return workspace;
    if (entry.local) {
      const handle = await readPersistedWorkspaceHandleForSelection(entry.local);
      if (handle) {
        const picker = handle as FileSystemDirectoryHandle & { requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState> };
        if (picker.requestPermission && (await picker.requestPermission({ mode: 'read' })) !== 'granted') return null;
        return loadWorkspaceContent(handle);
      }
    }
    if (supabase && userId) return fetchCloudWorkspace(supabase, entry.key);
    return null;
  }, [workspace, workspaceKey, userId]);

  const removeWorkspace = useCallback(async (
    target: { key: string; name: string; local?: { name: string; path: string } },
    { alsoCloud }: { alsoCloud: boolean },
  ) => {
    if (alsoCloud) {
      if (!supabase || !userId) throw new Error('Sign in to delete the cloud copy.');
      await deleteCloudWorkspace(supabase, target.key);
      clearWorkspaceFlags(userId, target.key);
      await refreshCloudWorkspaces();
    }
    if (target.local) removeWorkspaceHistoryItem(target.local);
    if (target.key === workspaceKey && (alsoCloud || target.local)) {
      // The open workspace was removed: fall back to the bundled demo instead of leaving a dangling selection.
      setSelectedDirectoryHandle(null);
      setWorkspaceSelectionLabel(DEFAULT_WORKSPACE_LABEL);
      writePersistedWorkspaceSelection({ name: DEFAULT_WORKSPACE_LABEL, path: DEFAULT_WORKSPACE_LABEL, cloudKey: deriveWorkspaceStorageKey(null) });
      document.title = `Skill Map · ${DEFAULT_WORKSPACE_LABEL}`;
      await loadWorkspaceFor({ handle: null, cloudKey: deriveWorkspaceStorageKey(null), fallbackLabel: DEFAULT_WORKSPACE_LABEL });
    }
  }, [userId, workspaceKey, removeWorkspaceHistoryItem, refreshCloudWorkspaces, loadWorkspaceFor]);

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
    hasLocalContent,
    cloudWorkspaces,
    workspaceSelectionLabel,
    workspaceVersion,
    workspaceHistory,
    selectWorkspace,
    selectWorkspaceFromHistory,
    selectCloudWorkspace,
    readWorkspaceContent,
    folderToReconnect: folderToReconnect ? { name: folderToReconnect.name } : null,
    reconnectFolder,
    importWorkspace,
    refreshCloudWorkspaces,
    removeWorkspace,
    refreshWorkspace,
    refreshWorkspaceHistoryCounts,
    persistRoadmap,
    persistStructure,
  }), [persistRoadmap, persistStructure, workspace, workspaceKey, isLoading, selectedDirectoryHandle, workspaceSelectionLabel, workspaceVersion, workspaceHistory, selectWorkspace, selectWorkspaceFromHistory, refreshWorkspace, refreshWorkspaceHistoryCounts, hasLocalContent, cloudWorkspaces, selectCloudWorkspace, readWorkspaceContent, folderToReconnect, reconnectFolder, importWorkspace, refreshCloudWorkspaces, removeWorkspace]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
