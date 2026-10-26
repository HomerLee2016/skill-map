import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getAllCompletedQuestions,
  notifyRevisionRecordsPulled,
  type CompletedQuestionRecord,
  type RevisionDexieStore,
} from './revisionDb';
import { dedupeByHash, mergeRevisionRecords, splitLegacyRecords } from './revisionSyncMerge';

const TABLE = 'revision_records';
const CHUNK_SIZE = 200;
// Hashes are long hex strings; keep `in (...)` filters short enough for the request URL.
const DELETE_CHUNK_SIZE = 10;

/** Rows written before cloud rows were split per workspace (see migration 20261027020000). */
export const LEGACY_WORKSPACE_KEY = 'legacy';

interface RemoteRow {
  hash: string;
  last_time: string;
  data: Omit<CompletedQuestionRecord, 'id'>;
}

/** Which workspace's cloud rows and which local store a sync works on; captured once so a mid-sync switch cannot mix them. */
export interface RevisionScope {
  workspaceKey: string;
  store: RevisionDexieStore;
}

export interface SyncSummary {
  pushed: number;
  pulled: number;
}

/** The signed-in user's cloud revision records for one workspace. */
export async function fetchRemoteRevisionRecords(client: SupabaseClient, workspaceKey: string): Promise<CompletedQuestionRecord[]> {
  const { data, error } = await client.from(TABLE).select('hash,last_time,data').eq('workspace_key', workspaceKey);
  if (error) throw error;
  return ((data ?? []) as RemoteRow[]).map((row) => ({ ...row.data, hash: row.hash, last_time: row.last_time }));
}

async function upsertRecords(client: SupabaseClient, workspaceKey: string, records: CompletedQuestionRecord[]): Promise<void> {
  // Duplicate hashes in one upsert batch make Postgres fail with 21000.
  const rows = dedupeByHash(records).map(({ id: _id, ...rest }) => ({
    workspace_key: workspaceKey,
    hash: rest.hash,
    last_time: rest.last_time,
    data: rest,
  }));
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const { error } = await client.from(TABLE).upsert(rows.slice(index, index + CHUNK_SIZE), { onConflict: 'user_id,workspace_key,hash' });
    if (error) throw error;
  }
}

/** Two-way sync of one workspace's local revision records with its cloud records. */
export async function syncRevisionRecords(
  client: SupabaseClient,
  { workspaceKey, store }: RevisionScope,
  remote?: CompletedQuestionRecord[],
): Promise<SyncSummary> {
  const local = await getAllCompletedQuestions(store);
  const { toLocal, toRemote } = mergeRevisionRecords(local, remote ?? await fetchRemoteRevisionRecords(client, workspaceKey));

  if (toRemote.length > 0) await upsertRecords(client, workspaceKey, toRemote);
  if (toLocal.length > 0) {
    await store.completed_questions.bulkPut(toLocal);
    notifyRevisionRecordsPulled();
  }
  return { pushed: toRemote.length, pulled: toLocal.length };
}

/** "Keep cloud": local records become an exact copy of the cloud records. */
export async function replaceLocalWithRemote({ store }: RevisionScope, remote: CompletedQuestionRecord[]): Promise<void> {
  await store.transaction('rw', store.completed_questions, async () => {
    await store.completed_questions.clear();
    await store.completed_questions.bulkAdd(remote.map(({ id: _id, ...rest }) => rest));
  });
  notifyRevisionRecordsPulled();
}

/** "Keep this device": cloud records become an exact copy of the local records. */
export async function replaceRemoteWithLocal(
  client: SupabaseClient,
  { workspaceKey, store }: RevisionScope,
  remote: CompletedQuestionRecord[],
): Promise<void> {
  const local = await getAllCompletedQuestions(store);
  await upsertRecords(client, workspaceKey, local);
  const keep = new Set(local.map((record) => record.hash));
  const stale = remote.map((record) => record.hash).filter((hash) => !keep.has(hash));
  for (let index = 0; index < stale.length; index += DELETE_CHUNK_SIZE) {
    const { error } = await client
      .from(TABLE)
      .delete()
      .eq('workspace_key', workspaceKey)
      .in('hash', stale.slice(index, index + DELETE_CHUNK_SIZE));
    if (error) throw error;
  }
}

/**
 * One-time repair after the per-workspace split: before it, sync pulled every workspace's records into
 * every local store. Legacy cloud records whose quiz belongs to this workspace are adopted into it; local
 * copies of legacy records that belong to other workspaces are dropped (they stay in the legacy rows).
 */
export async function adoptLegacyRevisionRecords(
  client: SupabaseClient,
  { workspaceKey, store }: RevisionScope,
  quizTitles: Set<string>,
): Promise<void> {
  const legacy = await fetchRemoteRevisionRecords(client, LEGACY_WORKSPACE_KEY);
  if (legacy.length === 0) return;
  const local = await getAllCompletedQuestions(store);
  const { adopt, dropLocalIds } = splitLegacyRecords(local, legacy, quizTitles);
  if (dropLocalIds.length > 0) {
    await store.completed_questions.bulkDelete(dropLocalIds);
    notifyRevisionRecordsPulled();
  }
  if (adopt.length > 0) await upsertRecords(client, workspaceKey, adopt);
}
