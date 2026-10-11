import { createDefaultWorkspaceContent } from './workspaceBundled';
import {
  loadLessonsFromDirectory,
  loadLessonStructureFromDirectory,
  loadRoadmapsFromDirectory,
  loadTestsFromDirectory,
  loadTestsStructureFromDirectory,
} from './workspaceFolder';
import type { WorkspaceContent } from './workspaceTypes';

export type { LessonItem, TestItem, TestQuestion, WorkspaceContent } from './workspaceTypes';
export { createDefaultWorkspaceContent };

/** Loads from the selected folder, or the bundled content when there is none. */
export async function loadWorkspaceContent(handle?: FileSystemDirectoryHandle | null): Promise<WorkspaceContent> {
  if (!handle) {
    return createDefaultWorkspaceContent();
  }

  try {
    const [lessons, tests, roadmaps, lessonStructure, testsStructure] = await Promise.all([
      loadLessonsFromDirectory(handle),
      loadTestsFromDirectory(handle),
      loadRoadmapsFromDirectory(handle),
      loadLessonStructureFromDirectory(handle),
      loadTestsStructureFromDirectory(handle),
    ]);

    return { lessons, tests, roadmaps, lessonStructure, testsStructure };
  } catch (error) {
    console.error('Failed to load local workspace content', error);
    return createDefaultWorkspaceContent();
  }
}
