import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getActiveWorkspaceStorageKey,
  getAllCompletedQuestions,
  revisionStore,
  type CompletedQuestionRecord,
} from './revisionDb';
import { mergeRevisionRecords } from './revisionSyncMerge';

const TABLE = 'revision_records';

interface RemoteRow {
  hash: string;
  last_time: string;
  data: Omit<CompletedQuestionRecord, 'id'>;
}

export interface SyncSummary {
  pushed: number;
  pulled: number;
}

/** Two-way sync of the active workspace's revision records for the signed-in user. */
export async function syncRevisionRecords(client: SupabaseClient): Promise<SyncSummary> {
  const workspaceKey = getActiveWorkspaceStorageKey();
  const local = await getAllCompletedQuestions();

  const { data, error } = await client
    .from(TABLE)
    .select('hash,last_time,data')
    .eq('workspace_key', workspaceKey);
  if (error) throw error;
  const remote = ((data ?? []) as RemoteRow[]).map((row) => ({ ...row.data, hash: row.hash, last_time: row.last_time }));

  const { toLocal, toRemote } = mergeRevisionRecords(local, remote);

  if (toRemote.length > 0) {
    const rows = toRemote.map(({ id: _id, ...rest }) => ({
      workspace_key: workspaceKey,
      hash: rest.hash,
      last_time: rest.last_time,
      data: rest,
      updated_at: new Date().toISOString(),
    }));
    const { error: upsertError } = await client.from(TABLE).upsert(rows, { onConflict: 'user_id,workspace_key,hash' });
    if (upsertError) throw upsertError;
  }
  if (toLocal.length > 0) {
    await revisionStore.completed_questions.bulkPut(toLocal);
  }
  return { pushed: toRemote.length, pulled: toLocal.length };
}
