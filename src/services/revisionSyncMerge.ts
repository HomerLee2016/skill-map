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

/** One record per `hash` (Dexie indexes `hash` non-uniquely); the newest `last_time` wins, ties keep the first. */
export function dedupeByHash(records: CompletedQuestionRecord[]): CompletedQuestionRecord[] {
  const byHash = new Map<string, CompletedQuestionRecord>();
  for (const record of records) {
    const current = byHash.get(record.hash);
    if (!current || time(record.last_time) > time(current.last_time)) byHash.set(record.hash, record);
  }
  return [...byHash.values()];
}

/** Merge by `hash`; the record with the newest `last_time` wins, ties keep local. */
export function mergeRevisionRecords(
  localRecords: CompletedQuestionRecord[],
  remoteRecords: CompletedQuestionRecord[],
): MergeResult {
  // Duplicate hashes in one upsert batch make Postgres fail with 21000.
  const local = dedupeByHash(localRecords);
  const remote = dedupeByHash(remoteRecords);
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

export interface LegacySplit {
  /** Legacy cloud records that belong to this workspace's tests. */
  adopt: CompletedQuestionRecord[];
  /** Local row ids that came from the legacy pool but belong to another workspace's tests. */
  dropLocalIds: number[];
}

/** Splits the pre-split cloud pool by test title: what this workspace owns, and what leaked into its local store. */
export function splitLegacyRecords(
  local: CompletedQuestionRecord[],
  legacy: CompletedQuestionRecord[],
  quizTitles: Set<string>,
): LegacySplit {
  if (quizTitles.size === 0) return { adopt: [], dropLocalIds: [] };
  const legacyHashes = new Set(legacy.map((record) => record.hash));
  return {
    adopt: legacy.filter((record) => quizTitles.has(record.quiz_title)),
    dropLocalIds: local
      .filter((record) => record.id != null && legacyHashes.has(record.hash) && !quizTitles.has(record.quiz_title))
      .map((record) => record.id as number),
  };
}
