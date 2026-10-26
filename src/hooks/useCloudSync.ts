import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { onRevisionRecordsChanged } from '../services/revisionDb';
import { syncRevisionRecords } from '../services/revisionSync';
import { supabase } from '../lib/supabaseClient';

const DEBOUNCE_MS = 2000;

/** Syncs on sign-in / workspace change, after local revision writes, and on demand. */
export function useCloudSync() {
  const { user } = useAuth();
  const { workspaceVersion } = useWorkspace();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    if (!userId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onRevisionRecordsChanged(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { void syncNow(); }, DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, syncNow]);

  return { syncNow, isSyncing, error };
}
