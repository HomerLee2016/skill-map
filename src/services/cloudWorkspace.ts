import type { SupabaseClient } from '@supabase/supabase-js';
import type { SavedRoadmap } from '../types';
import type { StructureTree } from '../utils/folderStructure';
import { emptyStructureTree, emptyTestsStructure, parseStructureTree, sortByTitle } from './workspaceParsing';
import type { LessonItem, TestItem, TestsStructure, WorkspaceContent } from './workspaceTypes';

type StructureKind = 'lessons' | 'tests';
type ContentTable = 'lessons' | 'tests' | 'roadmaps';

const CHUNK_SIZE = 50;

export interface ContentCounts {
  lessons: number;
  tests: number;
  roadmaps: number;
}

export function countContent(content: WorkspaceContent | null): ContentCounts {
  return {
    lessons: content?.lessons.length ?? 0,
    tests: content?.tests.length ?? 0,
    roadmaps: content?.roadmaps.length ?? 0,
  };
}

export function hasContent(counts: ContentCounts): boolean {
  return counts.lessons + counts.tests + counts.roadmaps > 0;
}

const ensured = new Set<string>();

/** Makes sure the `workspaces` row that the content rows reference exists (once per session). */
export async function ensureCloudWorkspace(client: SupabaseClient, workspaceKey: string, name: string): Promise<void> {
  if (ensured.has(workspaceKey)) return;
  const { error } = await client.from('workspaces').upsert(
    { key: workspaceKey, name: name || workspaceKey }, { onConflict: 'user_id,key' },
  );
  fail(error);
  ensured.add(workspaceKey);
}

export interface CloudWorkspaceInfo {
  key: string;
  name: string;
}

/** The placeholder row migration 20261027020000 made for rows from before workspaces existed. */
const LEGACY_KEY = 'legacy';

/** Every workspace of the signed-in user (RLS scopes the user), newest first. */
export async function listCloudWorkspaces(client: SupabaseClient): Promise<CloudWorkspaceInfo[]> {
  const { data, error } = await client.from('workspaces').select('key,name,updated_at').order('updated_at', { ascending: false });
  fail(error);
  return (data ?? []).filter((row) => row.key !== LEGACY_KEY).map((row) => ({ key: row.key as string, name: row.name as string }));
}

/** Deletes the cloud copy of one workspace: the row cascades to its lessons, tests, roadmaps, structures and revision records. */
export async function deleteCloudWorkspace(client: SupabaseClient, workspaceKey: string): Promise<void> {
  const { error } = await client.from('workspaces').delete().eq('key', workspaceKey);
  fail(error);
  ensured.delete(workspaceKey);
}

function chunk<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += CHUNK_SIZE) chunks.push(items.slice(index, index + CHUNK_SIZE));
  return chunks;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Rows are keyed by user, workspace and item, so each workspace has its own copy. */
async function upsertRows(client: SupabaseClient, workspaceKey: string, table: string, rows: object[], keyColumn: 'id' | 'kind'): Promise<void> {
  const keyed = rows.map((row) => ({ ...row, workspace_key: workspaceKey }));
  for (const part of chunk(keyed)) {
    const { error } = await client.from(table).upsert(part, { onConflict: `user_id,workspace_key,${keyColumn}` });
    fail(error);
  }
}

