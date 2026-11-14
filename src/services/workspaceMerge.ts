import YAML from 'yaml';
import type { StructureFolder, StructureTree } from '../utils/folderStructure';
import { emptyStructureTree, emptyTestsStructure } from './workspaceParsing';
import type { LessonItem, SavedRoadmap, TestItem, TestsStructure, WorkspaceContent } from './workspaceTypes';

export interface MergeSource {
  name: string;
  content: WorkspaceContent;
}

export interface KindReport {
  /** Items copied into the merged workspace (including renamed ones). */
  added: number;
  /** Items left out because the same one (same content) was already there. */
  duplicates: number;
  /** Items kept under a new id because another one with the same id but different content was already there. */
  renamed: number;
}

export interface MergeReport {
  lessons: KindReport;
  tests: KindReport;
  roadmaps: KindReport;
}

/** Old id -> id in the merged workspace, per source (a skipped duplicate points at the copy that was kept). */
export interface IdMaps {
  lessons: Map<string, string>;
  tests: Map<string, string>;
  /** Old test title -> title in the merged workspace; revision records carry the title of their test. */
  testTitles: Map<string, string>;
}

export interface MergeResult {
  content: WorkspaceContent;
  report: MergeReport;
  /** Same order as the sources. */
  idMaps: IdMaps[];
}

function slug(name: string): string {
  return name.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'copy';
}

function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let counter = 2;
  while (taken.has(`${base}-${counter}`)) counter += 1;
  return `${base}-${counter}`;
}

const emptyReport = (): KindReport => ({ added: 0, duplicates: 0, renamed: 0 });

/** Lessons are the same when the text is the same, ignoring trailing whitespace. */
const lessonFingerprint = (item: LessonItem) => item.content.trim();
/** Tests are the same when title and questions are. */
const testFingerprint = (item: TestItem) => JSON.stringify([item.title.trim(), item.questions]);

interface Mergeable { id: string }

/**
 * Generic de-duplicating merge of one kind of item. Items already in `kept` win; an incoming item with the
 * same content as a kept one is skipped (its id maps to the kept id); one with a different content but the
 * same id is kept under a new id, so nothing is overwritten.
 */
function mergeItems<T extends Mergeable>(
  kept: T[],
  incoming: T[],
  sourceName: string,
  fingerprint: (item: T) => string,
  rename: (item: T, id: string) => T,
  report: KindReport,
  idMap: Map<string, string>,
): void {
  const byFingerprint = new Map(kept.map((item) => [fingerprint(item), item.id]));
  const taken = new Set(kept.map((item) => item.id));
  for (const item of incoming) {
    const print = fingerprint(item);
    const same = byFingerprint.get(print);
    if (same !== undefined) {
      idMap.set(item.id, same);
      report.duplicates += 1;
      continue;
    }
    let id = item.id;
    if (taken.has(id)) {
      id = uniqueId(`${item.id}-${slug(sourceName)}`, taken);
      report.renamed += 1;
    }
    taken.add(id);
    byFingerprint.set(print, id);
    idMap.set(item.id, id);
    kept.push(id === item.id ? item : rename(item, id));
    report.added += 1;
  }
}

function mergeFolders(base: StructureFolder[], add: StructureFolder[], mapId: (id: string) => string | undefined): StructureFolder[] {
  const out = base.map((folder) => ({ name: folder.name, items: [...(folder.items ?? [])], children: [...(folder.children ?? [])] }));
  for (const folder of add) {
    const items = (folder.items ?? []).map(mapId).filter((id): id is string => id !== undefined);
    let target = out.find((candidate) => candidate.name === folder.name);
    if (!target) {
      target = { name: folder.name, items: [], children: [] };
      out.push(target);
    }
    target.items = [...new Set([...target.items, ...items])];
    target.children = mergeFolders(target.children, folder.children ?? [], mapId);
  }
  return out;
}

/** Folder trees are united by folder name; item ids are translated, and an item already placed somewhere stays there. */
export function mergeTrees(base: StructureTree, add: StructureTree, mapId: (id: string) => string | undefined): StructureTree {
  const folders = mergeFolders(base.folders ?? [], add.folders ?? [], mapId);
  const placed = new Set<string>();
  const collect = (list: StructureFolder[]) => list.forEach((folder) => { (folder.items ?? []).forEach((id) => placed.add(id)); collect(folder.children ?? []); });
  collect(base.folders ?? []);
  (base.items ?? []).forEach((id) => placed.add(id));
  const items = [...(base.items ?? [])];
  for (const id of add.items ?? []) {
    const mapped = mapId(id);
    if (mapped !== undefined && !placed.has(mapped)) { items.push(mapped); placed.add(mapped); }
  }
  // An item that is in a folder of the base tree must not also appear in a folder it was merged into.
  const seen = new Set<string>();
  const dedupe = (list: StructureFolder[]): StructureFolder[] => list.map((folder) => ({
    name: folder.name,
    items: (folder.items ?? []).filter((id) => (seen.has(id) ? false : (seen.add(id), true))),
    children: dedupe(folder.children ?? []),
  }));
  return { folders: dedupe(folders), items: items.filter((id) => !seen.has(id)) };
}

