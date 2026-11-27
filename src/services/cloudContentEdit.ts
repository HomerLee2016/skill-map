import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureCloudWorkspace, fail } from './cloudWorkspace';
import type { ContentKind } from './contentEdit';
import type { ItemRef } from './contentSync';
import { stableStringify } from './contentSync';
import type { LessonItem, TestItem } from './workspaceTypes';

/** Another device changed (or already holds a different copy of) this item since this device last saw it. */
export class ContentConflictError extends Error {
  readonly kind: ContentKind;
  readonly id: string;
  constructor(kind: ContentKind, id: string) {
    super(`This ${kind === 'lessons' ? 'lesson' : 'test'} was changed on another device. Nothing was overwritten. Sync now, then edit it again.`);
    this.name = 'ContentConflictError';
    this.kind = kind;
    this.id = id;
  }
}

const UNIQUE_VIOLATION = '23505';

function questionsText(test: TestItem): string {
  return stableStringify(test.questions);
}

/**
 * Inserts the item, or updates it only if its cloud version is still `expectedUpdatedAt` (optimistic lock on the server's
 * `updated_at`). Returns the new version. A device that never saw the cloud row (a folder it has not pulled) hits the
 * unique key: identical content is adopted, different content is a conflict instead of a silent overwrite.
 */
async function saveItem(
  client: SupabaseClient,
  workspaceKey: string,
  table: ContentKind,
  id: string,
  fields: Record<string, unknown>,
  sameAsCloud: (row: Record<string, unknown>) => boolean,
  expectedUpdatedAt: string | undefined,
): Promise<string> {
  if (expectedUpdatedAt) {
    const { data, error } = await client.from(table).update(fields)
      .eq('workspace_key', workspaceKey).eq('id', id).eq('updated_at', expectedUpdatedAt).select('updated_at');
    fail(error);
    if (data && data.length > 0) return data[0].updated_at as string;
    // No row matched the version: gone or changed. Gone is fine to recreate only if it was deleted; treat both as conflict.
    throw new ContentConflictError(table, id);
  }
  const inserted = await client.from(table).insert({ ...fields, id, workspace_key: workspaceKey }).select('updated_at');
  if (!inserted.error) return inserted.data![0].updated_at as string;
  if (inserted.error.code !== UNIQUE_VIOLATION) fail(inserted.error);
  const existing = await client.from(table).select('*').eq('workspace_key', workspaceKey).eq('id', id);
  fail(existing.error);
  const row = existing.data?.[0] as Record<string, unknown> | undefined;
  if (row && sameAsCloud(row)) return row.updated_at as string;
  throw new ContentConflictError(table, id);
}

/** Removes a tombstone because the item exists again; best effort (the table may not exist before the migration). */
export async function clearTombstone(client: SupabaseClient, workspaceKey: string, kind: ContentKind | 'roadmaps', id: string): Promise<void> {
  await client.from('content_tombstones').delete().eq('workspace_key', workspaceKey).eq('kind', kind).eq('id', id);
}

export async function saveCloudLesson(
  client: SupabaseClient, workspaceKey: string, workspaceName: string, lesson: LessonItem,
): Promise<string> {
  await ensureCloudWorkspace(client, workspaceKey, workspaceName);
  const updatedAt = await saveItem(
    client, workspaceKey, 'lessons', lesson.id, { title: lesson.title, content: lesson.content },
    (row) => row.content === lesson.content, lesson.updatedAt,
  );
  await clearTombstone(client, workspaceKey, 'lessons', lesson.id);
  return updatedAt;
}

export async function saveCloudTest(
  client: SupabaseClient, workspaceKey: string, workspaceName: string, test: TestItem,
): Promise<string> {
  await ensureCloudWorkspace(client, workspaceKey, workspaceName);
  const updatedAt = await saveItem(
    client, workspaceKey, 'tests', test.id, { title: test.title, questions: test.questions },
    (row) => stableStringify(row.questions) === questionsText(test), test.updatedAt,
  );
  await clearTombstone(client, workspaceKey, 'tests', test.id);
  return updatedAt;
}

/**
 * Deletes the cloud row and leaves a tombstone so other devices delete their copy too. With a known version the delete
 * refuses when another device changed the item meanwhile. Returns a warning when the tombstone could not be written
 * (the migration has not been run): the delete worked here but will not reach other devices.
 */
export async function deleteCloudItem(
  client: SupabaseClient, workspaceKey: string, workspaceName: string, kind: ContentKind | 'roadmaps', id: string, expectedUpdatedAt?: string,
): Promise<string | null> {
  await ensureCloudWorkspace(client, workspaceKey, workspaceName);
  let query = client.from(kind).delete().eq('workspace_key', workspaceKey).eq('id', id);
  if (expectedUpdatedAt) query = query.eq('updated_at', expectedUpdatedAt);
  const { data, error } = await query.select('id');
  fail(error);
  if (expectedUpdatedAt && (data?.length ?? 0) === 0) {
    const still = await client.from(kind).select('id').eq('workspace_key', workspaceKey).eq('id', id);
    fail(still.error);
    if ((still.data?.length ?? 0) > 0) throw new ContentConflictError(kind as ContentKind, id);
  }
  const tombstone = await client.from('content_tombstones').upsert(
    { workspace_key: workspaceKey, kind, id, deleted_at: new Date().toISOString() }, { onConflict: 'user_id,workspace_key,kind,id' },
  );
  return tombstone.error
    ? 'Deleted, but other devices will only drop their copy after the content-editing database migration is run (see supabase/README.md).'
    : null;
}

/** Items deleted in the app, as `lessons:id` refs; empty when the table does not exist yet. */
export async function fetchTombstones(client: SupabaseClient, workspaceKey: string): Promise<Set<ItemRef>> {
  const { data, error } = await client.from('content_tombstones').select('kind,id').eq('workspace_key', workspaceKey);
  if (error) return new Set();
  return new Set((data ?? []).map((row) => `${row.kind as string}:${row.id as string}`));
}
