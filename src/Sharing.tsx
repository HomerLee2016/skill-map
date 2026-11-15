import { useCallback, useEffect, useState } from 'react';
import { BrowseSharedPanel } from './components/sharing/BrowseSharedPanel';
import { ShareWorkspacePanel } from './components/sharing/ShareWorkspacePanel';
import { useAuth } from './contexts/AuthContext';
import { supabase } from './lib/supabaseClient';
import { listSharedWorkspaces, type SharedWorkspaceSummary } from './services/sharedWorkspaces';
import { applyReaction, fetchMyReactions, fetchStats, NO_REACTION, NO_STATS, saveReaction, type Reaction, type SharedStats } from './services/sharedReactions';

type Tab = 'browse' | 'share';

/** Sharing hub: publish snapshots of your workspaces and clone other people's into new workspaces. */
function Sharing({ active }: { active: boolean }) {
  const { user, isConfigured, signInWithGoogle } = useAuth();
  const [tab, setTab] = useState<Tab>('browse');
  const [shared, setShared] = useState<SharedWorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Map<string, SharedStats>>(new Map());
  const [mine, setMine] = useState<Map<string, Reaction>>(new Map());
  // False when the votes migration has not been run: the list still works, without vote and star buttons.
  const [reactionsAvailable, setReactionsAvailable] = useState(true);
  const [reactionError, setReactionError] = useState<string | null>(null);
  const userId = user?.id ?? null;

  const reload = useCallback(async () => {
    if (!supabase || !userId) { setShared([]); return; }
    setLoading(true);
    try {
      setShared(await listSharedWorkspaces(supabase));
      setError(null);
      try {
        const [nextStats, nextMine] = await Promise.all([fetchStats(supabase), fetchMyReactions(supabase)]);
        setStats(nextStats);
        setMine(nextMine);
        setReactionsAvailable(true);
      } catch (reactionFailure) {
        console.error('Votes and stars are unavailable', reactionFailure);
        setReactionsAvailable(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load shared workspaces');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  /** Updates the screen at once, saves, and puts the old state back if the save fails. */
  const react = useCallback(async (sharedId: string, next: Reaction) => {
    if (!supabase || !userId) return;
    const before = mine.get(sharedId) ?? NO_REACTION;
    const apply = (from: Reaction, to: Reaction, reaction: Reaction) => {
      setMine((current) => new Map(current).set(sharedId, reaction));
      setStats((current) => new Map(current).set(sharedId, applyReaction(current.get(sharedId) ?? NO_STATS, from, to)));
    };
    setReactionError(null);
    apply(before, next, next);
    try {
      await saveReaction(supabase, userId, sharedId, next);
    } catch (err) {
      apply(next, before, before);
      setReactionError(err instanceof Error ? err.message : 'Could not save your vote');
    }
  }, [mine, userId]);

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
            <button type="button" className="toolbar-btn" onClick={() => { void signInWithGoogle(); }}>Sign in with Google</button>
          </div>
        ) : (
          <>
            <div className="sharing-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === 'browse'} className={tab === 'browse' ? 'sharing-tab sharing-tab--active' : 'sharing-tab'} onClick={() => setTab('browse')}>Browse shared</button>
              <button type="button" role="tab" aria-selected={tab === 'share'} className={tab === 'share' ? 'sharing-tab sharing-tab--active' : 'sharing-tab'} onClick={() => setTab('share')}>Share my workspace</button>
            </div>
            {tab === 'browse'
              ? <BrowseSharedPanel shared={shared} loading={loading} error={reactionError ?? error} onChanged={reload} stats={reactionsAvailable ? stats : null} mine={mine} onReact={react} />
              : <ShareWorkspacePanel shared={shared} onChanged={reload} />}
          </>
        )}
      </div>
    </div>
  );
}

export default Sharing;
