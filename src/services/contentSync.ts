import YAML from 'yaml';
import type { StructureTree } from '../utils/folderStructure';
import type { TestItem, WorkspaceContent } from './workspaceTypes';

/**
 * Safe content sync for a workspace that has a local folder (or import) AND a cloud copy.
 *
 * The old sync was a blind upsert: whatever the folder held overwrote the cloud, so a lesson edited on a phone
 * was lost the next time the PC synced. Each item is now compared three ways: this device's copy, the cloud copy,
 * and the "base" (the version both sides agreed on at the last sync, kept per device). Only the side that changed
 * is copied; if both changed, nothing is overwritten and the item is reported as a conflict.
 * Deletes come only from tombstones written by in-app deletes, never from a file merely missing from the folder
 * (an unreadable folder looks empty, and must not wipe the cloud).
 */

/** `lessons:id`, `tests:id`, `roadmaps:id`, `structure:lessons`, `structure:tests`. */
export type ItemRef = string;
export type Hashes = Record<ItemRef, string>;

export interface ContentPlan {
  /** Local is newer or new: upload. */
  push: ItemRef[];
  /** Cloud is newer or new: copy into this device. */
  pull: ItemRef[];
  /** Deleted in the app on another device and unchanged here: delete here too. */
  deleteLocal: ItemRef[];
  /** Changed (or deleted) on both sides: left alone until the user chooses. */
  conflicts: ItemRef[];
  /** What both sides agree on afterwards; conflicts keep their old base. */
  base: Hashes;
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record).filter((key) => record[key] !== undefined).sort();
    return `{${entries.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** A short string hash (djb2 over both halves); collisions only cost a missed sync of one item, so a strong hash is not needed. */
export function hashText(text: string): string {
  let a = 5381;
  let b = 52711;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    a = ((a << 5) + a + code) | 0;
    b = ((b << 5) + b) ^ code;
    b |= 0;
  }
  return `${(a >>> 0).toString(36)}${(b >>> 0).toString(36)}${text.length.toString(36)}`;
}

function canonicalTest(test: TestItem): unknown {
  return {
    title: test.title,
    questions: test.questions.map((question) => ({
      question: question.question,
      options: question.options,
      correct_answer: question.correct_answer,
      explanation: question.explanation || undefined,
      audio_track_url: question.audio_track_url || undefined,
    })),
  };
}

function canonicalTree(tree: StructureTree): unknown {
  return { folders: tree.folders ?? [], items: tree.items ?? [] };
}

function roadmapKey(yaml: string): string {
  try {
    return stableStringify(YAML.parse(yaml));
  } catch {
    return yaml.trim();
  }
}

/** One hash per syncable item, equal for equal content however the two sides formatted it. */
export function hashContent(content: WorkspaceContent): Hashes {
  const hashes: Hashes = {};
  for (const lesson of content.lessons) hashes[`lessons:${lesson.id}`] = hashText(lesson.content);
  for (const test of content.tests) hashes[`tests:${test.id}`] = hashText(stableStringify(canonicalTest(test)));
  for (const roadmap of content.roadmaps) hashes[`roadmaps:${roadmap.id}`] = hashText(roadmapKey(roadmap.yaml));
  hashes['structure:lessons'] = hashText(stableStringify(canonicalTree(content.lessonStructure)));
  hashes['structure:tests'] = hashText(stableStringify({
    revision: canonicalTree(content.testsStructure.revision),
    new_tests: canonicalTree(content.testsStructure.new_tests),
  }));
  return hashes;
}

/**
 * `base` is null the first time this device syncs a workspace with this version of the app. Before it, the folder
 * always won, so that is kept once (local wins) and the base is recorded; after it, differing items are conflicts.
 */
export function planContentSync(input: { local: Hashes; cloud: Hashes; tombstoned: Set<ItemRef>; base: Hashes | null }): ContentPlan {
  const { local, cloud, tombstoned, base } = input;
  const plan: ContentPlan = { push: [], pull: [], deleteLocal: [], conflicts: [], base: {} };
  const refs = new Set([...Object.keys(local), ...Object.keys(cloud)]);
  for (const ref of refs) {
    const here = local[ref];
    const there = cloud[ref];
    const known = base?.[ref];
    if (here !== undefined && there === undefined && tombstoned.has(ref)) {
      if (known === here) plan.deleteLocal.push(ref);
      else plan.conflicts.push(ref);
      continue;
    }
    if (here !== undefined && there === undefined) { plan.push.push(ref); continue; }
    if (here === undefined && there !== undefined) { plan.pull.push(ref); continue; }
    if (here === there) { plan.base[ref] = here; continue; }
    if (base === null) plan.push.push(ref);
    else if (known === there) plan.push.push(ref);
    else if (known === here) plan.pull.push(ref);
    else plan.conflicts.push(ref);
  }
  // Conflicts stay conflicts until resolved: keep what the base said (or nothing).
  for (const ref of plan.conflicts) if (base?.[ref] !== undefined) plan.base[ref] = base[ref];
  return plan;
}

/** After a plan has been applied the pushed and pulled items agree on both sides: record them as the new base. */
export function applyPlanToBase(plan: ContentPlan, final: Hashes): Hashes {
  const next = { ...plan.base };
  for (const ref of [...plan.push, ...plan.pull]) if (final[ref] !== undefined) next[ref] = final[ref];
  return next;
}

const baseStorageKey = (userId: string, workspaceKey: string) => `skill-map-content-base:${userId}:${workspaceKey}`;

export function readContentBase(userId: string, workspaceKey: string): Hashes | null {
  try {
    const raw = localStorage.getItem(baseStorageKey(userId, workspaceKey));
    return raw ? (JSON.parse(raw) as Hashes) : null;
  } catch {
    return null;
  }
}

export function writeContentBase(userId: string, workspaceKey: string, base: Hashes): void {
  try {
    localStorage.setItem(baseStorageKey(userId, workspaceKey), JSON.stringify(base));
  } catch { /* storage unavailable: the next sync falls back to "local wins" for differing items */ }
}

export function describeRef(ref: ItemRef): string {
  const [kind, id] = ref.split(':');
  if (kind === 'structure') return `${id} folders`;
  return `${kind === 'lessons' ? 'lesson' : kind === 'tests' ? 'test' : 'roadmap'} "${id}"`;
}
