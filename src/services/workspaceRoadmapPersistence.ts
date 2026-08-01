import type { SavedRoadmap } from '../types';

export async function writeWorkspaceRoadmapFile(
  directoryHandle: FileSystemDirectoryHandle | null | undefined,
  roadmap: SavedRoadmap,
): Promise<boolean> {
  if (!directoryHandle) {
    return false;
  }

  try {
    const roadmapsDirectory = await directoryHandle.getDirectoryHandle('roadmaps', { create: true });
    const safeFileName = `${roadmap.id || 'roadmap'}.yaml`;
    const fileHandle = await roadmapsDirectory.getFileHandle(safeFileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(roadmap.yaml);
    await writable.close();
    return true;
  } catch (error) {
    console.error('Failed to persist roadmap YAML', error);
    return false;
  }
}
