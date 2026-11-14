import YAML from 'yaml';
import type { StructureFolder, StructureTree } from '../utils/folderStructure';
import { safeExternalUrl } from '../utils/safeUrl';
import { emptyStructureTree, emptyTestsStructure, parseStructureTree } from './workspaceParsing';
import type { LessonItem, SavedRoadmap, TestItem, TestQuestion, TestsStructure, WorkspaceContent } from './workspaceTypes';

/** Which items of a workspace go into a shared snapshot. Revision records are never part of it. */
export interface ShareSelection {
  lessonIds: Set<string>;
  testIds: Set<string>;
  roadmapIds: Set<string>;
}

export const MAX_SHARED_ITEMS = 500;
const MAX_ID = 200;
const MAX_TITLE = 500;
const MAX_LESSON = 1_000_000;
const MAX_YAML = 500_000;
const MAX_QUESTIONS = 2000;
const MAX_OPTIONS = 20;
const MAX_TEXT = 5000;

function pruneFolder(folder: StructureFolder, keep: Set<string>): StructureFolder {
  return {
    name: folder.name,
    items: (folder.items ?? []).filter((id) => keep.has(id)),
    children: (folder.children ?? []).map((child) => pruneFolder(child, keep)),
  };
}

/** Keeps the folder layout but only the ticked items, so the clone is not full of ids that are not there. */
export function pruneStructureTree(tree: StructureTree, keep: Set<string>): StructureTree {
  return {
    folders: (tree.folders ?? []).map((folder) => pruneFolder(folder, keep)),
    items: (tree.items ?? []).filter((id) => keep.has(id)),
  };
}

/** The snapshot content for the ticked items (a copy; later edits to the workspace do not change it). */
export function buildSnapshot(content: WorkspaceContent, selection: ShareSelection): WorkspaceContent {
  const lessons = content.lessons.filter((item) => selection.lessonIds.has(item.id));
  const tests = content.tests.filter((item) => selection.testIds.has(item.id));
  const roadmaps = content.roadmaps.filter((item) => selection.roadmapIds.has(item.id));
  const lessonIds = new Set(lessons.map((item) => item.id));
  const testIds = new Set(tests.map((item) => item.id));
  return {
    lessons: lessons.map(({ id, title, content: body }) => ({ id, title, content: body })),
    tests: tests.map(({ id, title, questions }) => ({ id, title, questions })),
    roadmaps: roadmaps.map(({ id, name, yaml }) => ({ id, name, yaml })),
    lessonStructure: pruneStructureTree(content.lessonStructure, lessonIds),
    testsStructure: {
      revision: pruneStructureTree(content.testsStructure.revision, testIds),
      new_tests: pruneStructureTree(content.testsStructure.new_tests, testIds),
    },
  };
}

// --- sanitising: shared content is written by strangers, so it is cleaned on clone as well as on render ---

/** Control characters other than tab and newline. */
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(CONTROL_CHARS, '').slice(0, max) : '';
}

/** Ids come from file names; keep letters (any script), digits and `._ -`, and never a prototype key. */
export function cleanId(value: unknown): string {
  const id = cleanText(value, MAX_ID).trim().replace(/[^\p{L}\p{N}._ -]/gu, '-');
  return id && !['__proto__', 'constructor', 'prototype'].includes(id) ? id : '';
}

