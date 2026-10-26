import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { getAllCompletedQuestions, onRevisionRecordsChanged } from '../services/revisionDb';
import {
  fetchRemoteRevisionRecords,
  replaceLocalWithRemote,
  replaceRemoteWithLocal,
  syncRevisionRecords,
} from '../services/revisionSync';
import { fetchCloudWorkspace, pushWorkspaceContent } from '../services/cloudWorkspace';
import {
  isConflictResolved,
  isSyncConflict,
  markConflictResolved,
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

/** Syncs on sign-in / workspace change and on demand; after local revision writes when auto sync is on. */
export function useCloudSync() {
  const { user } = useAuth();
  const { workspace, workspaceVersion, selectedDirectoryHandle, refreshWorkspace } = useWorkspace();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<PendingConflict | null>(null);
  const [autoSync, setAutoSyncState] = useState(readAutoSync);
  const running = useRef(false);
  const userId = user?.id ?? null;
  // A selected folder is the working copy; without one the cloud copy is shown, so nothing local to upload.
  const localContent = selectedDirectoryHandle ? workspace : null;
  const localContentRef = useRef(localContent);
  localContentRef.current = localContent;

  const runSync = useCallback(async (pushContent: boolean) => {
    if (!supabase || !userId || running.current) return;
    running.current = true;
    setIsSyncing(true);
    try {
      const remote = await fetchRemoteRevisionRecords(supabase);
      const content = localContentRef.current;
      if (!isConflictResolved(userId)) {
        const [local, cloudContent] = await Promise.all([getAllCompletedQuestions(), fetchCloudWorkspace(supabase)]);
        const device = summarizeSide(content, local);
        const cloud = summarizeSide(cloudContent, remote);
        if (isSyncConflict(device, cloud)) {
          setConflict({ device, cloud });
          return;
        }
        markConflictResolved(userId);
      }
      await syncRevisionRecords(supabase, remote);
      if (pushContent && content) await pushWorkspaceContent(supabase, content);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      running.current = false;
      setIsSyncing(false);
    }
  }, [userId]);

  const syncNow = useCallback(() => runSync(true), [runSync]);

  useEffect(() => {
    void runSync(true);
  }, [runSync, workspaceVersion]);

  const resolveConflict = useCallback(async (choice: ConflictChoice) => {
    if (!supabase || !userId) return;
    setIsSyncing(true);
    try {
      const remote = await fetchRemoteRevisionRecords(supabase);
      const content = localContentRef.current;
      if (choice === 'cloud') {
        await replaceLocalWithRemote(remote);
        setCloudPreferred(userId, true);
      } else if (choice === 'device') {
        await replaceRemoteWithLocal(supabase, remote);
        if (content) await pushWorkspaceContent(supabase, content, { prune: true });
        setCloudPreferred(userId, false);
      } else {
        await syncRevisionRecords(supabase, remote);
        if (content) await pushWorkspaceContent(supabase, content);
        setCloudPreferred(userId, false);
      }
      markConflictResolved(userId);
      setConflict(null);
      setError(null);
      if (choice === 'cloud') await refreshWorkspace();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setIsSyncing(false);
    }
  }, [userId, refreshWorkspace]);

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
