import { useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ContentConflictError, deleteCloudItem, saveCloudLesson, saveCloudTest } from '../services/cloudContentEdit';
import { ensureCloudWorkspace, saveCloudGuide } from '../services/cloudWorkspace';
import { deleteLessonFromContent, deleteTestFromContent, saveLessonInContent, saveTestInContent } from '../services/contentEdit';
import { deriveWorkspaceStorageKey } from '../services/workspaceKey';
import { findEditedQuestions } from '../services/questionProgress';
import { applyTestEditToRevision } from '../services/revisionDb';
import { deleteContentFile, writeGuideFile, writeLessonFile, writeTestFile } from '../services/workspaceContentFiles';
import { titleFromMarkdown } from '../services/workspaceParsing';
import type { SavedRoadmap, TestQuestion, WorkspaceContent } from '../services/workspaceTypes';
import type { StructureTree } from '../utils/folderStructure';
import type { TestsStructure } from '../services/workspaceTypes';
import type { WorkspaceStructureFolder } from '../services/workspaceStructurePersistence';

const MAX_BYTES = 1_000_000;

export interface EditOutcome {
  /** Things that worked only partly (for example the folder could not be written). Shown after the save. */
  warnings: string[];
}

export interface ContentEditing {
  /** Null when editing works; otherwise why not (shown instead of the buttons). */
  editBlockedReason: string | null;
  saveLesson: (input: { id: string; markdown: string; isNew: boolean }) => Promise<EditOutcome>;
  deleteLesson: (id: string) => Promise<EditOutcome>;
  saveTest: (input: { id: string; title: string; questions: TestQuestion[]; isNew: boolean; keepProgress: boolean }) => Promise<EditOutcome>;
  deleteTest: (id: string) => Promise<EditOutcome>;
  /** Removes a roadmap from the folder and the account. A roadmap that was never saved only needs removing from the screen. */
  deleteRoadmap: (id: string) => Promise<EditOutcome>;
  /** Saves the prompt guide for this workspace; null goes back to the bundled guide. */
  saveGuide: (guide: string | null) => Promise<EditOutcome>;
  /** Puts content that sync pulled in (or whose versions it refreshed) on screen without reloading the workspace. */
  applySyncedContent: (content: WorkspaceContent) => void;
  /**
   * Remembers the cloud version of items on screen without re-rendering them (a re-render would restart a quiz in progress).
   * Mutates the version field of the current items on purpose; nothing displayed depends on it.
   */
  recordVersions: (versions: Record<string, string>) => void;
}