const DANGEROUS_TAGS = /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|base|form|frame|frameset|applet|svg|math)\b[^>]*>/gi;
const SCRIPT_BLOCK = /<\s*(script|style|iframe|object|embed|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi;
const EVENT_ATTRIBUTE = /\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi;
const SCRIPT_URL = /\b(href|src|xlink:href|action|formaction)\s*=\s*(["']?)\s*(javascript|vbscript|data)\s*:[^"'\s>]*\2/gi;
const SCRIPT_MD_LINK = /\]\(\s*(javascript|vbscript|data)\s*:[^)]*\)/gi;

/** Defence in depth for lesson markdown: the lesson view also sanitises, so this only removes what can never be wanted. */
export function sanitizeLessonMarkdown(markdown: string): string {
  let current = markdown.replace(CONTROL_CHARS, '');
  for (let pass = 0; pass < 5; pass += 1) {
    const next = current
      .replace(SCRIPT_BLOCK, '')
      .replace(DANGEROUS_TAGS, '')
      .replace(EVENT_ATTRIBUTE, '')
      .replace(SCRIPT_URL, '')
      .replace(SCRIPT_MD_LINK, '](#)');
    if (next === current) break;
    current = next;
  }
  return current;
}

function sanitizeLessons(raw: unknown): LessonItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: LessonItem[] = [];
  for (const entry of raw.slice(0, MAX_SHARED_ITEMS)) {
    const item = entry as Partial<LessonItem> | null;
    const id = cleanId(item?.id);
    if (!id || seen.has(id) || typeof item?.content !== 'string') continue;
    seen.add(id);
    out.push({
      id,
      title: cleanText(item.title, MAX_TITLE).trim() || id,
      content: sanitizeLessonMarkdown(item.content.slice(0, MAX_LESSON)),
    });
  }
  return out;
}

function sanitizeQuestions(raw: unknown): TestQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: TestQuestion[] = [];
  for (const entry of raw.slice(0, MAX_QUESTIONS)) {
    const q = entry as Partial<TestQuestion> | null;
    if (!q || typeof q.question !== 'string' || !Array.isArray(q.options)) continue;
    const options = q.options.filter((option): option is string => typeof option === 'string').slice(0, MAX_OPTIONS).map((option) => cleanText(option, MAX_TEXT));
    const correct = cleanText(q.correct_answer, MAX_TEXT);
    if (options.length === 0 || !correct) continue;
    const question: TestQuestion = {
      question_number: Number.isFinite(q.question_number) ? Number(q.question_number) : out.length + 1,
      question: cleanText(q.question, MAX_TEXT),
      options,
      correct_answer: correct,
    };
    if (typeof q.explanation === 'string') question.explanation = cleanText(q.explanation, MAX_TEXT);
    out.push(question);
  }
  return out;
}

function sanitizeTests(raw: unknown): TestItem[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: TestItem[] = [];
  for (const entry of raw.slice(0, MAX_SHARED_ITEMS)) {
    const item = entry as Partial<TestItem> | null;
    const id = cleanId(item?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title: cleanText(item?.title, MAX_TITLE).trim() || id, questions: sanitizeQuestions(item?.questions) });
  }
  return out;
}

const NODE_TEXT_FIELDS = ['label', 'description'] as const;

function sanitizeIdList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map(cleanId).filter(Boolean);
}

/** Rebuilds a roadmap node from the fields the app knows, so nothing else in the stranger's YAML survives. */
function sanitizeNode(raw: unknown, resetFinished: boolean, depth = 0): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || depth > 30) return null;
  const node = raw as Record<string, unknown>;
  const id = cleanId(typeof node.id === 'number' ? String(node.id) : node.id);
  if (!id) return null;
  const out: Record<string, unknown> = { id };
  for (const field of NODE_TEXT_FIELDS) {
    if (node[field] !== undefined) out[field] = cleanText(typeof node[field] === 'number' ? String(node[field]) : node[field], MAX_TEXT);
  }
  const subTreeId = cleanId(node.subTreeId);
  if (subTreeId) out.subTreeId = subTreeId;
  for (const field of ['x', 'y'] as const) {
    if (typeof node[field] === 'number' && Number.isFinite(node[field])) out[field] = node[field];
  }
  if (typeof node.finished === 'boolean') out.finished = resetFinished ? false : node.finished;
  const url = safeExternalUrl(node.url);
  if (url) out.url = url;
  for (const field of ['lessons', 'tests', 'dependsOn'] as const) {
    const list = sanitizeIdList(node[field]);
    if (list) out[field] = list;
  }
  if (Array.isArray(node.children)) {
    out.children = node.children.map((child) => sanitizeNode(child, resetFinished, depth + 1)).filter(Boolean);
  }
  return out;
}

