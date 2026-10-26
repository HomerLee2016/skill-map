import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useCloudSync } from '../hooks/useCloudSync';

/** Single user icon in the top bar; account, sync and sign-out live in its dropdown. */
export function UserMenu() {
  const { isConfigured, user, signInWithGoogle, signOut } = useAuth();
  const { syncNow, isSyncing, error, autoSync, setAutoSync } = useCloudSync();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

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
      {isOpen ? (
        <div className="top-bar-user-menu" role="menu">
          {user ? (
            <>
              <div className="top-bar-user-menu-account">
                <div className="top-bar-user-menu-title">Signed in as</div>
                <div className="top-bar-user-menu-email">{user.email}</div>
              </div>
              <button
                type="button"
                className="top-bar-workspace-menu-item"
                onClick={() => { void syncNow(); }}
                disabled={isSyncing}
                title={error ?? undefined}
              >
                {isSyncing ? 'Syncing…' : error ? 'Sync failed – retry' : 'Sync now'}
              </button>
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
      ) : null}
    </div>
  );
}
