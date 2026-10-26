import { unzipSync, strFromU8 } from 'fflate';
import {
  emptyStructureTree,
  emptyTestsStructure,
  parseLessonStructure,
  parseTestsStructure,
  sortByTitle,
  toLesson,
  toRoadmap,
  toTest,
} from './workspaceParsing';
import type { WorkspaceContent } from './workspaceTypes';

/** One file of a picked folder or zip: `path` is relative, e.g. `Spanish/lessons/intro.md`. */
export interface ImportedFile {
  path: string;
  text: () => Promise<string>;
}

export interface ImportedWorkspace {
  name: string;
  content: WorkspaceContent;
}

const CONTENT_FOLDERS = new Set(['lessons', 'tests', 'roadmaps']);

function stripExtension(file: string, extension: RegExp): string {
  return file.replace(extension, '');
}

/** Splits paths into [workspace name, path inside the workspace]; a leading folder that is not lessons/tests/roadmaps is the name. */
export function splitWorkspaceRoot(paths: string[], fallbackName: string): { name: string; rootDepth: number } {
  const firstSegments = new Set(paths.map((path) => path.split('/')[0]));
  const hasContentAtTop = paths.some((path) => {
    const segments = path.split('/');
    return segments.length > 1 && CONTENT_FOLDERS.has(segments[0]);
  });
  if (!hasContentAtTop && firstSegments.size === 1) {
    return { name: [...firstSegments][0] || fallbackName, rootDepth: 1 };
  }
  return { name: fallbackName, rootDepth: 0 };
}

/** Same layout rules as a folder opened with the directory picker: lessons/*.md, tests/*.yaml, roadmaps/*.yaml and structure.yaml files. */
export async function buildImportedWorkspace(files: ImportedFile[], fallbackName: string): Promise<ImportedWorkspace> {
  const cleaned = files
    .map((file) => ({ ...file, path: file.path.replace(/\\/g, '/').replace(/^\/+/, '') }))
    .filter((file) => !file.path.startsWith('__MACOSX/') && !file.path.split('/').some((segment) => segment.startsWith('.')));
  const { name, rootDepth } = splitWorkspaceRoot(cleaned.map((file) => file.path), fallbackName);

  const inside = cleaned.map((file) => {
    const segments = file.path.split('/').slice(rootDepth);
    return { folder: segments[0], file: segments[1], depth: segments.length, read: file.text };
  }).filter((entry) => entry.depth === 2 && CONTENT_FOLDERS.has(entry.folder));

  const read = async (folder: string, accept: (file: string) => boolean) => Promise.all(
    inside.filter((entry) => entry.folder === folder && accept(entry.file)).map(async (entry) => ({ file: entry.file, text: await entry.read() })),
  );
  const lessonFiles = await read('lessons', (file) => file.endsWith('.md'));
  const testFiles = await read('tests', (file) => file.endsWith('.yaml') && file !== 'structure.yaml');
  const roadmapFiles = await read('roadmaps', (file) => file.endsWith('.yaml'));
  const lessonStructure = await read('lessons', (file) => file === 'structure.yaml');
  const testsStructure = await read('tests', (file) => file === 'structure.yaml');

  return {
    name,
    content: {
      lessons: sortByTitle(lessonFiles.map(({ file, text }) => toLesson(stripExtension(file, /\.md$/i), text))),
      tests: sortByTitle(testFiles.map(({ file, text }) => toTest(stripExtension(file, /\.yaml$/i), text))),
      roadmaps: roadmapFiles.map(({ file, text }) => toRoadmap(stripExtension(file, /\.yaml$/i), text)),
      lessonStructure: lessonStructure[0] ? parseLessonStructure(lessonStructure[0].text) : emptyStructureTree(),
      testsStructure: testsStructure[0] ? parseTestsStructure(testsStructure[0].text) : emptyTestsStructure(),
    },
  };
}

export function hasImportedContent({ content }: ImportedWorkspace): boolean {
  return content.lessons.length + content.tests.length + content.roadmaps.length > 0;
}

/** Files from `<input type="file" webkitdirectory>`; each File carries its relative path. */
export function filesFromFileList(list: FileList | File[]): ImportedFile[] {
  return Array.from(list).map((file) => ({
    path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    text: () => file.text(),
  }));
}

/** Files inside a .zip (only the text formats the workspace uses are unpacked). */
export async function filesFromZip(zip: File): Promise<ImportedFile[]> {
  const entries = unzipSync(new Uint8Array(await zip.arrayBuffer()), {
    filter: (entry) => /\.(md|yaml)$/i.test(entry.name),
  });
  return Object.entries(entries).map(([path, bytes]) => ({ path, text: async () => strFromU8(bytes) }));
}
