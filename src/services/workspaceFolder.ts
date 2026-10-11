import type { StructureTree } from '../utils/folderStructure';
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
import type { LessonItem, SavedRoadmap, TestItem, TestsStructure } from './workspaceTypes';

async function readDirectoryEntries(directoryHandle: FileSystemDirectoryHandle): Promise<FileSystemHandle[]> {
  const entries: FileSystemHandle[] = [];
  for await (const entry of directoryHandle.values()) {
    entries.push(entry);
  }
  return entries;
}

/** Reads every file in `folderName` that passes `accept`, mapping name + text through `build`. */
async function readFolderFiles<T>(
  directoryHandle: FileSystemDirectoryHandle,
  folderName: string,
  accept: (name: string) => boolean,
  extension: RegExp,
  build: (id: string, content: string) => T,
): Promise<T[]> {
  try {
    const directory = await directoryHandle.getDirectoryHandle(folderName, { create: false });
    const entries = await readDirectoryEntries(directory);
    const files = entries.filter((entry): entry is FileSystemFileHandle => entry.kind === 'file' && accept(entry.name));
    return await Promise.all(files.map(async (entry) => {
      const content = await (await entry.getFile()).text();
      return build(entry.name.replace(extension, ''), content);
    }));
  } catch {
    return [];
  }
}

async function readStructureFile(directoryHandle: FileSystemDirectoryHandle, folderName: 'lessons' | 'tests'): Promise<string> {
  try {
    const directory = await directoryHandle.getDirectoryHandle(folderName, { create: false });
    const entries = await readDirectoryEntries(directory);
    const structureFile = entries.find((entry): entry is FileSystemFileHandle => entry.kind === 'file' && entry.name === 'structure.yaml');
    return structureFile ? await (await structureFile.getFile()).text() : '';
  } catch {
    return '';
  }
}

export async function loadLessonsFromDirectory(handle: FileSystemDirectoryHandle): Promise<LessonItem[]> {
  const lessons = await readFolderFiles(handle, 'lessons', (name) => name.endsWith('.md'), /\.md$/i, toLesson);
  return sortByTitle(lessons);
}

export async function loadTestsFromDirectory(handle: FileSystemDirectoryHandle): Promise<TestItem[]> {
  const tests = await readFolderFiles(
    handle,
    'tests',
    (name) => name.endsWith('.yaml') && name !== 'structure.yaml',
    /\.yaml$/i,
    toTest,
  );
  return sortByTitle(tests);
}

export function loadRoadmapsFromDirectory(handle: FileSystemDirectoryHandle): Promise<SavedRoadmap[]> {
  return readFolderFiles(handle, 'roadmaps', (name) => name.endsWith('.yaml'), /\.yaml$/i, toRoadmap);
}

export async function loadLessonStructureFromDirectory(handle: FileSystemDirectoryHandle): Promise<StructureTree> {
  const raw = await readStructureFile(handle, 'lessons');
  return raw ? parseLessonStructure(raw) : emptyStructureTree();
}

export async function loadTestsStructureFromDirectory(handle: FileSystemDirectoryHandle): Promise<TestsStructure> {
  const raw = await readStructureFile(handle, 'tests');
  return raw ? parseTestsStructure(raw) : emptyTestsStructure();
}
