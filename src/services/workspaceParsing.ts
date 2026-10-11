import YAML from 'yaml';
import type { StructureTree, TestsStructureFile } from '../utils/folderStructure';
import { getRoadmapLabel } from '../utils/roadmapYaml';
import type { LessonItem, SavedRoadmap, TestItem, TestQuestion, TestsStructure } from './workspaceTypes';

export function titleFromMarkdown(content: string, id: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || id.replace(/[-_]/g, ' ');
}

export function emptyStructureTree(): StructureTree {
  return { folders: [], items: [] };
}

export function emptyTestsStructure(): TestsStructure {
  return { revision: emptyStructureTree(), new_tests: emptyStructureTree() };
}

export function parseStructureTree(raw: unknown): StructureTree {
  if (!raw || typeof raw !== 'object') return emptyStructureTree();
  const obj = raw as StructureTree;
  return {
    folders: Array.isArray(obj.folders) ? obj.folders : [],
    items: Array.isArray(obj.items) ? obj.items : [],
  };
}

/** Parses a lessons structure.yaml; falls back to an empty tree on invalid yaml. */
export function parseLessonStructure(raw: string): StructureTree {
  if (!raw) return emptyStructureTree();
  try {
    return parseStructureTree(YAML.parse(raw));
  } catch {
    return emptyStructureTree();
  }
}

/** Parses a tests structure.yaml; falls back to empty trees on invalid yaml. */
export function parseTestsStructure(raw: string): TestsStructure {
  if (!raw) return emptyTestsStructure();
  try {
    const parsed = YAML.parse(raw) as TestsStructureFile;
    return {
      revision: parseStructureTree(parsed.revision),
      new_tests: parseStructureTree(parsed.new_tests),
    };
  } catch {
    return emptyTestsStructure();
  }
}

export function toLesson(id: string, content: string): LessonItem {
  return { id, title: titleFromMarkdown(content, id), content };
}

export function toTest(id: string, content: string): TestItem {
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
}

export function toRoadmap(id: string, yaml: string): SavedRoadmap {
  return { id, name: getRoadmapLabel(yaml, 'Untitled Roadmap'), yaml };
}

export function sortByTitle<T extends { title: string }>(items: T[]): T[] {
  return items.sort((a, b) => a.title.localeCompare(b.title));
}
