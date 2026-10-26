import type { CompletedQuestionRecord } from './revisionDb';

export interface MergeResult {
  /** Records to write into Dexie (remote is newer or missing locally). */
  toLocal: CompletedQuestionRecord[];
  /** Records to upsert to Supabase (local is newer or missing remotely). */
  toRemote: CompletedQuestionRecord[];
}

function time(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

/** Merge by `hash`; the record with the newest `last_time` wins, ties keep local. */
export function mergeRevisionRecords(
  local: CompletedQuestionRecord[],
  remote: CompletedQuestionRecord[],
): MergeResult {
  const remoteByHash = new Map(remote.map((record) => [record.hash, record]));
  const localByHash = new Map(local.map((record) => [record.hash, record]));
  const toLocal: CompletedQuestionRecord[] = [];
  const toRemote: CompletedQuestionRecord[] = [];

  for (const record of local) {
    const other = remoteByHash.get(record.hash);
    if (!other || time(record.last_time) > time(other.last_time)) toRemote.push(record);
  }
  for (const record of remote) {
    const other = localByHash.get(record.hash);
    if (!other || time(record.last_time) > time(other.last_time)) {
      // Keep the local primary key so Dexie updates in place.
      toLocal.push(other?.id != null ? { ...record, id: other.id } : { ...record, id: undefined });
    }
  }
  return { toLocal, toRemote };
}
