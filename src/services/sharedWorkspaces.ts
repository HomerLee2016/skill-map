import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureCloudWorkspace, pushWorkspaceContent, deleteCloudWorkspace } from './cloudWorkspace';
import { sanitizeSharedContent } from './sharingSnapshot';
import type { WorkspaceContent } from './workspaceTypes';

/** A published snapshot as listed in the hub (the content itself is only fetched on preview or clone). */
export interface SharedWorkspaceSummary {
  id: string;
  ownerId: string;
  sourceWorkspaceKey: string;
  name: string;
  description: string;
  ownerLabel: string;
  lessonCount: number;
  testCount: number;
  roadmapCount: number;
  publishedAt: string;
  updatedAt: string;
}

const SUMMARY_COLUMNS = 'id,owner_id,source_workspace_key,name,description,owner_label,lesson_count,test_count,roadmap_count,published_at,updated_at';

interface SummaryRow {
  id: string;
  owner_id: string;
  source_workspace_key: string;
  name: string;
  description: string;
  owner_label: string;
  lesson_count: number;
  test_count: number;
  roadmap_count: number;
  published_at: string;
  updated_at: string;
}

function toSummary(row: SummaryRow): SharedWorkspaceSummary {
  return {
    id: row.id,
    ownerId: row.owner_id,
    sourceWorkspaceKey: row.source_workspace_key,
    name: row.name,
    description: row.description ?? '',
    ownerLabel: row.owner_label || 'Anonymous',
    lessonCount: row.lesson_count,
    testCount: row.test_count,
    roadmapCount: row.roadmap_count,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Every shared workspace, newest first. The heavy `content` column is not selected. */
export async function listSharedWorkspaces(client: SupabaseClient): Promise<SharedWorkspaceSummary[]> {
  const { data, error } = await client.from('shared_workspaces').select(SUMMARY_COLUMNS).order('updated_at', { ascending: false });
  fail(error);
  return ((data ?? []) as SummaryRow[]).map(toSummary);
}

export interface PublishInput {
  sourceWorkspaceKey: string;
  name: string;
  description: string;
  ownerLabel: string;
  snapshot: WorkspaceContent;
}

/** Publishes, or re-publishes (overwrites) the snapshot of one workspace. Needs the signed-in user's id. */
export async function publishWorkspace(client: SupabaseClient, ownerId: string, input: PublishInput): Promise<void> {
  const { snapshot } = input;
  const { error } = await client.from('shared_workspaces').upsert({
    owner_id: ownerId,
    source_workspace_key: input.sourceWorkspaceKey,
    name: input.name.trim().slice(0, 200),
    description: input.description.trim().slice(0, 2000),
    owner_label: input.ownerLabel.trim().slice(0, 100) || 'Anonymous',
    lesson_count: snapshot.lessons.length,
    test_count: snapshot.tests.length,
    roadmap_count: snapshot.roadmaps.length,
    content: snapshot,
  }, { onConflict: 'owner_id,source_workspace_key' });
  fail(error);
}

export async function unpublishWorkspace(client: SupabaseClient, sharedId: string): Promise<void> {
  const { error } = await client.from('shared_workspaces').delete().eq('id', sharedId);
  fail(error);
}

/** Reads one snapshot and cleans it; shared content is never trusted as stored. */
export async function fetchSharedContent(client: SupabaseClient, sharedId: string): Promise<WorkspaceContent> {
  const { data, error } = await client.from('shared_workspaces').select('content').eq('id', sharedId).maybeSingle();
  fail(error);
  if (!data) throw new Error('This shared workspace is no longer available.');
  return sanitizeSharedContent(data.content);
}

/** A key no folder name can collide with, so a clone is always a new workspace. */
export function newWorkspaceKey(prefix: 'shared' | 'merged', random: () => string = () => crypto.randomUUID()): string {
  return `${prefix}-${random().replace(/-/g, '').slice(0, 16)}`;
}

/** Clones a snapshot into a NEW workspace of the signed-in user (cloud only; revision starts empty). Returns its key. */
export async function cloneSharedWorkspace(client: SupabaseClient, sharedId: string, name: string): Promise<{ key: string; name: string }> {
  const content = await fetchSharedContent(client, sharedId);
  const key = newWorkspaceKey('shared');
  const finalName = name.trim().slice(0, 200) || 'Shared workspace';
  await ensureCloudWorkspace(client, key, finalName);
  try {
    await pushWorkspaceContent(client, key, content);
  } catch (error) {
    // Do not leave a half-filled workspace behind.
    await deleteCloudWorkspace(client, key).catch(() => undefined);
    throw error;
  }
  return { key, name: finalName };
}
