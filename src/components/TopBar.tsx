import type { PageId } from '../types';

interface TopBarProps {
  currentPage: PageId;
  onNavigate: (page: PageId) => void;
  darkMode: boolean;
  setDarkMode: (value: boolean) => void;
}

const NAV_ITEMS: { id: PageId; label: string }[] = [
  { id: 'roadmap', label: 'Roadmap' },
  { id: 'lessons', label: 'Lessons' },
  { id: 'tests', label: 'Tests' },
];

export function TopBar({ currentPage, onNavigate, darkMode, setDarkMode }: TopBarProps) {
  return (
    <header className="top-bar">
      <div className="top-bar-brand">Skill Map</div>
      <nav className="top-bar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={currentPage === item.id ? 'top-bar-link top-bar-link--active' : 'top-bar-link'}
            onClick={() => onNavigate(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <label className="top-bar-theme">
        <span className="top-bar-theme-label">Dark mode</span>
        <span className={darkMode ? 'toggle-track toggle-track--on' : 'toggle-track'}>
          <input
            type="checkbox"
            className="toggle-input"
            checked={darkMode}
            onChange={(e) => setDarkMode(e.target.checked)}
          />
          <span className="toggle-knob" />
        </span>
      </label>
    </header>
  );
}
