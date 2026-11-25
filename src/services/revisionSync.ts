import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getAllCompletedQuestions,
  notifyRevisionRecordsPulled,
  type CompletedQuestionRecord,
  type DeletedRecordTombstone,
  type RevisionDexieStore,
} from './revisionDb';
import { dedupeByHash, filterOwnRecords, mergeRevisionRecords, splitLegacyRecords } from './revisionSyncMerge';
import { applyBlockedChanges, collectRevisionChanges, needsRevisionReview, type RevisionGuard } from './revisionGuard';

const TABLE = 'revision_records';
const CHUNK_SIZE = 200;
// Hashes are long hex strings; keep `in (...)` filters short enough for the request URL.
const DELETE_CHUNK_SIZE = 10;

/** Rows written before cloud rows were split per workspace (see migration 20261027020000). */
export const LEGACY_WORKSPACE_KEY = 'legacy';

interface RemoteRow {
  hash: string;
  last_time: string;
  data: Omit<CompletedQuestionRecord, 'id'> & { deleted?: boolean };
}

/** A removed question's cloud row: same primary key, `data.deleted` set, `last_time` = when it was removed. */
function isTombstoneRow(row: RemoteRow): boolean {
  return row.data?.deleted === true;
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

export interface RemoteRevisionState {
  records: CompletedQuestionRecord[];
  tombstones: DeletedRecordTombstone[];
}

/** Live records and removal tombstones of one cloud workspace. */
export async function fetchRemoteRevisionState(client: SupabaseClient, workspaceKey: string): Promise<RemoteRevisionState> {
  const { data, error } = await client.from(TABLE).select('hash,last_time,data').eq('workspace_key', workspaceKey);
  if (error) throw error;
  const rows = (data ?? []) as RemoteRow[];
  return {
    records: rows.filter((row) => !isTombstoneRow(row)).map((row) => ({ ...row.data, hash: row.hash, last_time: row.last_time })),
    tombstones: rows.filter(isTombstoneRow).map((row) => ({ hash: row.hash, deleted_at: row.last_time })),
  };
}

/** The signed-in user's cloud revision records for one workspace (removed questions excluded). */
export async function fetchRemoteRevisionRecords(client: SupabaseClient, workspaceKey: string): Promise<CompletedQuestionRecord[]> {
  return (await fetchRemoteRevisionState(client, workspaceKey)).records;
}

export async function upsertTombstones(client: SupabaseClient, workspaceKey: string, tombstones: DeletedRecordTombstone[]): Promise<void> {
  const rows = tombstones.map(({ hash, deleted_at }) => ({
    workspace_key: workspaceKey,
    hash,
    last_time: deleted_at,
    data: { deleted: true, hash, deleted_at },
  }));
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const { error } = await client.from(TABLE).upsert(rows.slice(index, index + CHUNK_SIZE), { onConflict: 'user_id,workspace_key,hash' });
    if (error) throw error;
  }
}

export async function upsertRecords(client: SupabaseClient, workspaceKey: string, records: CompletedQuestionRecord[]): Promise<void> {
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

/** Two-way sync of one workspace's local revision records with its cloud records; removals propagate both ways. */
export async function syncRevisionRecords(
  client: SupabaseClient,
  { workspaceKey, store }: RevisionScope,
  remote?: RemoteRevisionState,
  /** Quiz titles of the open workspace; local records of other quizzes are not uploaded. Omit to upload everything. */
  ownTitles?: ReadonlySet<string>,
  /** Pauses a sync that would insert or delete many rows so the user can block some; omit to apply everything. */
  guard?: RevisionGuard,
): Promise<SyncSummary> {
  const local = await getAllCompletedQuestions(store);
  const localTombstones = await store.deleted_records.toArray();
  const state = remote ?? await fetchRemoteRevisionState(client, workspaceKey);
  let merged = mergeRevisionRecords(local, state.records, { local: localTombstones, remote: state.tombstones });
  if (ownTitles) merged = { ...merged, toRemote: filterOwnRecords(merged.toRemote, ownTitles, state.records) };
  if (guard) {
    merged = applyBlockedChanges(merged, guard.remembered);
    const rows = collectRevisionChanges(merged, local, state.records);
    if (needsRevisionReview(rows)) {
      const answer = await guard.ask(rows);
      if (!answer) return { pushed: 0, pulled: 0 };
      merged = applyBlockedChanges(merged, answer.blocked);
    }
  }

  const toRemote = merged.toRemote;
  if (toRemote.length > 0) await upsertRecords(client, workspaceKey, toRemote);
  if (merged.tombstonesToRemote.length > 0) await upsertTombstones(client, workspaceKey, merged.tombstonesToRemote);
  const changesLocal = merged.toLocal.length + merged.deleteLocalHashes.length + merged.tombstonesToLocal.length + merged.clearLocalTombstones.length > 0;
  if (changesLocal) {
    await store.transaction('rw', store.completed_questions, store.deleted_records, async () => {
      if (merged.deleteLocalHashes.length > 0) {
        const keys = await store.completed_questions.where('hash').anyOf(merged.deleteLocalHashes).primaryKeys();
        await store.completed_questions.bulkDelete(keys);
      }
      if (merged.toLocal.length > 0) await store.completed_questions.bulkPut(merged.toLocal);
      if (merged.tombstonesToLocal.length > 0) await store.deleted_records.bulkPut(merged.tombstonesToLocal);
      if (merged.clearLocalTombstones.length > 0) await store.deleted_records.bulkDelete(merged.clearLocalTombstones);
    });
    notifyRevisionRecordsPulled();
  }
  return { pushed: toRemote.length + merged.tombstonesToRemote.length, pulled: merged.toLocal.length + merged.deleteLocalHashes.length };
}

/** "Keep cloud": local records become an exact copy of the cloud records. */
export async function replaceLocalWithRemote({ store }: RevisionScope, remote: CompletedQuestionRecord[]): Promise<void> {
  await store.transaction('rw', store.completed_questions, store.deleted_records, async () => {
    await store.completed_questions.clear();
    await store.deleted_records.clear();
    await store.completed_questions.bulkAdd(remote.map(({ id: _id, ...rest }) => rest));
  });
  notifyRevisionRecordsPulled();
}

/** "Keep this device": cloud records become an exact copy of the local records. */
export async function replaceRemoteWithLocal(
  client: SupabaseClient,
  { workspaceKey, store }: RevisionScope,
  remote: CompletedQuestionRecord[],
  ownTitles?: ReadonlySet<string>,
): Promise<void> {
  const all = await getAllCompletedQuestions(store);
  const local = ownTitles ? filterOwnRecords(all, ownTitles, remote) : all;
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
