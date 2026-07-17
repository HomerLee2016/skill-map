import { useState } from 'react';
import { TopBar } from './components/TopBar';
import Roadmap from './Roadmap';
import Lessons from './Lessons';
import Tests from './Tests';
import type { PageId } from './types';

function App() {
  const [page, setPage] = useState<PageId>('roadmap');
  const [darkMode, setDarkMode] = useState(true);

  return (
    <div className={darkMode ? 'app-layout app-shell-dark' : 'app-layout app-shell-light'}>
      <TopBar
        currentPage={page}
        onNavigate={setPage}
        darkMode={darkMode}
        setDarkMode={setDarkMode}
      />
      <main className="app-main">
        {page === 'roadmap' && <Roadmap darkMode={darkMode} />}
        {page === 'lessons' && <Lessons />}
        {page === 'tests' && <Tests />}
      </main>
    </div>
  );
}

export default App;
