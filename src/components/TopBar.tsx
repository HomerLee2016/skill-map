import { useEffect, useRef, useState } from 'react';
import { UserMenu } from './UserMenu';
import { useWorkspace } from '../contexts/WorkspaceContext';
import type { PageId } from '../types';
import { handleWorkspaceTriggerClick } from './workspaceTrigger';
import { RemoveWorkspaceDialog } from './RemoveWorkspaceDialog';
import { useAuth } from '../contexts/AuthContext';
import { mergeWorkspaceLists, type WorkspaceListEntry } from '../utils/workspaceList';
import { buildImportedWorkspace, filesFromFileList, filesFromZip } from '../services/workspaceImport';

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
    selectCloudWorkspace,
    importWorkspace,
    removeWorkspace,
    refreshCloudWorkspaces,
    cloudWorkspaces,
    refreshWorkspaceHistoryCounts,
    isLoading,
    selectedDirectoryHandle,
    workspaceSelectionLabel,
    workspaceHistory,
  } = useWorkspace();
  const { user } = useAuth();
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<WorkspaceListEntry | null>(null);
  const hasDirectoryPicker = typeof window !== 'undefined' && typeof (window as Window & { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
  const workspaceEntries = mergeWorkspaceLists(workspaceHistory, cloudWorkspaces);
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement | null>(null);
  const [isNavOpen, setIsNavOpen] = useState(false);
  const navRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(event.target as Node)) {
        setIsWorkspaceMenuOpen(false);
      }
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setIsNavOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const handleSelectWorkspace = async () => {
    setIsWorkspaceMenuOpen(false);
    // Phones and Firefox/Safari have no directory picker: fall back to a folder <input>.
    if (hasDirectoryPicker) await selectWorkspace();
    else folderInputRef.current?.click();
  };

  const handlePickedFiles = async (list: FileList | null, zip: boolean) => {
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    try {
      const imported = zip
        ? await buildImportedWorkspace(await filesFromZip(files[0]), files[0].name.replace(/\.zip$/i, ''))
        : await buildImportedWorkspace(filesFromFileList(files), 'Imported workspace');
      await importWorkspace(imported);
    } catch (error) {
      console.error('Failed to import workspace', error);
      window.alert('Could not read that folder or zip.');
    }
  };

  const handleWorkspaceTrigger = async () => {
    void refreshCloudWorkspaces();
    await handleWorkspaceTriggerClick({
      toggleMenu: () => setIsWorkspaceMenuOpen((value) => !value),
      refreshWorkspaceHistoryCounts,
    });
  };

  const handleOpenWorkspace = async (entry: WorkspaceListEntry) => {
    setIsWorkspaceMenuOpen(false);
    if (entry.local) await selectWorkspaceFromHistory(entry.local);
    else await selectCloudWorkspace({ key: entry.key, name: entry.name });
  };

  const darkModeToggle = (className: string) => (
    <label className={className}>
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
  );

  return (
    <header className="top-bar" ref={navRef}>
      <div className="top-bar-start">
        <button
          type="button"
          className="top-bar-hamburger"
          onClick={() => setIsNavOpen((value) => !value)}
          aria-label="Menu"
          aria-expanded={isNavOpen}
          aria-controls="top-bar-menu"
        >
          <span className="top-bar-hamburger-bar" />
          <span className="top-bar-hamburger-bar" />
          <span className="top-bar-hamburger-bar" />
        </button>
        <div className="top-bar-brand">Skill Map</div>
      </div>
      <div className="top-bar-workspace-pill" ref={workspaceMenuRef}>
        <span className="top-bar-workspace-label">{workspaceSelectionLabel}</span>
        <button
          type="button"
          className="top-bar-workspace-trigger"
          onClick={() => { void handleWorkspaceTrigger(); }}
          aria-expanded={isWorkspaceMenuOpen}
          aria-haspopup="menu"
        >
          {isLoading ? 'Loading…' : selectedDirectoryHandle || cloudWorkspaces.length > 0 ? 'Change Workspace' : 'Select Local Workspace'}
        </button>
        {isWorkspaceMenuOpen ? (
          <div className="top-bar-workspace-menu" role="menu">
            {workspaceEntries.length > 0 ? (
              <div className="top-bar-workspace-menu-section">
                <div className="top-bar-workspace-menu-title">Workspaces</div>
                {workspaceEntries.map((entry) => (
                  <div key={entry.key} className="top-bar-workspace-menu-item-row">
                    <button
                      type="button"
                      className="top-bar-workspace-menu-item"
                      onClick={() => { void handleOpenWorkspace(entry); }}
                    >
                      <span className="top-bar-workspace-menu-item-label">{entry.name}</span>
                      {entry.inCloud ? <span className="top-bar-workspace-cloud" title="Saved in your account">☁</span> : null}
                      {typeof entry.pendingCount === 'number' ? (
                        <span className="top-bar-workspace-badge">{entry.pendingCount}</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="top-bar-workspace-menu-remove"
                      onClick={() => { setIsWorkspaceMenuOpen(false); setPendingRemoval(entry); }}
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
            {hasDirectoryPicker ? null : (
              <button
                type="button"
                className="top-bar-workspace-menu-item top-bar-workspace-menu-item--action"
                onClick={() => { setIsWorkspaceMenuOpen(false); zipInputRef.current?.click(); }}
              >
                + Import .zip
              </button>
            )}
          </div>
        ) : null}
        <input
          ref={folderInputRef}
          type="file"
          className="visually-hidden-input"
          multiple
          {...{ webkitdirectory: '', directory: '' }}
          onChange={(event) => { void handlePickedFiles(event.target.files, false); event.target.value = ''; }}
        />
        <input
          ref={zipInputRef}
          type="file"
          className="visually-hidden-input"
          accept=".zip,application/zip,application/x-zip-compressed"
          onChange={(event) => { void handlePickedFiles(event.target.files, true); event.target.value = ''; }}
        />
      </div>
      {pendingRemoval ? (
        <RemoveWorkspaceDialog
          entry={pendingRemoval}
          canDeleteCloud={Boolean(user)}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={async (alsoCloud) => {
            await removeWorkspace(
              { key: pendingRemoval.key, name: pendingRemoval.name, local: pendingRemoval.local },
              { alsoCloud },
            );
            setPendingRemoval(null);
          }}
        />
      ) : null}
      <div id="top-bar-menu" className={isNavOpen ? 'top-bar-menu top-bar-menu--open' : 'top-bar-menu'}>
        <nav className="top-bar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={currentPage === item.id ? 'top-bar-link top-bar-link--active' : 'top-bar-link'}
              onClick={() => {
                setIsNavOpen(false);
                onNavigate(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      <div className="top-bar-actions">
        <UserMenu />
        {darkModeToggle('top-bar-theme')}
      </div>
      </div>
    </header>
  );
}
