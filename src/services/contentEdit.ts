import YAML from 'yaml';
import type { StructureFolder, StructureTree } from '../utils/folderStructure';
import { sortByTitle, titleFromMarkdown } from './workspaceParsing';
import type { LessonItem, SavedRoadmap, TestItem, TestsStructure, WorkspaceContent } from './workspaceTypes';

/** Ids are file names (`<id>.md`, `<id>.yaml`), so a new id is a safe slug; an existing id never changes. */
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,99}$/;
const RESERVED_IDS = new Set(['structure']);

export type ContentKind = 'lessons' | 'tests';

export function validateNewId(id: string, existing: Iterable<string>): string | null {
  if (!ID_PATTERN.test(id)) return 'Use letters, numbers, "-" and "_" only (at most 100 characters).';
  if (RESERVED_IDS.has(id.toLowerCase())) return `"${id}" is reserved.`;
  const lower = id.toLowerCase();
  for (const other of existing) if (other.toLowerCase() === lower) return `"${other}" already exists.`;
  return null;
}

export function slugify(text: string, fallback: string): string {
  const slug = text.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return slug || fallback;
}

/** A free id for a new item: the slug itself, else slug-2, slug-3, … */
export function suggestId(text: string, fallback: string, existing: Iterable<string>): string {
  const taken = new Set([...existing].map((id) => id.toLowerCase()));
  const base = slugify(text, fallback);
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

export function removeIdFromTree(tree: StructureTree, id: string): StructureTree {
  const walk = (folders: StructureFolder[] | undefined): StructureFolder[] | undefined => folders?.map((folder) => {
    const next: StructureFolder = { ...folder };
    if (folder.items) next.items = folder.items.filter((item) => item !== id);
    if (folder.children) next.children = walk(folder.children);
    return next;
  });
  const next: StructureTree = { ...tree };
  if (tree.items) next.items = tree.items.filter((item) => item !== id);
  if (tree.folders) next.folders = walk(tree.folders);
  return next;
}

/** Drops `id` from every node's `lessons:` or `tests:` list; null when no roadmap node linked it. Keeps comments and layout. */
export function removeRoadmapLink(yaml: string, kind: ContentKind, id: string): string | null {
  let doc: YAML.Document.Parsed;
  try {
    doc = YAML.parseDocument(yaml);
  } catch {
    return null;
  }
  if (doc.errors.length > 0) return null;
  let changed = false;
  const visit = (node: unknown): void => {
    if (YAML.isSeq(node)) { node.items.forEach(visit); return; }
    if (!YAML.isMap(node)) return;
    const links = node.get(kind, true);
    if (YAML.isSeq(links)) {
      const kept = links.items.filter((item) => !(YAML.isScalar(item) ? item.value === id : item === id));
      if (kept.length !== links.items.length) {
        changed = true;
        if (kept.length === 0) node.delete(kind);
        else links.items = kept;
      }
    }
    const children = node.get('children', true);
    if (children) visit(children);
  };
  visit(doc.contents);
  return changed ? doc.toString() : null;
}

export interface EditResult {
  content: WorkspaceContent;
  /** Roadmaps whose YAML changed (links to a deleted item removed); they must be saved too. */
  changedRoadmaps: SavedRoadmap[];
  /** Folder trees that changed and must be saved too. */
  changedStructures: ContentKind[];
}

function withoutLinks(content: WorkspaceContent, kind: ContentKind, id: string): { roadmaps: SavedRoadmap[]; changed: SavedRoadmap[] } {
  const changed: SavedRoadmap[] = [];
  const roadmaps = content.roadmaps.map((roadmap) => {
    const yaml = removeRoadmapLink(roadmap.yaml, kind, id);
    if (yaml === null) return roadmap;
    const next = { ...roadmap, yaml };
    changed.push(next);
    return next;
  });
  return { roadmaps, changed };
}

function treeHas(tree: StructureTree, id: string): boolean {
  return JSON.stringify(removeIdFromTree(tree, id)) !== JSON.stringify(tree);
}

/** Adds the lesson, or replaces the one with the same id. The id never changes, so roadmap and folder links stay valid. */
export function saveLessonInContent(content: WorkspaceContent, lesson: { id: string; content: string; updatedAt?: string }): WorkspaceContent {
  const next: LessonItem = { id: lesson.id, title: titleFromMarkdown(lesson.content, lesson.id), content: lesson.content, updatedAt: lesson.updatedAt };
  return { ...content, lessons: sortByTitle([...content.lessons.filter((item) => item.id !== lesson.id), next]) };
}

export function saveTestInContent(content: WorkspaceContent, test: TestItem): WorkspaceContent {
  return { ...content, tests: sortByTitle([...content.tests.filter((item) => item.id !== test.id), test]) };
}

export function deleteLessonFromContent(content: WorkspaceContent, id: string): EditResult {
  const links = withoutLinks(content, 'lessons', id);
  const changedStructures: ContentKind[] = treeHas(content.lessonStructure, id) ? ['lessons'] : [];
  return {
    content: {
      ...content,
      lessons: content.lessons.filter((item) => item.id !== id),
      roadmaps: links.roadmaps,
      lessonStructure: removeIdFromTree(content.lessonStructure, id),
    },
    changedRoadmaps: links.changed,
    changedStructures,
  };
}

export function deleteTestFromContent(content: WorkspaceContent, id: string): EditResult {
  const links = withoutLinks(content, 'tests', id);
  const structure = content.testsStructure;
  const next: TestsStructure = { revision: removeIdFromTree(structure.revision, id), new_tests: removeIdFromTree(structure.new_tests, id) };
  const touched = treeHas(structure.revision, id) || treeHas(structure.new_tests, id);
  return {
    content: { ...content, tests: content.tests.filter((item) => item.id !== id), roadmaps: links.roadmaps, testsStructure: next },
    changedRoadmaps: links.changed,
    changedStructures: touched ? ['tests'] : [],
  };
}

/** Roadmap nodes that link `id`, for the "this is used by N roadmaps" line in the delete dialog. */
export function countRoadmapLinks(roadmaps: SavedRoadmap[], kind: ContentKind, id: string): number {
  return roadmaps.filter((roadmap) => removeRoadmapLink(roadmap.yaml, kind, id) !== null).length;
}
