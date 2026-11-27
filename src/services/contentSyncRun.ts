import type { SupabaseClient } from '@supabase/supabase-js';
import { deleteCloudItem, fetchTombstones } from './cloudContentEdit';
import { findReviewItems, resolveReview, withoutReviewItems, type ReviewItem } from './contentReview';
import { fetchCloudWorkspace, upsertRows } from './cloudWorkspace';
import { deleteContentFile, trashContentFile, writeLessonFile, writeTestFile } from './workspaceContentFiles';
import {
  applyPlanToBase, hashContent, planContentSync, readContentBase, writeContentBase,
  type ItemRef, type Hashes,
} from './contentSync';
import { writeWorkspaceRoadmapFile } from './workspaceRoadmapPersistence';
import { writeWorkspaceStructureFile } from './workspaceStructurePersistence';
import { emptyStructureTree, emptyTestsStructure } from './workspaceParsing';
import type { WorkspaceContent } from './workspaceTypes';

export type ConflictChoice = 'cloud' | 'device';

export interface ContentSyncResult {
  /** This device's content after the sync (pulled items in, deleted items out). */
  content: WorkspaceContent;
  /** Items changed on both sides; nothing was overwritten. */
  conflicts: ItemRef[];
  /** Items pulled in or removed, i.e. whether the screen needs the new content. */
  changed: boolean;
  /** Cloud versions (`updated_at`) of lessons and tests, so later in-app saves can tell if another device changed them. */
  versions: Record<ItemRef, string>;
  /** Pulled or deleted items that could not be written to the folder (retried by the next sync). */
  folderFailures: ItemRef[];
}

const emptyContent = (): WorkspaceContent => ({
  lessons: [], tests: [], roadmaps: [], lessonStructure: emptyStructureTree(), testsStructure: emptyTestsStructure(),
});

function splitRef(ref: ItemRef): [string, string] {
  const index = ref.indexOf(':');
  return [ref.slice(0, index), ref.slice(index + 1)];
}

async function pushRefs(client: SupabaseClient, workspaceKey: string, local: WorkspaceContent, refs: ItemRef[]): Promise<void> {
  const lessons = []; const tests = []; const roadmaps = []; const structures = [];
  for (const ref of refs) {
    const [kind, id] = splitRef(ref);
    if (kind === 'lessons') { const item = local.lessons.find((x) => x.id === id); if (item) lessons.push({ id, title: item.title, content: item.content }); }
    else if (kind === 'tests') { const item = local.tests.find((x) => x.id === id); if (item) tests.push({ id, title: item.title, questions: item.questions }); }
    else if (kind === 'roadmaps') { const item = local.roadmaps.find((x) => x.id === id); if (item) roadmaps.push({ id, name: item.name, yaml: item.yaml }); }
    else if (kind === 'structure') structures.push({ kind: id, data: id === 'lessons' ? local.lessonStructure : local.testsStructure });
  }
  if (lessons.length) await upsertRows(client, workspaceKey, 'lessons', lessons, 'id');
  if (tests.length) await upsertRows(client, workspaceKey, 'tests', tests, 'id');
  if (roadmaps.length) await upsertRows(client, workspaceKey, 'roadmaps', roadmaps, 'id');
  if (structures.length) await upsertRows(client, workspaceKey, 'workspace_structures', structures, 'kind');
}