/** Reads one workspace of the signed-in user from the cloud; null when nothing has been uploaded for it yet. */
export async function fetchCloudWorkspace(client: SupabaseClient, workspaceKey: string): Promise<WorkspaceContent | null> {
  const [lessons, tests, roadmaps, structures] = await Promise.all([
    client.from('lessons').select('id,title,content').eq('workspace_key', workspaceKey),
    client.from('tests').select('id,title,questions').eq('workspace_key', workspaceKey),
    client.from('roadmaps').select('id,name,yaml').eq('workspace_key', workspaceKey),
    client.from('workspace_structures').select('kind,data').eq('workspace_key', workspaceKey),
  ]);
  for (const result of [lessons, tests, roadmaps, structures]) fail(result.error);

  const structureByKind = new Map((structures.data ?? []).map((row) => [row.kind as StructureKind, row.data]));
  const lessonStructure = structureByKind.has('lessons')
    ? parseStructureTree(structureByKind.get('lessons'))
    : emptyStructureTree();
  const testsRaw = structureByKind.get('tests') as Partial<TestsStructure> | undefined;
  const testsStructure: TestsStructure = testsRaw
    ? { revision: parseStructureTree(testsRaw.revision), new_tests: parseStructureTree(testsRaw.new_tests) }
    : emptyTestsStructure();

  const content: WorkspaceContent = {
    lessons: sortByTitle((lessons.data ?? []) as LessonItem[]),
    tests: sortByTitle((tests.data ?? []) as TestItem[]),
    roadmaps: (roadmaps.data ?? []) as unknown as SavedRoadmap[],
    lessonStructure,
    testsStructure,
  };
  const hasStructure = structureByKind.size > 0;
  return hasContent(countContent(content)) || hasStructure ? content : null;
}

/** Ids present in `table` for the signed-in user's workspace (RLS scopes the user). */
async function fetchIds(client: SupabaseClient, workspaceKey: string, table: ContentTable): Promise<string[]> {
  const { data, error } = await client.from(table).select('id').eq('workspace_key', workspaceKey);
  fail(error);
  return (data ?? []).map((row) => row.id as string);
}

async function deleteMissing(client: SupabaseClient, workspaceKey: string, table: ContentTable, keep: Set<string>): Promise<void> {
  const stale = (await fetchIds(client, workspaceKey, table)).filter((id) => !keep.has(id));
  for (const part of chunk(stale)) {
    const { error } = await client.from(table).delete().eq('workspace_key', workspaceKey).in('id', part);
    fail(error);
  }
}

export interface PushOptions {
  /** Also delete cloud items that are not in `content` (used by "keep this device"). */
  prune?: boolean;
}

/** Writes `content` to one workspace of the signed-in user in the cloud; local items win over cloud ones with the same id. */
export async function pushWorkspaceContent(
  client: SupabaseClient,
  workspaceKey: string,
  content: WorkspaceContent,
  { prune = false }: PushOptions = {},
): Promise<void> {
  await upsertRows(client, workspaceKey, 'lessons', content.lessons.map(({ id, title, content: body }) => ({ id, title, content: body })), 'id');
  await upsertRows(client, workspaceKey, 'tests', content.tests.map(({ id, title, questions }) => ({ id, title, questions })), 'id');
  await upsertRows(client, workspaceKey, 'roadmaps', content.roadmaps.map(({ id, name, yaml }) => ({ id, name, yaml })), 'id');
  await upsertRows(client, workspaceKey, 'workspace_structures', [
    { kind: 'lessons', data: content.lessonStructure },
    { kind: 'tests', data: content.testsStructure },
  ], 'kind');

  if (prune) {
    await deleteMissing(client, workspaceKey, 'lessons', new Set(content.lessons.map((item) => item.id)));
    await deleteMissing(client, workspaceKey, 'tests', new Set(content.tests.map((item) => item.id)));
    await deleteMissing(client, workspaceKey, 'roadmaps', new Set(content.roadmaps.map((item) => item.id)));
  }
}

export async function saveCloudRoadmap(client: SupabaseClient, workspaceKey: string, roadmap: SavedRoadmap): Promise<void> {
  await upsertRows(client, workspaceKey, 'roadmaps', [{ id: roadmap.id, name: roadmap.name, yaml: roadmap.yaml }], 'id');
}

export async function saveCloudStructure(
  client: SupabaseClient,
  workspaceKey: string,
  kind: StructureKind,
  structure: StructureTree | TestsStructure,
): Promise<void> {
  await upsertRows(client, workspaceKey, 'workspace_structures', [{ kind, data: structure }], 'kind');
}
