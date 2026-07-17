import { useEffect, useMemo, useState } from 'react';
import Markdown from 'react-markdown';
import {
  addFolderToTree,
  assignItemToTree,
  buildLessonTree,
  getInitialLessonStructure,
  lessons as availableLessons,
  listFolderPaths,
  pathToSegments,
  type StructureTree,
} from './utils/contentCatalog';
import { ContentTreeSidebar } from './components/ContentTreeSidebar';

interface LessonsProps {
  selectedLessonId?: string;
  onSelectedLessonIdChange?: (id: string) => void;
}

async function saveLessonStructure(structure: StructureTree) {
  const response = await fetch('/api/save-structure', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind: 'lessons', structure }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) {
    throw new Error(result?.error || 'Failed to save lesson structure');
  }
}

function promptAssign(
  catalog: { id: string; title: string }[],
  structure: StructureTree
): { itemId: string; parentPath: string[] } | null {
  const options = catalog.map((item) => `${item.id} — ${item.title}`).join('\n');
  const itemId = window.prompt(`Lesson id to place in a folder:\n${options}`);
  if (!itemId?.trim()) return null;
  if (!catalog.some((item) => item.id === itemId.trim())) {
    window.alert(`Unknown lesson id: ${itemId}`);
    return null;
  }

  const paths = listFolderPaths(structure);
  if (paths.length === 0) {
    window.alert('Create a folder first, then assign items into it.');
    return null;
  }
  const choice = window.prompt(
    `Folder path (leave empty for root).\nAvailable:\n${paths.join('\n')}`,
    paths[0]
  );
  if (choice === null) return null;
  return {
    itemId: itemId.trim(),
    parentPath: choice.trim() ? pathToSegments(choice) : [],
  };
}

function Lessons({ selectedLessonId, onSelectedLessonIdChange }: LessonsProps) {
  const [activeId, setActiveId] = useState(selectedLessonId || availableLessons[0]?.id || '');
  const [structure, setStructure] = useState(getInitialLessonStructure);
  const [error, setError] = useState<string | null>(null);

  const tree = useMemo(() => buildLessonTree(structure), [structure]);

  useEffect(() => {
    if (selectedLessonId) {
      setActiveId(selectedLessonId);
    }
  }, [selectedLessonId]);

  const selected = availableLessons.find((lesson) => lesson.id === activeId);

  const selectLesson = (id: string) => {
    setActiveId(id);
    onSelectedLessonIdChange?.(id);
  };

  const persist = async (next: StructureTree) => {
    await saveLessonStructure(next);
    setStructure(next);
    setError(null);
  };

  const handleAddFolder = async () => {
    const name = window.prompt('New folder name');
    if (!name?.trim()) return;

    const paths = listFolderPaths(structure);
    let parentPath: string[] = [];
    if (paths.length > 0) {
      const choice = window.prompt(
        `Parent folder path (leave empty for root).\nAvailable:\n${paths.join('\n')}`,
        ''
      );
      if (choice === null) return;
      parentPath = choice.trim() ? pathToSegments(choice) : [];
    }

    try {
      await persist(addFolderToTree(structure, name, parentPath));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save structure');
    }
  };

  const handleAssignItem = async () => {
    const assignment = promptAssign(
      availableLessons.map(({ id, title }) => ({ id, title })),
      structure
    );
    if (!assignment) return;
    try {
      await persist(assignItemToTree(structure, assignment.itemId, assignment.parentPath));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save structure');
    }
  };

  return (
    <div className="lessons-page">
      <aside className="lessons-sidebar">
        <div className="lessons-sidebar-header">
          <div className="lessons-sidebar-title">Lessons</div>
          <div className="tree-header-actions">
            <button
              type="button"
              className="tree-assign-item"
              title="Assign lesson to folder"
              onClick={handleAssignItem}
            >
              ⤵
            </button>
            <button type="button" className="tree-add-folder" title="Add folder" onClick={handleAddFolder}>
              +
            </button>
          </div>
        </div>
        <p className="tree-structure-hint">
          Folders are stored in <code>src/data/lessons/structure.yaml</code>
        </p>
        {error && <p className="tree-error">{error}</p>}
        {availableLessons.length === 0 ? (
          <p className="lessons-empty">Add markdown files to <code>src/data/lessons/</code>.</p>
        ) : (
          <ContentTreeSidebar
            tree={tree}
            selectedId={activeId}
            onSelect={selectLesson}
            itemClassName="lessons-item"
            selectedClassName="lessons-item--selected"
          />
        )}
      </aside>
      <article className="lessons-content markdown-body">
        {selected ? (
          <Markdown>{selected.content}</Markdown>
        ) : (
          <p className="lessons-empty">Select a lesson from the sidebar.</p>
        )}
      </article>
    </div>
  );
}

export default Lessons;
