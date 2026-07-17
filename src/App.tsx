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
        {page === 'roadmap' && (
          <Roadmap darkMode={darkMode} onGoToLesson={goToLesson} onGoToTest={goToTest} />
        )}
        {page === 'lessons' && (
          <Lessons selectedLessonId={selectedLessonId} onSelectedLessonIdChange={setSelectedLessonId} />
        )}
        {page === 'tests' && (
          <Tests selectedTestId={selectedTestId} onSelectedTestIdChange={setSelectedTestId} />
        )}
      </main>
    </div>
  );
}

export default App;