interface Params {
  workspace: WorkspaceContent;
  setWorkspace: (content: WorkspaceContent) => void;
  workspaceKey: string;
  workspaceName: string;
  handle: FileSystemDirectoryHandle | null;
  userId: string | null;
  hasLocalContent: boolean;
  persistRoadmap: (roadmap: SavedRoadmap) => Promise<boolean>;
  persistStructure: (folder: WorkspaceStructureFolder, structure: StructureTree | TestsStructure) => Promise<boolean>;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/**
 * Add, change and delete lessons and tests. While signed in the cloud copy is written first (it checks that nobody
 * else changed the item), then the folder mirror when there is one. Deletes leave a tombstone so they reach other devices.
 */
export function useContentEditing(params: Params): ContentEditing {
  const ref = useRef(params);
  ref.current = params;

  const bundledDemo = params.workspaceKey === deriveWorkspaceStorageKey(null) && !params.handle && !params.hasLocalContent;
  let editBlockedReason: string | null = null;
  if (bundledDemo) editBlockedReason = 'This is the built-in demo. Open or create a workspace to edit it.';
  else if (!params.handle && !params.userId) editBlockedReason = 'Sign in to edit on this device, or open a folder workspace.';

  /** Warnings for the ways a folder mirror or a follow-up save can fail without losing the main edit. */
  const folderWarning = (ok: boolean, what: string): string[] => (ok ? [] : [`${what} could not be written to the folder. Use Sync now to retry.`]);

  const saveLesson = useCallback<ContentEditing['saveLesson']>(async ({ id, markdown, isNew }) => {
    const { workspace, workspaceKey, workspaceName, handle, userId, setWorkspace } = ref.current;
    const existing = workspace.lessons.find((lesson) => lesson.id === id);
    if (isNew && existing) throw new Error(`A lesson with the id "${id}" already exists.`);
    if (byteLength(markdown) > MAX_BYTES) throw new Error('This lesson is larger than 1 MB. Split it into two lessons.');
    const warnings: string[] = [];
    const draft = { id, title: titleFromMarkdown(markdown, id), content: markdown, updatedAt: existing?.updatedAt };
    let updatedAt = existing?.updatedAt;
    let cloudFailed = false;
    if (supabase && userId) {
      try {
        updatedAt = await saveCloudLesson(supabase, workspaceKey, workspaceName, draft);
      } catch (error) {
        if (error instanceof ContentConflictError || !handle) throw error;
        cloudFailed = true;
        warnings.push('Could not reach your account. Saved to the folder; Sync now will upload it.');
      }
    }
    if (handle) {
      const ok = await writeLessonFile(handle, id, markdown);
      if (!ok && (cloudFailed || !userId)) throw new Error('The lesson could not be saved: the folder is not writable. Reconnect the folder and try again.');
      warnings.push(...folderWarning(ok, 'The lesson'));
    }
    setWorkspace(saveLessonInContent(workspace, { id, content: markdown, updatedAt }));
    return { warnings };
  }, []);

  const deleteWithLinks = useCallback(async (next: { content: WorkspaceContent; changedRoadmaps: SavedRoadmap[]; changedStructures: Array<'lessons' | 'tests'> }): Promise<string[]> => {
    const { persistRoadmap, persistStructure } = ref.current;
    const warnings: string[] = [];
    for (const roadmap of next.changedRoadmaps) {
      if (!(await persistRoadmap(roadmap))) warnings.push(`The roadmap "${roadmap.name}" could not be updated; it may still link the deleted item.`);
    }
    for (const kind of next.changedStructures) {
      const ok = await persistStructure(kind, kind === 'lessons' ? next.content.lessonStructure : next.content.testsStructure);
      if (!ok) warnings.push(`The ${kind} folder tree could not be saved.`);
    }
    return warnings;
  }, []);

  const deleteItem = useCallback(async (kind: 'lessons' | 'tests', id: string, next: ReturnType<typeof deleteLessonFromContent>): Promise<EditOutcome> => {
    const { workspace, workspaceKey, workspaceName, handle, userId, setWorkspace } = ref.current;
    const warnings: string[] = [];
    const item = (kind === 'lessons' ? workspace.lessons : workspace.tests).find((entry) => entry.id === id);
    // Cloud first and strict: a delete that only happened in the folder would be undone by the next sync.
    if (supabase && userId) {
      const warning = await deleteCloudItem(supabase, workspaceKey, workspaceName, kind, id, item?.updatedAt);
      if (warning) warnings.push(warning);
    }
    if (handle) warnings.push(...folderWarning(await deleteContentFile(handle, kind, id), 'The deletion'));
    warnings.push(...(await deleteWithLinks(next)));
    setWorkspace(next.content);
    return { warnings };
  }, [deleteWithLinks]);

  const deleteLesson = useCallback<ContentEditing['deleteLesson']>(
    (id) => deleteItem('lessons', id, deleteLessonFromContent(ref.current.workspace, id)), [deleteItem]);
  const deleteTest = useCallback<ContentEditing['deleteTest']>(
    (id) => deleteItem('tests', id, deleteTestFromContent(ref.current.workspace, id)), [deleteItem]);

  const deleteRoadmap = useCallback<ContentEditing['deleteRoadmap']>(async (id) => {
    const { workspace, workspaceKey, workspaceName, handle, userId, setWorkspace } = ref.current;
    const warnings: string[] = [];
    if (!workspace.roadmaps.some((roadmap) => roadmap.id === id)) return { warnings }; // never saved: nothing stored to remove
    if (supabase && userId) {
      const warning = await deleteCloudItem(supabase, workspaceKey, workspaceName, 'roadmaps', id);
      if (warning) warnings.push(warning);
    }
    if (handle) warnings.push(...folderWarning(await deleteContentFile(handle, 'roadmaps', id), 'The deletion'));
    setWorkspace({ ...workspace, roadmaps: workspace.roadmaps.filter((roadmap) => roadmap.id !== id) });
    return { warnings };
  }, []);

  const saveTest = useCallback<ContentEditing['saveTest']>(async ({ id, title, questions, isNew, keepProgress }) => {
    const { workspace, workspaceKey, workspaceName, handle, userId, setWorkspace } = ref.current;
    const existing = workspace.tests.find((test) => test.id === id);
    if (isNew && existing) throw new Error(`A test with the id "${id}" already exists.`);
    const warnings: string[] = [];
    const draft = { id, title, questions, updatedAt: existing?.updatedAt };
    let updatedAt = existing?.updatedAt;
    let cloudFailed = false;
    if (supabase && userId) {
      try {
        updatedAt = await saveCloudTest(supabase, workspaceKey, workspaceName, draft);
      } catch (error) {
        if (error instanceof ContentConflictError || !handle) throw error;
        cloudFailed = true;
        warnings.push('Could not reach your account. Saved to the folder; Sync now will upload it.');
      }
    }
    if (handle) {
      const ok = await writeTestFile(handle, draft);
      if (!ok && (cloudFailed || !userId)) throw new Error('The test could not be saved: the folder is not writable. Reconnect the folder and try again.');
      warnings.push(...folderWarning(ok, 'The test'));
    }
    if (existing && (keepProgress || existing.title !== title)) {
      try {
        await applyTestEditToRevision({
          oldTitle: existing.title,
          newTitle: title,
          moves: keepProgress ? findEditedQuestions(existing.questions, questions) : [],
        });
      } catch (error) {
        console.error('Failed to move revision records', error);
        warnings.push('The test was saved, but its revision progress could not be moved to the edited questions.');
      }
    }
    setWorkspace(saveTestInContent(workspace, { ...draft, updatedAt }));
    return { warnings };
  }, []);

  const saveGuide = useCallback<ContentEditing['saveGuide']>(async (guide) => {
    const { workspace, workspaceKey, workspaceName, handle, userId, setWorkspace } = ref.current;
    const warnings: string[] = [];
    let saved = false;
    if (supabase && userId) {
      try {
        await ensureCloudWorkspace(supabase, workspaceKey, workspaceName);
        await saveCloudGuide(supabase, workspaceKey, guide);
        saved = true;
      } catch (error) {
        console.error('Failed to save the guide to the cloud', error);
        warnings.push('The guide could not be saved to your account (the content-editing migration may not be run yet).');
      }
    }
    if (handle && (await writeGuideFile(handle, guide))) saved = true;
    if (!saved) throw new Error('The guide could not be saved. Sign in with the migration applied, or open a folder workspace.');
    const { guide: _old, ...rest } = workspace;
    setWorkspace(guide ? { ...rest, guide } : rest);
    return { warnings };
  }, []);

  const recordVersions = useCallback((versions: Record<string, string>) => {
    const { workspace } = ref.current;
    for (const lesson of workspace.lessons) lesson.updatedAt = versions[`lessons:${lesson.id}`] ?? lesson.updatedAt;
    for (const test of workspace.tests) test.updatedAt = versions[`tests:${test.id}`] ?? test.updatedAt;
  }, []);

  const { setWorkspace } = params;
  return useMemo(
    () => ({ editBlockedReason, saveLesson, deleteLesson, saveTest, deleteTest, deleteRoadmap, saveGuide, applySyncedContent: setWorkspace, recordVersions }),
    [editBlockedReason, saveLesson, deleteLesson, saveTest, deleteTest, deleteRoadmap, saveGuide, setWorkspace, recordVersions],
  );
}
