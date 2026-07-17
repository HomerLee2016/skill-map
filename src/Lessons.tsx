import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import { lessons as availableLessons } from './utils/contentCatalog';

interface LessonsProps {
  selectedLessonId?: string;
  onSelectedLessonIdChange?: (id: string) => void;
}

function Lessons({ selectedLessonId, onSelectedLessonIdChange }: LessonsProps) {
  const [activeId, setActiveId] = useState(selectedLessonId || availableLessons[0]?.id || '');

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

  return (
    <div className="lessons-page">
      <aside className="lessons-sidebar">
        <div className="lessons-sidebar-title">Lessons</div>
        {availableLessons.length === 0 ? (
          <p className="lessons-empty">Add markdown files to <code>src/data/lessons/</code>.</p>
        ) : (
          availableLessons.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              className={
                activeId === lesson.id ? 'lessons-item lessons-item--selected' : 'lessons-item'
              }
              onClick={() => selectLesson(lesson.id)}
            >
              {lesson.title}
            </button>
          ))
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
