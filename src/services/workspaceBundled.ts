import {
  parseLessonStructure,
  parseTestsStructure,
  sortByTitle,
  toLesson,
  toRoadmap,
  toTest,
} from './workspaceParsing';
import type { WorkspaceContent } from './workspaceTypes';

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

function fileId(path: string, extension: string): string {
  return path.split('/').pop()?.replace(extension, '') || 'untitled';
}

/** Content bundled into the app, used when no workspace folder is selected. */
export function createDefaultWorkspaceContent(): WorkspaceContent {
  return {
    lessons: sortByTitle(
      Object.entries(lessonModules).map(([path, module]) => toLesson(fileId(path, '.md'), rawContent(module))),
    ),
    tests: sortByTitle(
      Object.entries(testModules)
        .filter(([path]) => {
          const file = path.split('/').pop() || '';
          return file.endsWith('.yaml') && file !== 'structure.yaml';
        })
        .map(([path, module]) => toTest(fileId(path, '.yaml'), rawContent(module))),
    ),
    roadmaps: Object.entries(roadmapModules).map(([path, module]) => toRoadmap(fileId(path, '.yaml'), rawContent(module))),
    lessonStructure: parseLessonStructure(firstRaw(lessonStructureModules)),
    testsStructure: parseTestsStructure(firstRaw(testStructureModules)),
  };
}
