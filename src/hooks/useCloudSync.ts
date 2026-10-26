import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import {
  getActiveWorkspaceStorageKey,
  getAllCompletedQuestions,
  onRevisionRecordsChanged,
  revisionStore,
} from '../services/revisionDb';
import {
  adoptLegacyRevisionRecords,
  fetchRemoteRevisionRecords,
  replaceLocalWithRemote,
  replaceRemoteWithLocal,
  syncRevisionRecords,
} from '../services/revisionSync';
import { ensureCloudWorkspace, fetchCloudWorkspace, pushWorkspaceContent } from '../services/cloudWorkspace';
import {
  isConflictResolved,
  isLegacyAdopted,
  isSyncConflict,
  markConflictResolved,
  markLegacyAdopted,
  setCloudPreferred,
  summarizeSide,
  type ConflictChoice,
  type SideSummary,
} from '../services/syncConflict';
import { supabase } from '../lib/supabaseClient';

const DEBOUNCE_MS = 2000;
const AUTO_SYNC_KEY = 'skill-map-auto-sync';

export interface PendingConflict {
  device: SideSummary;
  cloud: SideSummary;
}

function readAutoSync(): boolean {
  try {
    return localStorage.getItem(AUTO_SYNC_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Syncs the active workspace on sign-in / workspace change and on demand; after local revision writes when auto sync is on. */
export function useCloudSync() {
  const { user } = useAuth();
  const { workspace, workspaceKey, workspaceSelectionLabel, workspaceVersion, hasLocalContent, refreshWorkspace } = useWorkspace();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<PendingConflict | null>(null);
  const [autoSync, setAutoSyncState] = useState(readAutoSync);
  const running = useRef(false);
  const rerunAfter = useRef(false);
  const userId = user?.id ?? null;
  // A selected folder (or import) is the working copy; without one the cloud copy is shown, so nothing local to upload.
  const localContent = hasLocalContent ? workspace : null;
  const localContentRef = useRef(localContent);
  localContentRef.current = localContent;
  const workspaceKeyRef = useRef(workspaceKey);
  workspaceKeyRef.current = workspaceKey;
  const workspaceNameRef = useRef(workspaceSelectionLabel);
  workspaceNameRef.current = workspaceSelectionLabel;
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  /** The workspace on screen and the local store must agree; while a switch is loading they do not. */
  const currentScope = useCallback(() => {
    const key = workspaceKeyRef.current;
    return key === getActiveWorkspaceStorageKey() ? { workspaceKey: key, store: revisionStore } : null;
  }, []);

  const runSync = useCallback(async (pushContent: boolean): Promise<void> => {
    if (!supabase || !userId) return;
    if (running.current) {
      // A switch mid-sync must not be dropped: run again for the new workspace once this one ends.
      rerunAfter.current = true;
      return;
    }
    const scope = currentScope();
    if (!scope) return; // loading; the workspaceVersion bump after the load syncs it
    const { workspaceKey: key } = scope;
    running.current = true;
    setIsSyncing(true);
    try {
      await ensureCloudWorkspace(supabase, key, workspaceNameRef.current);
      const content = localContentRef.current;
      let remote = await fetchRemoteRevisionRecords(supabase, key);
      if (!isConflictResolved(userId, key)) {
        const [local, cloudContent] = await Promise.all([getAllCompletedQuestions(scope.store), fetchCloudWorkspace(supabase, key)]);
        const device = summarizeSide(content, local);
        const cloud = summarizeSide(cloudContent, remote);
        if (isSyncConflict(device, cloud)) {
          setConflict({ device, cloud });
          return;
        }
        markConflictResolved(userId, key);
      }
      // After the conflict check so records adopted from the legacy pool do not read as a second copy.
      if (!isLegacyAdopted(userId, key)) {
        const titles = new Set(workspaceRef.current.tests.map((test) => test.title));
        if (titles.size > 0) {
          await adoptLegacyRevisionRecords(supabase, scope, titles);
          markLegacyAdopted(userId, key);
          remote = await fetchRemoteRevisionRecords(supabase, key);
        }
      }
      await syncRevisionRecords(supabase, scope, remote);
      if (pushContent && content) await pushWorkspaceContent(supabase, key, content);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      running.current = false;
      setIsSyncing(false);
      if (rerunAfter.current) {
        rerunAfter.current = false;
        void runSyncRef.current(true);
      }
    }
  }, [userId, currentScope]);
  const runSyncRef = useRef(runSync);
  runSyncRef.current = runSync;

  const syncNow = useCallback(() => runSync(true), [runSync]);

  useEffect(() => {
    // Another workspace's pending conflict prompt no longer applies.
    setConflict(null);
    void runSync(true);
  }, [runSync, workspaceVersion]);

  const resolveConflict = useCallback(async (choice: ConflictChoice) => {
    const scope = currentScope();
    if (!supabase || !userId || !scope) return;
    const { workspaceKey: key } = scope;
    setIsSyncing(true);
    try {
      await ensureCloudWorkspace(supabase, key, workspaceNameRef.current);
      const remote = await fetchRemoteRevisionRecords(supabase, key);
      const content = localContentRef.current;
      if (choice === 'cloud') {
        await replaceLocalWithRemote(scope, remote);
        setCloudPreferred(userId, key, true);
      } else if (choice === 'device') {
        await replaceRemoteWithLocal(supabase, scope, remote);
        if (content) await pushWorkspaceContent(supabase, key, content, { prune: true });
        setCloudPreferred(userId, key, false);
      } else {
        await syncRevisionRecords(supabase, scope, remote);
        if (content) await pushWorkspaceContent(supabase, key, content);
        setCloudPreferred(userId, key, false);
      }
      markConflictResolved(userId, key);
      setConflict(null);
      setError(null);
      if (choice === 'cloud') await refreshWorkspace();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [userId, currentScope, refreshWorkspace]);

  const setAutoSync = useCallback((value: boolean) => {
    setAutoSyncState(value);
    try {
      localStorage.setItem(AUTO_SYNC_KEY, value ? 'on' : 'off');
    } catch { /* storage unavailable; setting lasts for this session */ }
  }, []);

  useEffect(() => {
    if (!userId || !autoSync) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onRevisionRecordsChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { void runSync(false); }, DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, autoSync, runSync]);

  return { syncNow, isSyncing, error, autoSync, setAutoSync, conflict, resolveConflict };
}