/** Copies the cloud's version of each ref into `local` (and the folder); returns the refs that could not be written to the folder. */
async function pullRefs(
  cloud: WorkspaceContent, local: WorkspaceContent, refs: ItemRef[], handle: FileSystemDirectoryHandle | null,
): Promise<{ content: WorkspaceContent; failed: ItemRef[] }> {
  let content = local;
  const failed: ItemRef[] = [];
  for (const ref of refs) {
    const [kind, id] = splitRef(ref);
    let ok = true;
    if (kind === 'lessons') {
      const item = cloud.lessons.find((x) => x.id === id);
      if (!item) continue;
      if (handle) ok = await writeLessonFile(handle, id, item.content);
      if (ok) content = { ...content, lessons: [...content.lessons.filter((x) => x.id !== id), item] };
    } else if (kind === 'tests') {
      const item = cloud.tests.find((x) => x.id === id);
      if (!item) continue;
      if (handle) ok = await writeTestFile(handle, item);
      if (ok) content = { ...content, tests: [...content.tests.filter((x) => x.id !== id), item] };
    } else if (kind === 'roadmaps') {
      const item = cloud.roadmaps.find((x) => x.id === id);
      if (!item) continue;
      if (handle) ok = await writeWorkspaceRoadmapFile(handle, item);
      if (ok) content = { ...content, roadmaps: [...content.roadmaps.filter((x) => x.id !== id), item] };
    } else if (kind === 'structure') {
      const tree = id === 'lessons' ? cloud.lessonStructure : cloud.testsStructure;
      if (handle) ok = await writeWorkspaceStructureFile(handle, id as 'lessons' | 'tests', tree);
      if (ok) content = id === 'lessons' ? { ...content, lessonStructure: cloud.lessonStructure } : { ...content, testsStructure: cloud.testsStructure };
    }
    if (!ok) failed.push(ref);
  }
  content = { ...content, lessons: [...content.lessons].sort(byTitle), tests: [...content.tests].sort(byTitle) };
  return { content, failed };
}

const byTitle = (a: { title: string }, b: { title: string }) => a.title.localeCompare(b.title);

async function dropRefs(local: WorkspaceContent, refs: ItemRef[], handle: FileSystemDirectoryHandle | null, trash = false): Promise<{ content: WorkspaceContent; failed: ItemRef[] }> {
  let content = local;
  const failed: ItemRef[] = [];
  for (const ref of refs) {
    const [kind, id] = splitRef(ref);
    if (kind !== 'lessons' && kind !== 'tests' && kind !== 'roadmaps') continue;
    if (handle && !(await (trash ? trashContentFile : deleteContentFile)(handle, kind, id))) { failed.push(ref); continue; }
    if (kind === 'lessons') content = { ...content, lessons: content.lessons.filter((x) => x.id !== id) };
    else if (kind === 'tests') content = { ...content, tests: content.tests.filter((x) => x.id !== id) };
    else content = { ...content, roadmaps: content.roadmaps.filter((x) => x.id !== id) };
  }
  return { content, failed };
}

function collectVersions(cloud: WorkspaceContent, local: WorkspaceContent): Record<ItemRef, string> {
  const hashesLocal = hashContent(local);
  const hashesCloud = hashContent(cloud);
  const versions: Record<ItemRef, string> = {};
  for (const item of cloud.lessons) if (item.updatedAt && hashesLocal[`lessons:${item.id}`] === hashesCloud[`lessons:${item.id}`]) versions[`lessons:${item.id}`] = item.updatedAt;
  for (const item of cloud.tests) if (item.updatedAt && hashesLocal[`tests:${item.id}`] === hashesCloud[`tests:${item.id}`]) versions[`tests:${item.id}`] = item.updatedAt;
  return versions;
}

/**
 * Two-way sync of a workspace that has local content: copies only what changed on one side, applies deletes made in the
 * app on another device, and reports items changed on both sides instead of overwriting them (see `contentSync.ts`).
 */
