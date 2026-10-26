import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { onRevisionRecordsChanged } from '../services/revisionDb';
import { syncRevisionRecords } from '../services/revisionSync';
import { supabase } from '../lib/supabaseClient';

const DEBOUNCE_MS = 2000;
const AUTO_SYNC_KEY = 'skill-map-auto-sync';

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
  const { workspaceVersion } = useWorkspace();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSync, setAutoSyncState] = useState(readAutoSync);
  const running = useRef(false);
  const userId = user?.id ?? null;

  const syncNow = useCallback(async () => {
    if (!supabase || !userId || running.current) return;
    running.current = true;
    setIsSyncing(true);
    try {
      await syncRevisionRecords(supabase);
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      running.current = false;
      setIsSyncing(false);
    }
  }, [userId]);

  useEffect(() => {
    void syncNow();
  }, [syncNow, workspaceVersion]);

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
      timer = setTimeout(() => { void syncNow(); }, DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, autoSync, syncNow]);

  return { syncNow, isSyncing, error, autoSync, setAutoSync };
}
