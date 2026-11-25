import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCloudSync } from '../hooks/useCloudSync';
import { formatLastSync } from '../utils/syncStatus';
import { SyncConflictDialog } from './SyncConflictDialog';
import { WorkspaceReviewDialog } from './WorkspaceReviewDialog';
import { RevisionGuardDialog } from './RevisionGuardDialog';
import { ContentConflictDialog } from './ContentConflictDialog';

/** Single user icon in the top bar; account, sync and sign-out live in its dropdown. */
export function UserMenu() {
  const { isConfigured, user, signInWithGoogle, signOut } = useAuth();
  const { syncNow, isSyncing, error, lastSync, autoSync, setAutoSync, conflict, resolveConflict, contentConflicts, resolveContent, review } = useCloudSync();
  const [conflictsOpen, setConflictsOpen] = useState(true);
  // New conflicts from a later sync open the dialog again.
  useEffect(() => { setConflictsOpen(true); }, [contentConflicts.length]);
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  // Keep the relative time fresh while someone is looking at it.
  useEffect(() => {
    if (!lastSync) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [lastSync, isOpen]);

  if (!isConfigured) return null;

  return (
    <div className="top-bar-user" ref={menuRef}>
      <button
        type="button"
        className="top-bar-user-icon"
        onClick={() => setIsOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Account menu"
        title={user?.email ?? 'Account'}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" />
        </svg>
      </button>
      {/* Always rendered: on mobile the list sits open inside the hamburger menu (see mobile.css) */}
      {(
        <div className={isOpen ? 'top-bar-user-menu' : 'top-bar-user-menu top-bar-user-menu--closed'} role="menu">
          {user ? (
            <>
              <div className="top-bar-user-menu-account">
                <div className="top-bar-user-menu-title">Signed in as</div>
                <div className="top-bar-user-menu-email">{user.email}</div>
              </div>
              {lastSync ? <div className="top-bar-user-menu-sync-status">{formatLastSync(lastSync, now)}</div> : null}
              <button
                type="button"
                className="top-bar-workspace-menu-item"
                onClick={() => { void syncNow(); }}
                disabled={isSyncing}
                title={error ?? undefined}
              >
                {isSyncing ? 'Syncing…' : error ? 'Sync failed – retry' : 'Sync now'}
              </button>
              {contentConflicts.length > 0 ? (
                <button type="button" className="top-bar-workspace-menu-item ce-conflict-link" onClick={() => setConflictsOpen(true)}>
                  ⚠ {contentConflicts.length} item{contentConflicts.length === 1 ? '' : 's'} changed in two places
                </button>
              ) : null}
              <label className="top-bar-user-menu-toggle">
                <span>Auto sync</span>
                <span className={autoSync ? 'toggle-track toggle-track--on' : 'toggle-track'}>
                  <input
                    type="checkbox"
                    className="toggle-input"
                    checked={autoSync}
                    onChange={(e) => setAutoSync(e.target.checked)}
                  />
                  <span className="toggle-knob" />
                </span>
              </label>
              <button
                type="button"
                className="top-bar-workspace-menu-item"
                onClick={() => { setIsOpen(false); void signOut(); }}
              >
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              className="top-bar-workspace-menu-item"
              onClick={() => { void signInWithGoogle(); }}
            >
              Sign in with Google
            </button>
          )}
        </div>
      )}
      {contentConflicts.length > 0 && conflictsOpen && !conflict ? (
        <ContentConflictDialog refs={contentConflicts} busy={isSyncing} onChoose={(ref, choice) => { void resolveContent(ref, choice); }} onClose={() => setConflictsOpen(false)} />
      ) : null}
      {review?.type === 'content' ? <WorkspaceReviewDialog items={review.items} onDone={review.answer} /> : null}
      {review?.type === 'revision' ? <RevisionGuardDialog rows={review.rows} onDone={review.answer} /> : null}
      {conflict ? <SyncConflictDialog conflict={conflict} busy={isSyncing} onChoose={(choice) => { void resolveConflict(choice); }} /> : null}
    </div>
  );
}
