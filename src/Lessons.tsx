import { useEffect, useMemo, useState } from 'react';
import { LessonMarkdown } from './utils/lessonMarkdown';
import {
  addFolderToTree,
  assignItemToTree,
  listFolderPaths,
  pathToSegments,
  type StructureTree,
} from './utils/contentCatalog';
import { Sidebar } from './components/Sidebar/Sidebar';
import { useWorkspace } from './contexts/WorkspaceContext';
import { resolveStructureTree } from './utils/folderStructure';
import { CategorySection } from './components/Sidebar/CategorySection';
import { ContentTreeSidebar } from './components/Sidebar/ContentTreeSidebar';
import { TreeActionModal } from './components/Sidebar/TreeActionModal';
import { TreeGlobalActions } from './components/Sidebar/TreeGlobalActions';
import { useExpandCollapseState } from './hooks/useExpandCollapseState';
import { ContentActions } from './components/editor/ContentActions';
import { ConfirmDeleteDialog } from './components/editor/ConfirmDeleteDialog';
import { LessonEditorModal } from './components/editor/LessonEditorModal';
import { useWorkspaceGuide } from './components/editor/useWorkspaceGuide';
import { countRoadmapLinks } from './services/contentEdit';

interface LessonsProps {
  selectedLessonId?: string;
  onSelectedLessonIdChange?: (id: string) => void;
}

async function saveLessonStructure(structure: StructureTree) {
  return structure;
}

