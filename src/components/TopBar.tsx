import { useEffect, useRef, useState } from 'react';
import { useWorkspace } from '../contexts/WorkspaceContext';
import type { PageId } from '../types';
import { handleWorkspaceTriggerClick } from './workspaceTrigger';

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
  { id: 'revision', label: 'Revision' },
];

export function TopBar({ currentPage, onNavigate, darkMode, setDarkMode }: TopBarProps) {
  const {
    selectWorkspace,
    selectWorkspaceFromHistory,
    removeWorkspaceHistoryEntry,
    refreshWorkspaceHistoryCounts,
    isLoading,
    selectedDirectoryHandle,
    workspaceSelectionLabel,
    workspaceHistory,
  } = useWorkspace();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleSelectWorkspace = async () => {
    setIsWorkspaceMenuOpen(false);
    await selectWorkspace();
  };

  const handleWorkspaceTrigger = async () => {
    await handleWorkspaceTriggerClick({
      toggleMenu: () => setIsWorkspaceMenuOpen((value) => !value),
      refreshWorkspaceHistoryCounts,
    });
  };

  const handleHistoryWorkspace = async (entry: { name: string; path: string }) => {
    setIsWorkspaceMenuOpen(false);
    await selectWorkspaceFromHistory(entry);
  };

  const handleRemoveHistoryEntry = (entry: { name: string; path: string }) => {
    removeWorkspaceHistoryEntry(entry);
  };

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
      <div className="top-bar-actions">
        <div className="top-bar-workspace-pill" ref={workspaceMenuRef}>
          <span className="top-bar-workspace-label">{workspaceSelectionLabel}</span>
          <button
            type="button"
            className="top-bar-workspace-trigger"
            onClick={() => { void handleWorkspaceTrigger(); }}
            aria-expanded={isWorkspaceMenuOpen}
            aria-haspopup="menu"
          >
            {isLoading ? 'Loading…' : selectedDirectoryHandle ? 'Change Workspace' : 'Select Local Workspace'}
          </button>
          {isWorkspaceMenuOpen ? (
            <div className="top-bar-workspace-menu" role="menu">
              {workspaceHistory.length > 0 ? (
                <div className="top-bar-workspace-menu-section">
                  <div className="top-bar-workspace-menu-title">Recent workspaces</div>
                  {workspaceHistory.map((entry) => (
                    <div key={`${entry.path}-${entry.name}`} className="top-bar-workspace-menu-item-row">
                      <button
                        type="button"
                        className="top-bar-workspace-menu-item"
                        onClick={() => { void handleHistoryWorkspace(entry); }}
                      >
                        <span className="top-bar-workspace-menu-item-label">{entry.name}</span>
                        {typeof (entry as any).pendingCount === 'number' ? (
                          <span className="top-bar-workspace-badge">{(entry as any).pendingCount}</span>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        className="top-bar-workspace-menu-remove"
                        onClick={() => handleRemoveHistoryEntry(entry)}
                        aria-label={`Remove ${entry.name}`}
                        title={`Remove ${entry.name}`}
                      >
                        🗑️
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                className="top-bar-workspace-menu-item top-bar-workspace-menu-item--action"
                onClick={() => { void handleSelectWorkspace(); }}
              >
                + Browse from local
              </button>
            </div>
          ) : null}
        </div>
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
      </div>
    </header>
  );
}
