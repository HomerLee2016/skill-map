import { serializeTest } from './testYaml';
import type { TestItem } from './workspaceTypes';

export const GUIDE_FILE_NAME = 'prompt-guide.md';

async function writeText(directory: FileSystemDirectoryHandle, fileName: string, text: string): Promise<void> {
  const file = await directory.getFileHandle(fileName, { create: true });
  const writable = await file.createWritable();
  await writable.write(text);
  await writable.close();
}

/** Writes `lessons/<id>.md` or `tests/<id>.yaml` into the workspace folder; false when there is no folder or the write fails. */
async function writeInFolder(handle: FileSystemDirectoryHandle | null | undefined, folder: 'lessons' | 'tests', fileName: string, text: string): Promise<boolean> {
  if (!handle) return false;
  try {
    await writeText(await handle.getDirectoryHandle(folder, { create: true }), fileName, text);
    return true;
  } catch (error) {
    console.error(`Failed to write ${folder}/${fileName}`, error);
    return false;
  }
}

export const writeLessonFile = (handle: FileSystemDirectoryHandle | null | undefined, id: string, markdown: string) =>
  writeInFolder(handle, 'lessons', `${id}.md`, markdown);

export const writeTestFile = (handle: FileSystemDirectoryHandle | null | undefined, test: TestItem) =>
  writeInFolder(handle, 'tests', `${test.id}.yaml`, serializeTest(test.title, test.questions));

/** Removes one file; a file that is already gone counts as success. */
export async function deleteContentFile(handle: FileSystemDirectoryHandle | null | undefined, folder: 'lessons' | 'tests' | 'roadmaps', id: string): Promise<boolean> {
  if (!handle) return false;
  try {
    const directory = await handle.getDirectoryHandle(folder, { create: false });
    await directory.removeEntry(`${id}${folder === 'lessons' ? '.md' : '.yaml'}`);
    return true;
  } catch (error) {
    if ((error as { name?: string }).name === 'NotFoundError') return true;
    console.error(`Failed to delete ${folder}/${id}`, error);
    return false;
  }
}

export async function readGuideFile(handle: FileSystemDirectoryHandle): Promise<string | undefined> {
  try {
    const text = await (await (await handle.getFileHandle(GUIDE_FILE_NAME, { create: false })).getFile()).text();
    return text.trim() ? text : undefined;
  } catch {
    return undefined;
  }
}

/** Saves the prompt guide at the folder's root; null removes it so the bundled guide applies again. */
export async function writeGuideFile(handle: FileSystemDirectoryHandle | null | undefined, guide: string | null): Promise<boolean> {
  if (!handle) return false;
  try {
    if (guide === null) {
      await handle.removeEntry(GUIDE_FILE_NAME).catch((error: { name?: string }) => { if (error?.name !== 'NotFoundError') throw error; });
    } else {
      await writeText(handle, GUIDE_FILE_NAME, guide);
    }
    return true;
  } catch (error) {
    console.error('Failed to write the prompt guide', error);
    return false;
  }
}

export const TRASH_FOLDER = '.skill-map-trash';

/** Like `deleteContentFile`, but first copies the file into `.skill-map-trash/<folder>/` so the removal can be undone by hand. */
export async function trashContentFile(handle: FileSystemDirectoryHandle | null | undefined, folder: 'lessons' | 'tests' | 'roadmaps', id: string): Promise<boolean> {
  if (!handle) return false;
  const fileName = `${id}${folder === 'lessons' ? '.md' : '.yaml'}`;
  try {
    const directory = await handle.getDirectoryHandle(folder, { create: false });
    let text: string;
    try {
      text = await (await (await directory.getFileHandle(fileName, { create: false })).getFile()).text();
    } catch (error) {
      if ((error as { name?: string }).name === 'NotFoundError') return true;
      throw error;
    }
    const trash = await (await handle.getDirectoryHandle(TRASH_FOLDER, { create: true })).getDirectoryHandle(folder, { create: true });
    await writeText(trash, fileName, text);
    await directory.removeEntry(fileName);
    return true;
  } catch (error) {
    console.error(`Failed to move ${folder}/${id} to the trash folder`, error);
    return false;
  }
}
