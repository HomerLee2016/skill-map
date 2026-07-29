import YAML from 'yaml';
import type { SavedRoadmap } from '../types';
import type { StructureTree, TestsStructureFile } from '../utils/folderStructure';

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

export interface WorkspaceContent {
  lessons: LessonItem[];
  tests: TestItem[];
  roadmaps: SavedRoadmap[];
  lessonStructure: StructureTree;
  testsStructure: {
    revision: StructureTree;
    new_tests: StructureTree;
  };
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
const roadmapModules = import.meta.glob('../data/roadmaps/*.yaml', { query: '?raw', eager: true });

function rawContent(module: unknown): string {
  return typeof module === 'string' ? module : (module as { default?: string } | undefined)?.default || '';
}

function firstRaw(modules: Record<string, unknown>): string {
  const entry = Object.values(modules)[0];
  return entry ? rawContent(entry) : '';
}

function titleFromMarkdown(content: string, id: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || id.replace(/[-_]/g, ' ');
}

function emptyStructureTree(): StructureTree {
  return { folders: [], items: [] };
}

function parseStructureTree(raw: unknown): StructureTree {
  if (!raw || typeof raw !== 'object') return emptyStructureTree();
  const obj = raw as StructureTree;
  return {
    folders: Array.isArray(obj.folders) ? obj.folders : [],
    items: Array.isArray(obj.items) ? obj.items : [],
  };
}

function loadDefaultLessons(): LessonItem[] {
  return Object.entries(lessonModules)
    .map(([path, module]) => {
      const content = rawContent(module);
      const id = path.split('/').pop()?.replace('.md', '') || 'untitled';
      return { id, title: titleFromMarkdown(content, id), content };
    })
    .sort((a, b) => a.title.localeCompare(b.title));
}

function loadDefaultTests(): TestItem[] {
  return Object.entries(testModules)
    .filter(([path]) => {
      const file = path.split('/').pop() || '';
      return file.endsWith('.yaml') && file !== 'structure.yaml';
    })
    .map(([path, module]) => {
      const content = rawContent(module);
      const id = path.split('/').pop()?.replace('.yaml', '') || 'untitled';
      try {
        const parsed = YAML.parse(content) as { quiz_title?: string; questions?: TestQuestion[] };
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
}

function loadDefaultRoadmaps(): SavedRoadmap[] {
  return Object.entries(roadmapModules).map(([path, module]) => {
    const yamlContent = rawContent(module);
    let label = 'Untitled Roadmap';
    const id = path.split('/').pop()?.replace('.yaml', '') || 'untitled';
    try {
      const parsed = YAML.parse(yamlContent);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const rootNode = parsed.find((node: any) => !node.dependsOn || node.dependsOn.length === 0) || parsed[0];
        label = rootNode.label || label;
      } else if (parsed && typeof parsed === 'object' && 'label' in parsed) {
        label = String((parsed as { label?: string }).label || label);
      }
    } catch {
      // Fall back to the generated id-based title.
    }
    return { id, name: label, yaml: yamlContent };
  });
}

function loadDefaultStructures(): {
  lessonStructure: StructureTree;
  testsStructure: { revision: StructureTree; new_tests: StructureTree };
} {
  const lessonStructure = (() => {
    const raw = firstRaw(lessonStructureModules);
    if (!raw) return emptyStructureTree();
    try {
      return parseStructureTree(YAML.parse(raw));
    } catch {
      return emptyStructureTree();
    }
  })();

  const testsStructure = (() => {
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
  })();

  return { lessonStructure, testsStructure };
}

export function createDefaultWorkspaceContent(): WorkspaceContent {
  const { lessonStructure, testsStructure } = loadDefaultStructures();
  return {
    lessons: loadDefaultLessons(),
    tests: loadDefaultTests(),
    roadmaps: loadDefaultRoadmaps(),
    lessonStructure,
    testsStructure,
  };
}

async function readTextFromFile(file: File): Promise<string> {
  return file.text();
}

async function readDirectoryEntries(directoryHandle: FileSystemDirectoryHandle): Promise<FileSystemHandle[]> {
  const entries: FileSystemHandle[] = [];
  for await (const entry of directoryHandle.values()) {
    entries.push(entry);
  }
  return entries;
}

async function loadLessonsFromDirectory(directoryHandle: FileSystemDirectoryHandle): Promise<LessonItem[]> {
  try {
    const lessonsDirectory = await directoryHandle.getDirectoryHandle('lessons', { create: false });
    const entries = await readDirectoryEntries(lessonsDirectory);
    const lessonFiles = entries.filter((entry): entry is FileSystemFileHandle => entry.kind === 'file' && entry.name.endsWith('.md'));
    const lessons = await Promise.all(lessonFiles.map(async (entry) => {
      const file = await entry.getFile();
      const content = await readTextFromFile(file);
      const id = entry.name.replace(/\.md$/i, '');
      return { id, title: titleFromMarkdown(content, id), content };
    }));
    return lessons.sort((a, b) => a.title.localeCompare(b.title));
  } catch {
    return [];
  }
}

async function loadTestsFromDirectory(directoryHandle: FileSystemDirectoryHandle): Promise<TestItem[]> {
  try {
    const testsDirectory = await directoryHandle.getDirectoryHandle('tests', { create: false });
    const entries = await readDirectoryEntries(testsDirectory);
    const testFiles = entries.filter((entry): entry is FileSystemFileHandle => entry.kind === 'file' && entry.name.endsWith('.yaml') && entry.name !== 'structure.yaml');
    const tests = await Promise.all(testFiles.map(async (entry) => {
      const file = await entry.getFile();
      const content = await readTextFromFile(file);
      const id = entry.name.replace(/\.yaml$/i, '');
      try {
        const parsed = YAML.parse(content) as { quiz_title?: string; questions?: TestQuestion[] };
        return {
          id,
          title: parsed.quiz_title || id.replace(/[-_]/g, ' '),
          questions: parsed.questions || [],
        };
      } catch {
        return { id, title: id.replace(/[-_]/g, ' '), questions: [] };
      }
    }));
    return tests.sort((a, b) => a.title.localeCompare(b.title));
  } catch {
    return [];
  }
}

async function loadRoadmapsFromDirectory(directoryHandle: FileSystemDirectoryHandle): Promise<SavedRoadmap[]> {
  try {
    const roadmapsDirectory = await directoryHandle.getDirectoryHandle('roadmaps', { create: false });
    const entries = await readDirectoryEntries(roadmapsDirectory);
    const roadmapFiles = entries.filter((entry): entry is FileSystemFileHandle => entry.kind === 'file' && entry.name.endsWith('.yaml'));
    const roadmaps = await Promise.all(roadmapFiles.map(async (entry) => {
      const file = await entry.getFile();
      const yamlContent = await readTextFromFile(file);
      const id = entry.name.replace(/\.yaml$/i, '');
      let label = 'Untitled Roadmap';
      try {
        const parsed = YAML.parse(yamlContent);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const rootNode = parsed.find((node: any) => !node.dependsOn || node.dependsOn.length === 0) || parsed[0];
          label = rootNode.label || label;
        } else if (parsed && typeof parsed === 'object' && 'label' in parsed) {
          label = String((parsed as { label?: string }).label || label);
        }
      } catch {
        // Keep the fallback label.
      }
      return { id, name: label, yaml: yamlContent };
    }));
    return roadmaps;
  } catch {
    return [];
  }
}

async function loadStructureFromDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  folderName: 'lessons' | 'tests'
): Promise<StructureTree | { revision: StructureTree; new_tests: StructureTree }> {
  try {
    const directory = await directoryHandle.getDirectoryHandle(folderName, { create: false });
    const entries = await readDirectoryEntries(directory);
    const structureFile = entries.find((entry): entry is FileSystemFileHandle => entry.kind === 'file' && entry.name === 'structure.yaml');
    if (!structureFile) {
      return folderName === 'tests'
        ? { revision: emptyStructureTree(), new_tests: emptyStructureTree() }
        : emptyStructureTree();
    }

    const content = await readTextFromFile(await structureFile.getFile());
    if (folderName === 'tests') {
      const parsed = YAML.parse(content) as TestsStructureFile;
      return {
        revision: parseStructureTree(parsed.revision),
        new_tests: parseStructureTree(parsed.new_tests),
      };
    }

    return parseStructureTree(YAML.parse(content));
  } catch {
    return folderName === 'tests'
      ? { revision: emptyStructureTree(), new_tests: emptyStructureTree() }
      : emptyStructureTree();
  }
}

export async function loadWorkspaceContent(handle?: FileSystemDirectoryHandle | null): Promise<WorkspaceContent> {
  if (!handle) {
    return createDefaultWorkspaceContent();
  }

  try {
    const [lessons, tests, roadmaps, lessonStructure, testsStructure] = await Promise.all([
      loadLessonsFromDirectory(handle),
      loadTestsFromDirectory(handle),
      loadRoadmapsFromDirectory(handle),
      loadStructureFromDirectory(handle, 'lessons'),
      loadStructureFromDirectory(handle, 'tests'),
    ]);

    return {
      lessons,
      tests,
      roadmaps,
      lessonStructure: lessonStructure as StructureTree,
      testsStructure: testsStructure as { revision: StructureTree; new_tests: StructureTree },
    };
  } catch (error) {
    console.error('Failed to load local workspace content', error);
    return createDefaultWorkspaceContent();
  }
}
