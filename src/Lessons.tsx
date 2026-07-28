import { useEffect, useMemo, useState } from 'react';
import { LessonMarkdown } from './utils/lessonMarkdown';
import {
  buildLessonTree,
  getInitialLessonStructure,
  lessons as availableLessons,
  promptAddFolder,
  promptAssignItem,
  type StructureTree,
} from './utils/contentCatalog';
import {
  CategorySection,
  ContentTreeSidebar,
  TreeGlobalActions,
} from './components/ContentTreeSidebar';
import { useExpandCollapseState } from './hooks/useExpandCollapseState';

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

function Lessons({ selectedLessonId, onSelectedLessonIdChange }: LessonsProps) {
  const [activeId, setActiveId] = useState(selectedLessonId || availableLessons[0]?.id || '');
  const [structure, setStructure] = useState(getInitialLessonStructure);
  const [error, setError] = useState<string | null>(null);
  const { expandKey, collapseKey, expandAll, collapseAll } = useExpandCollapseState();

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
    try {
      await saveLessonStructure(next);
      setStructure(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save structure');
    }
  };

  const handleAddFolder = () => {
    const next = promptAddFolder(structure);
    if (next) persist(next);
  };

  const handleAssignItem = () => {
    const next = promptAssignItem(
      availableLessons.map(({ id, title }) => ({ id, title })),
      structure,
      'Lesson'
    );
    if (next) persist(next);
  };

  return (
    <div className="lessons-page">
      <aside className="lessons-sidebar">
        <CategorySection
          title="Lessons"
          onAddFolder={handleAddFolder}
          onAssignItem={handleAssignItem}
        >
          <TreeGlobalActions onExpandAll={expandAll} onCollapseAll={collapseAll} />
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
