import { useState } from 'react';
import { TopBar } from './components/TopBar';
import Roadmap from './Roadmap';
import Lessons from './Lessons';
import Tests from './Tests';
import type { PageId } from './types';

function App() {
  const [page, setPage] = useState<PageId>('roadmap');
  const [darkMode, setDarkMode] = useState(true);
  const [selectedLessonId, setSelectedLessonId] = useState<string | undefined>();
  const [selectedTestId, setSelectedTestId] = useState<string | undefined>();

  const goToLesson = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setPage('lessons');
  };

  const goToTest = (testId: string) => {
    setSelectedTestId(testId);
    setPage('tests');
  };

  return (
    <div className={darkMode ? 'app-layout app-shell-dark' : 'app-layout app-shell-light'}>
      <TopBar
        currentPage={page}
        onNavigate={setPage}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />
      <main className="app-main">
        <div
          className={page === 'roadmap' ? 'page-panel page-panel--active' : 'page-panel'}
          aria-hidden={page !== 'roadmap'}
        >
          <Roadmap darkMode={darkMode} onGoToLesson={goToLesson} onGoToTest={goToTest} />
        </div>
        <div
          className={page === 'lessons' ? 'page-panel page-panel--active' : 'page-panel'}
          aria-hidden={page !== 'lessons'}
        >
          <Lessons
            selectedLessonId={selectedLessonId}
            onSelectedLessonIdChange={setSelectedLessonId}
          />
        </div>
        <div
          className={page === 'tests' ? 'page-panel page-panel--active' : 'page-panel'}
          aria-hidden={page !== 'tests'}
        >
          <Tests selectedTestId={selectedTestId} onSelectedTestIdChange={setSelectedTestId} />
        </div>
      </main>
    </div>
  );
}

export default App;
