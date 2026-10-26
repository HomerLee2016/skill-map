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

function chunk<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += CHUNK_SIZE) chunks.push(items.slice(index, index + CHUNK_SIZE));
  return chunks;
}

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function upsertRows(client: SupabaseClient, table: string, rows: object[], onConflict: string): Promise<void> {
  for (const part of chunk(rows)) {
    const { error } = await client.from(table).upsert(part, { onConflict });
    fail(error);
  }
}

/** Reads the signed-in user's cloud workspace; null when nothing has been uploaded yet. */
export async function fetchCloudWorkspace(client: SupabaseClient): Promise<WorkspaceContent | null> {
  const [lessons, tests, roadmaps, structures] = await Promise.all([
    client.from('lessons').select('id,title,content'),
    client.from('tests').select('id,title,questions'),
    client.from('roadmaps').select('id,name,yaml'),
    client.from('workspace_structures').select('kind,data'),
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

/** Ids present in `table` for the signed-in user (RLS scopes the query). */
async function fetchIds(client: SupabaseClient, table: ContentTable): Promise<string[]> {
  const { data, error } = await client.from(table).select('id');
  fail(error);
  return (data ?? []).map((row) => row.id as string);
}

async function deleteMissing(client: SupabaseClient, table: ContentTable, keep: Set<string>): Promise<void> {
  const stale = (await fetchIds(client, table)).filter((id) => !keep.has(id));
  for (const part of chunk(stale)) {
    const { error } = await client.from(table).delete().in('id', part);
    fail(error);
  }
}

export interface PushOptions {
  /** Also delete cloud items that are not in `content` (used by "keep this device"). */
  prune?: boolean;
}

/** Writes `content` to the signed-in user's cloud workspace; local items win over cloud ones with the same id. */
export async function pushWorkspaceContent(
  client: SupabaseClient,
  content: WorkspaceContent,
  { prune = false }: PushOptions = {},
): Promise<void> {
  await upsertRows(client, 'lessons', content.lessons.map(({ id, title, content: body }) => ({ id, title, content: body })), 'user_id,id');
  await upsertRows(client, 'tests', content.tests.map(({ id, title, questions }) => ({ id, title, questions })), 'user_id,id');
  await upsertRows(client, 'roadmaps', content.roadmaps.map(({ id, name, yaml }) => ({ id, name, yaml })), 'user_id,id');
  await upsertRows(client, 'workspace_structures', [
    { kind: 'lessons', data: content.lessonStructure },
    { kind: 'tests', data: content.testsStructure },
  ], 'user_id,kind');

  if (prune) {
    await deleteMissing(client, 'lessons', new Set(content.lessons.map((item) => item.id)));
    await deleteMissing(client, 'tests', new Set(content.tests.map((item) => item.id)));
    await deleteMissing(client, 'roadmaps', new Set(content.roadmaps.map((item) => item.id)));
  }
}

export async function saveCloudRoadmap(client: SupabaseClient, roadmap: SavedRoadmap): Promise<void> {
  await upsertRows(client, 'roadmaps', [{ id: roadmap.id, name: roadmap.name, yaml: roadmap.yaml }], 'user_id,id');
}

export async function saveCloudStructure(
  client: SupabaseClient,
  kind: StructureKind,
  structure: StructureTree | TestsStructure,
): Promise<void> {
  await upsertRows(client, 'workspace_structures', [{ kind, data: structure }], 'user_id,kind');
}
