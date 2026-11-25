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
  fetchRemoteRevisionState,
  replaceLocalWithRemote,
  replaceRemoteWithLocal,
  syncRevisionRecords,
} from '../services/revisionSync';
import { ensureCloudWorkspace, fetchCloudWorkspace, pushWorkspaceContent } from '../services/cloudWorkspace';
import { resolveContentConflict, runContentSync, type ConflictChoice as ContentChoice } from '../services/contentSyncRun';
import { hashContent, writeContentBase, type ItemRef } from '../services/contentSync';
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
import type { ReviewItem } from '../services/contentReview';
import {
  readRememberedBlocks,
  writeRememberedBlocks,
  type RevisionChangeKey,
  type RevisionChangeRow,
  type RevisionGuard,
} from '../services/revisionGuard';
import type { LastSync, SyncTrigger } from '../utils/syncStatus';

const DEBOUNCE_MS = 2000;
const AUTO_SYNC_KEY = 'skill-map-auto-sync';

export interface PendingConflict {
  device: SideSummary;
  cloud: SideSummary;
}

/** A sync waiting for the user: lessons/tests on one side only, or a large revision change. */
export type PendingReview =
  | { type: 'content'; items: ReviewItem[]; answer: (keep: Set<string> | null) => void }
  | { type: 'revision'; rows: RevisionChangeRow[]; answer: (result: { blocked: Set<RevisionChangeKey>; remember: boolean } | null) => void };

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
  const { workspace, workspaceKey, workspaceSelectionLabel, workspaceVersion, hasLocalContent, refreshWorkspace, selectedDirectoryHandle, applySyncedContent, recordVersions } = useWorkspace();
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<PendingConflict | null>(null);
  /** Lessons, tests, roadmaps or folder trees changed on this device and in the cloud; nothing was overwritten. */
  const [contentConflicts, setContentConflicts] = useState<ItemRef[]>([]);
  const [review, setReview] = useState<PendingReview | null>(null);
  const reviewRef = useRef<PendingReview | null>(null);
  const [autoSync, setAutoSyncState] = useState(readAutoSync);
  const [lastSync, setLastSync] = useState<LastSync | null>(null);
  const running = useRef(false);
  const rerunAfter = useRef<SyncTrigger | null>(null);
  // The re-read done by "Sync now" bumps workspaceVersion, which queues a second sync; both belong to the manual press.
  const manualActive = useRef(false);
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
  const handleRef = useRef(selectedDirectoryHandle);
  handleRef.current = selectedDirectoryHandle;

  /** The workspace on screen and the local store must agree; while a switch is loading they do not. */
  const currentScope = useCallback(() => {
    const key = workspaceKeyRef.current;
    return key === getActiveWorkspaceStorageKey() ? { workspaceKey: key, store: revisionStore } : null;
  }, []);

  /** Titles of the open workspace's tests: only their revision records belong in its cloud copy. */
  const ownQuizTitles = useCallback(() => new Set(workspaceRef.current.tests.map((test) => test.title)), []);

  /**
   * Puts pulled content on screen AND into the refs now. A sync queued right behind this one starts before React has
   * re-rendered; reading the old content then would "push" the stale copy over what was just pulled.
   */
  const showSyncedContent = useCallback((next: typeof workspace) => {
    localContentRef.current = next;
    workspaceRef.current = next;
    applySyncedContent(next);
  }, [applySyncedContent]);

  /** Shows a review dialog and waits for the answer; the sync stays paused until then. */
  const askReview = useCallback(<T,>(build: (answer: (value: T | null) => void) => PendingReview): Promise<T | null> =>
    new Promise((resolve) => {
      const next = build((value) => {
        reviewRef.current = null;
        setReview(null);
        resolve(value);
      });
      reviewRef.current = next;
      setReview(next);
    }), []);

  const runSync = useCallback(async (pushContent: boolean, requested: SyncTrigger): Promise<void> => {
    const trigger = manualActive.current ? 'manual' : requested;
    if (!supabase || !userId) return;
    if (running.current) {
      // A switch mid-sync must not be dropped: run again for the new workspace once this one ends.
      rerunAfter.current = trigger;
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
      let remote = await fetchRemoteRevisionState(supabase, key);
      if (!isConflictResolved(userId, key)) {
        const [local, cloudContent] = await Promise.all([getAllCompletedQuestions(scope.store), fetchCloudWorkspace(supabase, key)]);
        const device = summarizeSide(content, local);
        const cloud = summarizeSide(cloudContent, remote.records);
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
          remote = await fetchRemoteRevisionState(supabase, key);
        }
      }
      const guard: RevisionGuard = {
        remembered: readRememberedBlocks(userId, key),
        ask: async (rows) => {
          const answer = await askReview<{ blocked: Set<RevisionChangeKey>; remember: boolean }>((resolve) => ({ type: 'revision', rows, answer: resolve }));
          if (answer?.remember) writeRememberedBlocks(userId, key, new Set([...readRememberedBlocks(userId, key), ...answer.blocked]));
          return answer;
        },
      };
      await syncRevisionRecords(supabase, scope, remote, ownQuizTitles(), guard);
      if (pushContent && content) {
        const result = await runContentSync({
          client: supabase, userId, workspaceKey: key, local: content, handle: handleRef.current, workspaceName: workspaceNameRef.current,
          review: (items) => askReview<Set<string>>((resolve) => ({ type: 'content', items, answer: resolve })),
        });
        recordVersions(result.versions);
        if (result.changed) showSyncedContent(result.content);
        setContentConflicts(result.conflicts);
        if (result.folderFailures.length > 0) throw new Error('Some changes from your account could not be written to the folder. Reconnect the folder and sync again.');
      }
      setError(null);
      setLastSync({ at: Date.now(), trigger });
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      running.current = false;
      setIsSyncing(false);
      const queued = rerunAfter.current;
      if (!queued) manualActive.current = false;
      if (queued) {
        rerunAfter.current = null;
        void runSyncRef.current(true, queued);
      }
    }
  }, [userId, currentScope, ownQuizTitles, recordVersions, showSyncedContent, askReview]);
  const runSyncRef = useRef(runSync);
  runSyncRef.current = runSync;

  /** Re-reads the folder (or the cloud copy on a phone) first so files added since it was loaded are uploaded / pulled in. */
  const syncNow = useCallback(async () => {
    manualActive.current = true;
    try {
      await refreshWorkspace();
    } catch (err) {
      console.error(err);
    }
    await runSync(true, 'manual');
    // A sync that bailed out early never reaches its finally block.
    if (!running.current && !rerunAfter.current) manualActive.current = false;
  }, [refreshWorkspace, runSync]);

  useEffect(() => {
    // Another workspace's pending conflict prompt no longer applies.
    setConflict(null);
    setContentConflicts([]);
    // A review for the workspace being left no longer applies; answering "cancel" lets its paused sync finish.
    reviewRef.current?.answer(null);
    void runSync(true, 'workspace');
  }, [runSync, workspaceVersion]);

  const resolveConflict = useCallback(async (choice: ConflictChoice) => {
    const scope = currentScope();
    if (!supabase || !userId || !scope) return;
    const { workspaceKey: key } = scope;
    setIsSyncing(true);
    try {
      await ensureCloudWorkspace(supabase, key, workspaceNameRef.current);
      const remote = await fetchRemoteRevisionState(supabase, key);
      const content = localContentRef.current;
      if (choice === 'cloud') {
        await replaceLocalWithRemote(scope, remote.records);
        setCloudPreferred(userId, key, true);
      } else if (choice === 'device') {
        await replaceRemoteWithLocal(supabase, scope, remote.records, ownQuizTitles());
        if (content) {
          await pushWorkspaceContent(supabase, key, content, { prune: true });
          writeContentBase(userId, key, hashContent(content));
        }
        setCloudPreferred(userId, key, false);
      } else {
        await syncRevisionRecords(supabase, scope, remote, ownQuizTitles());
        if (content) {
          const result = await runContentSync({ client: supabase, userId, workspaceKey: key, local: content, handle: handleRef.current });
          recordVersions(result.versions);
          if (result.changed) showSyncedContent(result.content);
          setContentConflicts(result.conflicts);
        }
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
  }, [userId, currentScope, refreshWorkspace, ownQuizTitles, recordVersions, showSyncedContent]);

  /** The user picks, per conflicting item, the cloud's version or this device's. */
  const resolveContent = useCallback(async (ref: ItemRef, choice: ContentChoice) => {
    const content = localContentRef.current;
    if (!supabase || !userId || !content) return;
    setIsSyncing(true);
    try {
      const next = await resolveContentConflict({ client: supabase, userId, workspaceKey: workspaceKeyRef.current, local: content, handle: handleRef.current, ref, choice });
      showSyncedContent(next);
      setContentConflicts((current) => current.filter((item) => item !== ref));
      setError(null);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Could not resolve the conflict');
    } finally {
      setIsSyncing(false);
    }
  }, [userId, showSyncedContent]);

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
      timer = setTimeout(() => { void runSync(false, 'revision'); }, DEBOUNCE_MS);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [userId, autoSync, runSync]);

  return { syncNow, isSyncing, error, lastSync, autoSync, setAutoSync, conflict, resolveConflict, contentConflicts, resolveContent, review };
}
