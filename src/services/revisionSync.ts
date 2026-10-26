import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getAllCompletedQuestions,
  revisionStore,
  type CompletedQuestionRecord,
} from './revisionDb';
import { dedupeByHash, mergeRevisionRecords } from './revisionSyncMerge';

const TABLE = 'revision_records';
const CHUNK_SIZE = 200;
// Hashes are long hex strings; keep `in (...)` filters short enough for the request URL.
const DELETE_CHUNK_SIZE = 10;

interface RemoteRow {
  hash: string;
  last_time: string;
  data: Omit<CompletedQuestionRecord, 'id'>;
}

export interface SyncSummary {
  pushed: number;
  pulled: number;
}

/** All of the signed-in user's cloud revision records (rows are keyed by user, not by workspace folder). */
export async function fetchRemoteRevisionRecords(client: SupabaseClient): Promise<CompletedQuestionRecord[]> {
  const { data, error } = await client.from(TABLE).select('hash,last_time,data');
  if (error) throw error;
  return ((data ?? []) as RemoteRow[]).map((row) => ({ ...row.data, hash: row.hash, last_time: row.last_time }));
}

async function upsertRecords(client: SupabaseClient, records: CompletedQuestionRecord[]): Promise<void> {
  // Duplicate hashes in one upsert batch make Postgres fail with 21000.
  const rows = dedupeByHash(records).map(({ id: _id, ...rest }) => ({ hash: rest.hash, last_time: rest.last_time, data: rest }));
  for (let index = 0; index < rows.length; index += CHUNK_SIZE) {
    const { error } = await client.from(TABLE).upsert(rows.slice(index, index + CHUNK_SIZE), { onConflict: 'user_id,hash' });
    if (error) throw error;
  }
}

/** Two-way sync of the local revision records with the signed-in user's cloud records. */
export async function syncRevisionRecords(
  client: SupabaseClient,
  remote?: CompletedQuestionRecord[],
): Promise<SyncSummary> {
  const local = await getAllCompletedQuestions();
  const { toLocal, toRemote } = mergeRevisionRecords(local, remote ?? await fetchRemoteRevisionRecords(client));

  if (toRemote.length > 0) await upsertRecords(client, toRemote);
  if (toLocal.length > 0) await revisionStore.completed_questions.bulkPut(toLocal);
  return { pushed: toRemote.length, pulled: toLocal.length };
}

/** "Keep cloud": local records become an exact copy of the cloud records. */
export async function replaceLocalWithRemote(remote: CompletedQuestionRecord[]): Promise<void> {
  await revisionStore.transaction('rw', revisionStore.completed_questions, async () => {
    await revisionStore.completed_questions.clear();
    await revisionStore.completed_questions.bulkAdd(remote.map(({ id: _id, ...rest }) => rest));
  });
}

/** "Keep this device": cloud records become an exact copy of the local records. */
export async function replaceRemoteWithLocal(
  client: SupabaseClient,
  remote: CompletedQuestionRecord[],
): Promise<void> {
  const local = await getAllCompletedQuestions();
  await upsertRecords(client, local);
  const keep = new Set(local.map((record) => record.hash));
  const stale = remote.map((record) => record.hash).filter((hash) => !keep.has(hash));
  for (let index = 0; index < stale.length; index += DELETE_CHUNK_SIZE) {
    const { error } = await client.from(TABLE).delete().in('hash', stale.slice(index, index + DELETE_CHUNK_SIZE));
    if (error) throw error;
  }
}