/** Re-serialises a roadmap from whitelisted fields; null when the YAML is not a roadmap at all. */
export function sanitizeRoadmapYaml(yaml: string, resetFinished = false): string | null {
  if (yaml.length > MAX_YAML) return null;
  let parsed: unknown;
  try {
    parsed = YAML.parse(yaml);
  } catch {
    return null;
  }
  if (Array.isArray(parsed)) {
    const nodes = parsed.slice(0, 2000).map((node) => sanitizeNode(node, resetFinished)).filter(Boolean);
    return nodes.length > 0 ? YAML.stringify(nodes) : null;
  }
  const node = sanitizeNode(parsed, resetFinished);
  return node ? YAML.stringify(node) : null;
}

function sanitizeRoadmaps(raw: unknown, resetFinished: boolean): SavedRoadmap[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: SavedRoadmap[] = [];
  for (const entry of raw.slice(0, MAX_SHARED_ITEMS)) {
    const item = entry as Partial<SavedRoadmap> | null;
    const id = cleanId(item?.id);
    if (!id || seen.has(id) || typeof item?.yaml !== 'string') continue;
    const yaml = sanitizeRoadmapYaml(item.yaml, resetFinished);
    if (!yaml) continue;
    seen.add(id);
    out.push({ id, name: cleanText(item.name, MAX_TITLE).trim() || id, yaml });
  }
  return out;
}

function sanitizeFolder(raw: unknown, depth: number): StructureFolder | null {
  if (!raw || typeof raw !== 'object' || depth > 12) return null;
  const folder = raw as StructureFolder;
  const name = cleanText(folder.name, 200).trim();
  if (!name) return null;
  return {
    name,
    items: Array.isArray(folder.items) ? folder.items.map(cleanId).filter(Boolean) : [],
    children: Array.isArray(folder.children)
      ? folder.children.map((child) => sanitizeFolder(child, depth + 1)).filter((child): child is StructureFolder => child !== null)
      : [],
  };
}

function sanitizeTree(raw: unknown): StructureTree {
  const tree = parseStructureTree(raw);
  return {
    folders: (tree.folders ?? []).map((folder) => sanitizeFolder(folder, 0)).filter((folder): folder is StructureFolder => folder !== null),
    items: (tree.items ?? []).map(cleanId).filter(Boolean),
  };
}

/** Turns whatever the shared row holds into well-formed workspace content; anything unexpected is dropped. A clone starts with every roadmap node unfinished: those ticks are the owner's progress. */
export function sanitizeSharedContent(raw: unknown, { resetProgress = true }: { resetProgress?: boolean } = {}): WorkspaceContent {
  if (!raw || typeof raw !== 'object') {
    return { lessons: [], tests: [], roadmaps: [], lessonStructure: emptyStructureTree(), testsStructure: emptyTestsStructure() };
  }
  const source = raw as Record<string, unknown>;
  const testsRaw = (source.testsStructure && typeof source.testsStructure === 'object' ? source.testsStructure : {}) as Partial<TestsStructure>;
  return {
    lessons: sanitizeLessons(source.lessons),
    tests: sanitizeTests(source.tests),
    roadmaps: sanitizeRoadmaps(source.roadmaps, resetProgress),
    lessonStructure: sanitizeTree(source.lessonStructure),
    testsStructure: { revision: sanitizeTree(testsRaw.revision), new_tests: sanitizeTree(testsRaw.new_tests) },
  };
}

/** Selection with every item of the workspace ticked. */
export function selectAll(content: WorkspaceContent): ShareSelection {
  return {
    lessonIds: new Set(content.lessons.map((item) => item.id)),
    testIds: new Set(content.tests.map((item) => item.id)),
    roadmapIds: new Set(content.roadmaps.map((item) => item.id)),
  };
}

export function countSelection(selection: ShareSelection): number {
  return selection.lessonIds.size + selection.testIds.size + selection.roadmapIds.size;
}