/** Points a roadmap's lesson and test links at the ids they got in the merged workspace. */
export function remapRoadmapLinks(yaml: string, lessons: Map<string, string>, tests: Map<string, string>): string {
  let changed = false;
  const remap = (list: unknown, map: Map<string, string>): unknown => {
    if (!Array.isArray(list)) return list;
    return list.map((id) => {
      const next = typeof id === 'string' ? map.get(id) : undefined;
      if (next !== undefined && next !== id) changed = true;
      return next ?? id;
    });
  };
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const record = node as Record<string, unknown>;
    if ('lessons' in record) record.lessons = remap(record.lessons, lessons);
    if ('tests' in record) record.tests = remap(record.tests, tests);
    if (Array.isArray(record.children)) record.children.forEach(visit);
  };
  try {
    const parsed = YAML.parse(yaml);
    if (Array.isArray(parsed)) parsed.forEach(visit);
    else visit(parsed);
    return changed ? YAML.stringify(parsed) : yaml;
  } catch {
    return yaml;
  }
}

/**
 * Merges the contents of two or more workspaces into one. The first source has priority; later ones add
 * what is new. Identical lessons, tests and roadmaps collapse into one; same-id-different-content ones are
 * kept side by side under a new id and a "(source name)" title, so no one's work is overwritten.
 * With `firstIsTarget` the first source is the workspace being merged into: the report only counts what the others added.
 */
export function mergeWorkspaceContents(sources: MergeSource[], { firstIsTarget = false }: { firstIsTarget?: boolean } = {}): MergeResult {
  const lessons: LessonItem[] = [];
  const tests: TestItem[] = [];
  const roadmaps: SavedRoadmap[] = [];
  const report: MergeReport = { lessons: emptyReport(), tests: emptyReport(), roadmaps: emptyReport() };
  const idMaps: IdMaps[] = [];
  let lessonStructure: StructureTree = emptyStructureTree();
  let testsStructure: TestsStructure = emptyTestsStructure();

  for (const [index, source] of sources.entries()) {
    const maps: IdMaps = { lessons: new Map(), tests: new Map(), testTitles: new Map() };
    idMaps.push(maps);
    const { content } = source;

    mergeItems(lessons, content.lessons.map((item) => ({ ...item })), source.name, lessonFingerprint,
      (item, id) => ({ ...item, id, title: `${item.title} (${source.name})` }), report.lessons, maps.lessons);
    mergeItems(tests, content.tests.map((item) => ({ ...item })), source.name, testFingerprint,
      (item, id) => ({ ...item, id, title: `${item.title} (${source.name})` }), report.tests, maps.tests);
    for (const item of content.tests) {
      const mapped = tests.find((candidate) => candidate.id === maps.tests.get(item.id));
      if (mapped && mapped.title !== item.title) maps.testTitles.set(item.title, mapped.title);
    }

    const roadmapIncoming = content.roadmaps.map((roadmap) => ({
      ...roadmap,
      yaml: remapRoadmapLinks(roadmap.yaml, maps.lessons, maps.tests),
    }));
    mergeItems(roadmaps, roadmapIncoming, source.name, (item) => item.yaml.trim(),
      (item, id) => ({ ...item, id, name: `${item.name} (${source.name})` }), report.roadmaps, new Map());

    lessonStructure = mergeTrees(lessonStructure, content.lessonStructure, (id) => maps.lessons.get(id));
    testsStructure = {
      revision: mergeTrees(testsStructure.revision, content.testsStructure.revision, (id) => maps.tests.get(id)),
      new_tests: mergeTrees(testsStructure.new_tests, content.testsStructure.new_tests, (id) => maps.tests.get(id)),
    };
    // What the target already held is not part of "what this merge did".
    if (firstIsTarget && index === 0) {
      report.lessons = emptyReport();
      report.tests = emptyReport();
      report.roadmaps = emptyReport();
    }
  }

  lessons.sort((a, b) => a.title.localeCompare(b.title));
  tests.sort((a, b) => a.title.localeCompare(b.title));
  return { content: { lessons, tests, roadmaps, lessonStructure, testsStructure }, report, idMaps };
}