function Lessons({ selectedLessonId, onSelectedLessonIdChange }: LessonsProps) {
  const { workspace, workspaceVersion, persistStructure, saveLesson, deleteLesson, editBlockedReason } = useWorkspace();
  const { guide, saveGuide } = useWorkspaceGuide();
  const [editor, setEditor] = useState<'new' | 'edit' | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<string[]>([]);
  const availableLessons = workspace.lessons;
  const [activeId, setActiveId] = useState(selectedLessonId || availableLessons[0]?.id || '');
  const [structure, setStructure] = useState<StructureTree>(workspace.lessonStructure);
  const [error, setError] = useState<string | null>(null);
  const [modalState, setModalState] = useState<{ open: boolean; mode: 'add-folder' | 'assign-item' }>({
    open: false,
    mode: 'add-folder',
  });
  const { expandKey, collapseKey, expandAll, collapseAll } = useExpandCollapseState();

  const tree = useMemo(() => resolveStructureTree(structure, availableLessons.map(({ id, title }) => ({ id, title })), { includeUngrouped: true }), [structure, availableLessons]);

  useEffect(() => {
    setStructure(workspace.lessonStructure);
  }, [workspace.lessonStructure]);

  useEffect(() => {
    if (selectedLessonId) {
      setActiveId(selectedLessonId);
      return;
    }

    setActiveId(availableLessons[0]?.id || '');
  }, [selectedLessonId, availableLessons, workspaceVersion]);

  const selected = availableLessons.find((lesson) => lesson.id === activeId);

  const selectLesson = (id: string) => {
    setActiveId(id);
    onSelectedLessonIdChange?.(id);
  };

  const persist = async (next: StructureTree) => {
    try {
      await saveLessonStructure(next);
      await persistStructure('lessons', next);
      setStructure(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save structure');
    }
  };

  const handleSaved = (id: string, warnings: string[]) => {
    setEditor(null);
    setNotice(warnings);
    selectLesson(id);
  };

  const handleDelete = async () => {
    if (!selected) return;
    const outcome = await deleteLesson(selected.id);
    setDeleting(false);
    setNotice(outcome.warnings);
    const remaining = availableLessons.filter((lesson) => lesson.id !== selected.id);
    selectLesson(remaining[0]?.id ?? '');
  };

  const handleAddFolder = () => {
    setModalState({ open: true, mode: 'add-folder' });
  };

  const handleAssignItem = () => {
    setModalState({ open: true, mode: 'assign-item' });
  };

  const handleModalSubmit = ({ folderName, itemId, parentPath }: { folderName?: string; itemId?: string; parentPath: string }) => {
    if (modalState.mode === 'add-folder') {
      if (!folderName?.trim()) return;
      const next = addFolderToTree(structure, folderName, parentPath ? pathToSegments(parentPath) : []);
      if (next) persist(next);
      return;
    }

    if (!itemId) return;
    const next = assignItemToTree(structure, itemId, parentPath ? pathToSegments(parentPath) : []);
    if (next) persist(next);
  };

  return (
    <div className="lessons-page">
      <Sidebar>
        <div className="lessons-sidebar-header">
          <div className="lessons-sidebar-title">Lessons</div>
        </div>
        <div className="ce-sidebar-actions">
          <button type="button" className="toolbar-btn ce-btn" onClick={() => setEditor('new')} disabled={editBlockedReason !== null} title={editBlockedReason ?? 'Add a lesson'}>＋ Add lesson</button>
          {editBlockedReason ? <p className="ce-hint">{editBlockedReason}</p> : null}
        </div>
        <TreeGlobalActions onExpandAll={expandAll} onCollapseAll={collapseAll} />
        <p className="tree-structure-hint">
          Folders are stored in <code>src/data/lessons/structure.yaml</code>
        </p>
        {error && <p className="tree-error">{error}</p>}
        <TreeActionModal
          isOpen={modalState.open}
          mode={modalState.mode}
          itemLabel="Lesson"
          catalog={availableLessons.map(({ id, title }) => ({ id, title }))}
          folderPaths={listFolderPaths(structure)}
          onClose={() => setModalState((prev) => ({ ...prev, open: false }))}
          onSubmit={handleModalSubmit}
        />
        <CategorySection
          title="Lessons"
          onAddFolder={handleAddFolder}
          onAssignItem={handleAssignItem}
        >
          {availableLessons.length === 0 ? (
            <p className="lessons-empty">Add markdown files to <code>src/data/lessons/</code>.</p>
          ) : (
            <ContentTreeSidebar
              tree={tree}
              selectedId={activeId}
              onSelect={selectLesson}
              itemClassName="lessons-item"
              selectedClassName="lessons-item--selected"
              expandKey={expandKey}
              collapseKey={collapseKey}
              itemIcon="📄"
            />
          )}
        </CategorySection>
      </Sidebar>
      <article className="lessons-content markdown-body">
        {notice.length > 0 ? (
          <div className="ce-notice" role="status">
            {notice.map((line) => <p key={line}>{line}</p>)}
            <button type="button" className="ce-notice-close" onClick={() => setNotice([])} aria-label="Dismiss">✕</button>
          </div>
        ) : null}
        {selected ? (
          <>
            <ContentActions noun="lesson" blockedReason={editBlockedReason} onEdit={() => setEditor('edit')} onDelete={() => setDeleting(true)} />
            <LessonMarkdown content={selected.content} />
          </>
        ) : (
          <p className="lessons-empty">Select a lesson from the sidebar.</p>
        )}
      </article>
      {editor ? (
        <LessonEditorModal
          lesson={editor === 'edit' ? selected ?? null : null}
          existingIds={availableLessons.map((lesson) => lesson.id)}
          guide={guide}
          onSaveGuide={saveGuide}
          onSave={saveLesson}
          onClose={() => setEditor(null)}
          onSaved={handleSaved}
        />
      ) : null}
      {deleting && selected ? (
        <ConfirmDeleteDialog title={`Delete "${selected.title}"?`} onConfirm={handleDelete} onCancel={() => setDeleting(false)}>
          <p>This removes the lesson from this workspace, your account and every device you sync with.</p>
          {countRoadmapLinks(workspace.roadmaps, 'lessons', selected.id) > 0 ? (
            <p>It is linked from {countRoadmapLinks(workspace.roadmaps, 'lessons', selected.id)} roadmap(s). Those links are removed too.</p>
          ) : null}
        </ConfirmDeleteDialog>
      ) : null}
    </div>
  );
}

export default Lessons;
