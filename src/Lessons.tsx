import { useEffect, useMemo, useState } from 'react';
import { LessonMarkdown } from './utils/lessonMarkdown';
import {
  addFolderToTree,
  assignItemToTree,
  listFolderPaths,
  pathToSegments,
  type StructureTree,
} from './utils/contentCatalog';
import { useWorkspace } from './contexts/WorkspaceContext';
import { resolveStructureTree } from './utils/folderStructure';
import { writeWorkspaceStructureFile } from './services/workspaceStructurePersistence';
import {
  CategorySection,
  ContentTreeSidebar,
  TreeActionModal,
  TreeGlobalActions,
} from './components/ContentTreeSidebar';
import { useExpandCollapseState } from './hooks/useExpandCollapseState';

interface LessonsProps {
  selectedLessonId?: string;
  onSelectedLessonIdChange?: (id: string) => void;
}

async function saveLessonStructure(structure: StructureTree) {
  return structure;
}

function Lessons({ selectedLessonId, onSelectedLessonIdChange }: LessonsProps) {
  const { workspace, workspaceVersion, selectedDirectoryHandle } = useWorkspace();
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
      await writeWorkspaceStructureFile(selectedDirectoryHandle, 'lessons', next);
      setStructure(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save structure');
    }
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
      <aside className="lessons-sidebar">
        <div className="lessons-sidebar-header">
          <div className="lessons-sidebar-title">Lessons</div>
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
      </aside>
      <article className="lessons-content markdown-body">
        {selected ? (
          <LessonMarkdown content={selected.content} />
        ) : (
          <p className="lessons-empty">Select a lesson from the sidebar.</p>
        )}
      </article>
    </div>
  );
}

export default Lessons;
