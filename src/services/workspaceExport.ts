import { strToU8, zipSync } from 'fflate';
import YAML from 'yaml';
import { serializeWorkspaceStructureContent } from './workspaceStructurePersistence';
import type { WorkspaceContent } from './workspaceTypes';

/** A name that is safe as a file or folder name on every OS (and not hidden, which the importer skips). */
export function safeFileName(raw: string, fallback: string): string {
  const cleaned = raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/^[.\s-]+|[.\s]+$/g, '')
    .trim();
  return cleaned || fallback;
}

/** Gives each id a unique, safe file name (ids are kept when they are already safe). */
function fileNames(ids: string[], extension: string): string[] {
  const used = new Set<string>();
  return ids.map((id) => {
    const base = safeFileName(id, 'item');
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n += 1) name = `${base}-${n}`;
    used.add(name.toLowerCase());
    return `${name}${extension}`;
  });
}

/**
 * The files of a workspace in the same layout the folder/zip import reads:
 * `<name>/lessons/*.md`, `<name>/tests/*.yaml`, `<name>/roadmaps/*.yaml` plus both structure.yaml files.
 */
export function workspaceZipFiles(name: string, content: WorkspaceContent): Record<string, Uint8Array> {
  const root = safeFileName(name, 'workspace');
  const files: Record<string, Uint8Array> = {};
  const add = (path: string, text: string) => { files[`${root}/${path}`] = strToU8(text); };

  const lessonNames = fileNames(content.lessons.map((lesson) => lesson.id), '.md');
  content.lessons.forEach((lesson, index) => add(`lessons/${lessonNames[index]}`, lesson.content));
  const testNames = fileNames(content.tests.map((test) => test.id), '.yaml');
  content.tests.forEach((test, index) => add(`tests/${testNames[index]}`, YAML.stringify({ quiz_title: test.title, questions: test.questions })));
  const roadmapNames = fileNames(content.roadmaps.map((roadmap) => roadmap.id), '.yaml');
  content.roadmaps.forEach((roadmap, index) => add(`roadmaps/${roadmapNames[index]}`, roadmap.yaml));

  add('lessons/structure.yaml', serializeWorkspaceStructureContent('lessons', content.lessonStructure));
  add('tests/structure.yaml', serializeWorkspaceStructureContent('tests', content.testsStructure));
  return files;
}

export function buildWorkspaceZip(name: string, content: WorkspaceContent): Uint8Array {
  return zipSync(workspaceZipFiles(name, content));
}

export function workspaceZipFileName(name: string): string {
  return `${safeFileName(name, 'workspace')}.zip`;
}

/** Saves the zip through a temporary link click (works on desktop and phone browsers). */
export function downloadWorkspaceZip(name: string, content: WorkspaceContent): void {
  const blob = new Blob([buildWorkspaceZip(name, content) as BlobPart], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = workspaceZipFileName(name);
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
