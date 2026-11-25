import type { CompletedQuestionRecord } from './revisionDb';
import type { MergeResult } from './revisionSyncMerge';

/** A sync that would insert or delete more than this many revision rows (updates do not count) asks first. */
export const REVISION_GUARD_THRESHOLD = 10;

export type RevisionChangeKey = string;

/** One revision row a sync would add or remove, in one direction. */
export interface RevisionChangeRow {
  key: RevisionChangeKey;
  hash: string;
  direction: 'cloud' | 'device';
  op: 'insert' | 'delete';
  label: string;
  quiz: string;
}

export const changeKey = (direction: RevisionChangeRow['direction'], op: RevisionChangeRow['op'], hash: string): RevisionChangeKey =>
  `${direction}:${op}:${hash}`;

/** What the answer to the guard prompt is: the rows the user blocked, and whether to remember them. */
export interface RevisionGuardAnswer {
  blocked: Set<RevisionChangeKey>;
}

export interface RevisionGuard {
  /** Rows blocked earlier and remembered; they are never applied and never counted. */
  remembered: ReadonlySet<RevisionChangeKey>;
  /** Asked when more than the threshold remain. `null` cancels the whole revision sync. */
  ask: (rows: RevisionChangeRow[]) => Promise<RevisionGuardAnswer | null>;
}

/** Inserts and deletes in a merge result; rows whose hash already exists on the target side are updates and are left out. */
export function collectRevisionChanges(
  merged: MergeResult, local: CompletedQuestionRecord[], remote: CompletedQuestionRecord[],
): RevisionChangeRow[] {
  const localHashes = new Set(local.map((record) => record.hash));
  const remoteHashes = new Set(remote.map((record) => record.hash));
  const known = new Map<string, CompletedQuestionRecord>();
  for (const record of [...remote, ...local]) known.set(record.hash, record);
  const describe = (hash: string) => {
    const record = known.get(hash);
    return { label: record?.question_name ?? `Removed question (${hash.slice(0, 8)})`, quiz: record?.quiz_title ?? '' };
  };
  const rows: RevisionChangeRow[] = [];
  const add = (direction: RevisionChangeRow['direction'], op: RevisionChangeRow['op'], hash: string, record?: CompletedQuestionRecord) => {
    const info = record ? { label: record.question_name, quiz: record.quiz_title } : describe(hash);
    rows.push({ key: changeKey(direction, op, hash), hash, direction, op, ...info });
  };
  for (const record of merged.toRemote) if (!remoteHashes.has(record.hash)) add('cloud', 'insert', record.hash, record);
  for (const { hash } of merged.tombstonesToRemote) add('cloud', 'delete', hash);
  for (const record of merged.toLocal) if (!localHashes.has(record.hash)) add('device', 'insert', record.hash, record);
  for (const hash of merged.deleteLocalHashes) add('device', 'delete', hash);
  return rows;
}

/** The merge result without the blocked rows. */
export function applyBlockedChanges(merged: MergeResult, blocked: ReadonlySet<RevisionChangeKey>): MergeResult {
  if (blocked.size === 0) return merged;
  return {
    ...merged,
    toRemote: merged.toRemote.filter((r) => !blocked.has(changeKey('cloud', 'insert', r.hash))),
    tombstonesToRemote: merged.tombstonesToRemote.filter((t) => !blocked.has(changeKey('cloud', 'delete', t.hash))),
    toLocal: merged.toLocal.filter((r) => !blocked.has(changeKey('device', 'insert', r.hash))),
    deleteLocalHashes: merged.deleteLocalHashes.filter((h) => !blocked.has(changeKey('device', 'delete', h))),
  };
}

export const needsRevisionReview = (rows: RevisionChangeRow[]) => rows.length > REVISION_GUARD_THRESHOLD;

const blocksKey = (userId: string, workspaceKey: string) => `skill-map-revision-blocks:${userId}:${workspaceKey}`;

export function readRememberedBlocks(userId: string, workspaceKey: string): Set<RevisionChangeKey> {
  try {
    const raw = localStorage.getItem(blocksKey(userId, workspaceKey));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function writeRememberedBlocks(userId: string, workspaceKey: string, blocks: ReadonlySet<RevisionChangeKey>): void {
  try {
    localStorage.setItem(blocksKey(userId, workspaceKey), JSON.stringify([...blocks]));
  } catch { /* storage unavailable: the rows are only blocked for this sync */ }
}
