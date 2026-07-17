import YAML from 'yaml';
import {
  collectTreeIds,
  emptyStructureTree,
  flattenTreePickerOptions,
  resolveStructureTree,
  uniquePickerOptions,
  type StructureTree,
  type TestsStructureFile,
  type PickerOption,
  type ResolvedTree,
} from './folderStructure';

export type { StructureTree, PickerOption } from './folderStructure';
export { addFolderToTree, assignItemToTree, listFolderPaths, pathToSegments } from './folderStructure';

export interface LessonItem {
  id: string;
  title: string;
  content: string;
}

export interface TestQuestion {
  question_number: number;
  question: string;
  options: string[];
  correct_answer: string;
}

export interface TestItem {
  id: string;
  title: string;
  questions: TestQuestion[];
}

const lessonModules = import.meta.glob('../data/lessons/*.md', { query: '?raw', eager: true });
const testModules = import.meta.glob('../data/tests/*.yaml', { query: '?raw', eager: true });
const lessonStructureModules = import.meta.glob('../data/lessons/structure.yaml', {
  query: '?raw',
  eager: true,
});
const testStructureModules = import.meta.glob('../data/tests/structure.yaml', {
  query: '?raw',
  eager: true,
});

function rawContent(module: unknown): string {
  return typeof module === 'string' ? module : (module as { default: string }).default;
}

function firstRaw(modules: Record<string, unknown>): string {
  const entry = Object.values(modules)[0];
  return entry ? rawContent(entry) : '';
}

export function titleFromMarkdown(content: string, id: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || id.replace(/[-_]/g, ' ');
}

export const lessons: LessonItem[] = Object.entries(lessonModules)
  .map(([path, module]) => {
    const content = rawContent(module);
    const id = path.split('/').pop()?.replace('.md', '') || 'untitled';
    return { id, title: titleFromMarkdown(content, id), content };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

export const tests: TestItem[] = Object.entries(testModules)
  .filter(([path]) => {
    const file = path.split('/').pop() || '';
    return file.endsWith('.yaml') && file !== 'structure.yaml';
  })
  .map(([path, module]) => {
    const content = rawContent(module);
    const id = path.split('/').pop()?.replace('.yaml', '') || 'untitled';
    try {
      const parsed = YAML.parse(content) as {
        quiz_title?: string;
        questions?: TestQuestion[];
      };
      return {
        id,
        title: parsed.quiz_title || id.replace(/[-_]/g, ' '),
        questions: parsed.questions || [],
      };
    } catch {
      return { id, title: id.replace(/[-_]/g, ' '), questions: [] };
    }
  })
  .sort((a, b) => a.title.localeCompare(b.title));

function parseStructureTree(raw: unknown): StructureTree {
  if (!raw || typeof raw !== 'object') return emptyStructureTree();
  const obj = raw as StructureTree;
  return {
    folders: Array.isArray(obj.folders) ? obj.folders : [],
    items: Array.isArray(obj.items) ? obj.items : [],
  };
}

function loadLessonStructure(): StructureTree {
  const raw = firstRaw(lessonStructureModules);
  if (!raw) return emptyStructureTree();
  try {
    return parseStructureTree(YAML.parse(raw));
  } catch {
    return emptyStructureTree();
  }
}

function loadTestsStructure(): { revision: StructureTree; new_tests: StructureTree } {
  const raw = firstRaw(testStructureModules);
  if (!raw) {
    return { revision: emptyStructureTree(), new_tests: emptyStructureTree() };
  }
  try {
    const parsed = YAML.parse(raw) as TestsStructureFile;
    return {
      revision: parseStructureTree(parsed.revision),
      new_tests: parseStructureTree(parsed.new_tests),
    };
  } catch {
    return { revision: emptyStructureTree(), new_tests: emptyStructureTree() };
  }
}

const lessonStructureData = loadLessonStructure();
const testsStructureData = loadTestsStructure();

export function getInitialLessonStructure(): StructureTree {
  return structuredClone(lessonStructureData);
}

export function getInitialTestsStructure(): { revision: StructureTree; new_tests: StructureTree } {
  return {
    revision: structuredClone(testsStructureData.revision),
    new_tests: structuredClone(testsStructureData.new_tests),
  };
}

export function buildLessonTree(structure: StructureTree): ResolvedTree {
  return resolveStructureTree(
    structure,
    lessons.map(({ id, title }) => ({ id, title })),
    { includeUngrouped: true }
  );
}

export function buildRevisionTestTree(structure: StructureTree): ResolvedTree {
  const claimed = collectTreeIds(structure);
  return resolveStructureTree(
    structure,
    tests.map(({ id, title }) => ({ id, title })),
    { includeUngrouped: false, claimedIds: claimed }
  );
}

export function buildNewTestTree(
  newTestsStructure: StructureTree,
  revisionStructure: StructureTree
): ResolvedTree {
  const claimed = new Set([
    ...collectTreeIds(revisionStructure),
    ...collectTreeIds(newTestsStructure),
  ]);
  return resolveStructureTree(
    newTestsStructure,
    tests.map(({ id, title }) => ({ id, title })),
    { includeUngrouped: true, claimedIds: claimed }
  );
}

export const lessonTree: ResolvedTree = buildLessonTree(lessonStructureData);

export const revisionTestTree: ResolvedTree = buildRevisionTestTree(testsStructureData.revision);

export const newTestTree: ResolvedTree = buildNewTestTree(
  testsStructureData.new_tests,
  testsStructureData.revision
);

export function getLessonById(id: string): LessonItem | undefined {
  return lessons.find((lesson) => lesson.id === id);
}

export function getTestById(id: string): TestItem | undefined {
  return tests.find((test) => test.id === id);
}

export function getLessonPickerOptions(structure?: StructureTree): PickerOption[] {
  const tree = structure ? buildLessonTree(structure) : lessonTree;
  return uniquePickerOptions(flattenTreePickerOptions(tree));
}

export function getTestPickerOptions(structures?: {
  revision: StructureTree;
  new_tests: StructureTree;
}): PickerOption[] {
  const revision = structures
    ? buildRevisionTestTree(structures.revision)
    : revisionTestTree;
  const newTests = structures
    ? buildNewTestTree(structures.new_tests, structures.revision)
    : newTestTree;
  return uniquePickerOptions([
    ...flattenTreePickerOptions(revision, 'Revision'),
    ...flattenTreePickerOptions(newTests, 'New Tests'),
  ]);
}
