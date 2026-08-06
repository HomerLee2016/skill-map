import { useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import Roadmap from './Roadmap';
import Lessons from './Lessons';
import Tests from './Tests';
import Revision from './Revision';
import { useWorkspace, WorkspaceProvider } from './contexts/WorkspaceContext';
import type { PageId } from './types';
import { shouldPromptBeforeNavigation } from './utils/unsavedChanges';

function AppContent() {
  const { workspaceVersion } = useWorkspace();
  const [page, setPage] = useState<PageId>('roadmap');
  const [hasUnsavedRoadmapChanges, setHasUnsavedRoadmapChanges] = useState(false);
  const [darkMode, setDarkMode] = useState(true);
  const [selectedLessonId, setSelectedLessonId] = useState<string | undefined>();
  const [selectedTestId, setSelectedTestId] = useState<string | undefined>();

  useEffect(() => {
    setSelectedLessonId(undefined);
    setSelectedTestId(undefined);
  }, [workspaceVersion]);

  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;

    root.classList.toggle('app-shell-dark', darkMode);
    root.classList.toggle('app-shell-light', !darkMode);
    body.classList.toggle('app-shell-dark', darkMode);
    body.classList.toggle('app-shell-light', !darkMode);
    root.style.colorScheme = darkMode ? 'dark' : 'light';

    return () => {
      root.classList.remove('app-shell-dark', 'app-shell-light');
      body.classList.remove('app-shell-dark', 'app-shell-light');
      root.style.colorScheme = '';
    };
  }, [darkMode]);

  const handleNavigate = (nextPage: PageId) => {
    if (shouldPromptBeforeNavigation(hasUnsavedRoadmapChanges, page, nextPage)) {
      const confirmLeave = window.confirm('You have unsaved roadmap changes. Do you want to leave without saving?');
      if (!confirmLeave) return;
    }

    setPage(nextPage);
  };

  const goToLesson = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    handleNavigate('lessons');
  };

  const goToTest = (testId: string) => {
    setSelectedTestId(testId);
    handleNavigate('tests');
  };

  return (
      <div className={darkMode ? 'app-layout app-shell-dark' : 'app-layout app-shell-light'}>
        <TopBar
          currentPage={page}
          onNavigate={handleNavigate}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
        />
        <main className="app-main">
          <div
            className={page === 'roadmap' ? 'page-panel page-panel--active' : 'page-panel'}
            aria-hidden={page !== 'roadmap'}
          >
            <Roadmap
              darkMode={darkMode}
              onGoToLesson={goToLesson}
              onGoToTest={goToTest}
              onUnsavedChangesChange={setHasUnsavedRoadmapChanges}
            />
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
          <div
            className={page === 'revision' ? 'page-panel page-panel--active' : 'page-panel'}
            aria-hidden={page !== 'revision'}
          >
            <Revision />
          </div>
        </main>
      </div>
  );
}

function App() {
  return (
    <WorkspaceProvider>
      <AppContent />
    </WorkspaceProvider>
  );
}

export default App;
