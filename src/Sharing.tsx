import { useEffect, useState } from 'react';
import { BrowseSharedPanel } from './components/sharing/BrowseSharedPanel';
import { ShareWorkspacePanel } from './components/sharing/ShareWorkspacePanel';
import { useSharedHub } from './components/sharing/useSharedHub';
import { useAuth } from './contexts/AuthContext';

type Tab = 'browse' | 'share';

const TABS: { id: Tab; label: string }[] = [
  { id: 'browse', label: 'Browse shared' },
  { id: 'share', label: 'Share my workspace' },
];

/** Sharing hub: publish snapshots of your workspaces and clone other people's into new workspaces. */
function Sharing({ active }: { active: boolean }) {
  const { user, isConfigured, signInWithGoogle } = useAuth();
  const [tab, setTab] = useState<Tab>('browse');
  const { shared, loading, error, stats, mine, reload, react } = useSharedHub(user?.id ?? null);

  // Refresh whenever the tab is opened so new shares show up without a reload.
  useEffect(() => { if (active) void reload(); }, [active, tab, reload]);

  return (
    <div className="sharing-page">
      <div className="sharing-inner">
        <h2 className="sharing-title">Sharing hub</h2>
        {!isConfigured ? (
          <p className="sharing-muted">Sharing needs the cloud account, which is not set up in this build.</p>
        ) : !user ? (
          <div className="sharing-signin">
            <p>Sign in to share your workspaces and to clone workspaces your friends shared.</p>
            <button type="button" className="toolbar-btn toolbar-btn--primary" onClick={() => { void signInWithGoogle(); }}>Sign in with Google</button>
          </div>
        ) : (
          <>
            <div className="sharing-tabs" role="tablist">
              {TABS.map(({ id, label }) => (
                <button key={id} type="button" role="tab" aria-selected={tab === id} className={tab === id ? 'sharing-tab sharing-tab--active' : 'sharing-tab'} onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>
            {tab === 'browse'
              ? <BrowseSharedPanel shared={shared} loading={loading} error={error} onChanged={reload} stats={stats} mine={mine} onReact={react} />
              : <ShareWorkspacePanel shared={shared} onChanged={reload} />}
          </>
        )}
      </div>
    </div>
  );
}

export default Sharing;
