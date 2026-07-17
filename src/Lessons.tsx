import { useState } from 'react';
import Markdown from 'react-markdown';

const lessonModules = import.meta.glob('./data/lessons/*.md', { query: '?raw', eager: true });

interface Lesson {
  id: string;
  title: string;
  content: string;
}

function titleFromMarkdown(content: string, id: string): string {
  const match = content.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim() || id.replace(/[-_]/g, ' ');
}

const initialLessons: Lesson[] = Object.entries(lessonModules)
  .map(([path, module]) => {
    const content = typeof module === 'string' ? module : (module as { default: string }).default;
    const id = path.split('/').pop()?.replace('.md', '') || 'untitled';
    return { id, title: titleFromMarkdown(content, id), content };
  })
  .sort((a, b) => a.title.localeCompare(b.title));

function Lessons() {
  const [selectedId, setSelectedId] = useState(initialLessons[0]?.id ?? '');
  const selected = initialLessons.find((lesson) => lesson.id === selectedId);

  return (
    <div className="lessons-page">
      <aside className="lessons-sidebar">
        <div className="lessons-sidebar-title">Lessons</div>
        {initialLessons.length === 0 ? (
          <p className="lessons-empty">Add markdown files to <code>src/data/lessons/</code>.</p>
        ) : (
          initialLessons.map((lesson) => (
            <button
              key={lesson.id}
              type="button"
              className={
                selectedId === lesson.id ? 'lessons-item lessons-item--selected' : 'lessons-item'
              }
              onClick={() => setSelectedId(lesson.id)}
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