export async function runContentSync(input: {
  client: SupabaseClient; userId: string; workspaceKey: string; local: WorkspaceContent; handle: FileSystemDirectoryHandle | null;
  /** Asked when lessons or tests exist on one side only; returns the refs to keep, or `null` to leave them all alone. */
  review?: (items: ReviewItem[]) => Promise<ReadonlySet<ItemRef> | null>;
  /** Needed to remove cloud-only items the user did not keep. */
  workspaceName?: string;
}): Promise<ContentSyncResult> {
  const { client, userId, workspaceKey, handle } = input;
  const cloud = (await fetchCloudWorkspace(client, workspaceKey)) ?? emptyContent();
  const tombstoned = await fetchTombstones(client, workspaceKey);
  const base0 = readContentBase(userId, workspaceKey);
  let plan = planContentSync({ local: hashContent(input.local), cloud: hashContent(cloud), tombstoned, base: base0 });

  const reviewItems = input.review ? findReviewItems(plan, input.local, cloud, base0) : [];
  let removeFromDevice: ItemRef[] = [];
  if (reviewItems.length > 0 && input.review) {
    plan = withoutReviewItems(plan, reviewItems);
    const keep = await input.review(reviewItems);
    if (keep) {
      const outcome = resolveReview(reviewItems, keep);
      plan = { ...plan, push: [...plan.push, ...outcome.push], pull: [...plan.pull, ...outcome.pull] };
      removeFromDevice = outcome.removeFromDevice;
      for (const ref of outcome.removeFromCloud) {
        const [kind, id] = splitRef(ref);
        await deleteCloudItem(client, workspaceKey, input.workspaceName ?? workspaceKey, kind as 'lessons' | 'tests' | 'roadmaps', id);
      }
    }
  }

  let content = input.local;
  if (plan.push.length) await pushRefs(client, workspaceKey, content, plan.push);
  const pulled = await pullRefs(cloud, content, plan.pull, handle);
  content = pulled.content;
  const dropped = await dropRefs(content, plan.deleteLocal, handle);
  content = dropped.content;
  const trashed = await dropRefs(content, removeFromDevice, handle, true);
  content = trashed.content;

  const folderFailures = [...pulled.failed, ...dropped.failed, ...trashed.failed];
  // Items that could not be written to the folder stay out of the base, so the next sync tries them again.
  const settled = { ...plan, pull: plan.pull.filter((ref) => !pulled.failed.includes(ref)), push: plan.push };
  const base = applyPlanToBase(settled, hashContent(content));
  for (const ref of plan.deleteLocal) if (!dropped.failed.includes(ref)) delete base[ref];
  writeContentBase(userId, workspaceKey, base);

  // The server stamps pushed rows with a new version; read it back so in-app saves can detect other devices' edits.
  const latest = plan.push.length ? ((await fetchCloudWorkspace(client, workspaceKey)) ?? cloud) : cloud;
  return {
    content,
    conflicts: plan.conflicts,
    changed: plan.pull.length > 0 || plan.deleteLocal.length > 0 || removeFromDevice.length > 0,
    versions: collectVersions(latest, content),
    folderFailures,
  };
}

/** Settles one conflict: the cloud's version (or its deletion) wins here, or this device's version is uploaded. */
export async function resolveContentConflict(input: {
  client: SupabaseClient; userId: string; workspaceKey: string; local: WorkspaceContent; handle: FileSystemDirectoryHandle | null;
  ref: ItemRef; choice: ConflictChoice;
}): Promise<WorkspaceContent> {
  const { client, userId, workspaceKey, local, handle, ref, choice } = input;
  const cloud = (await fetchCloudWorkspace(client, workspaceKey)) ?? emptyContent();
  const [kind, id] = splitRef(ref);
  const inCloud = hashContent(cloud)[ref] !== undefined;
  let content = local;
  if (choice === 'device') {
    await pushRefs(client, workspaceKey, local, [ref]);
    if (kind === 'lessons' || kind === 'tests' || kind === 'roadmaps') {
      await client.from('content_tombstones').delete().eq('workspace_key', workspaceKey).eq('kind', kind).eq('id', id);
    }
  } else if (inCloud) {
    content = (await pullRefs(cloud, local, [ref], handle)).content;
  } else {
    content = (await dropRefs(local, [ref], handle)).content;
  }
  const base = readContentBase(userId, workspaceKey) ?? ({} as Hashes);
  const hash = hashContent(content)[ref];
  if (hash === undefined) delete base[ref]; else base[ref] = hash;
  writeContentBase(userId, workspaceKey, base);
  return content;
}
