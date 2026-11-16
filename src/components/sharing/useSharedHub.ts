import { useCallback, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { applyReaction, fetchMyReactions, fetchStats, NO_REACTION, NO_STATS, saveReaction, type Reaction, type SharedStats } from '../../services/sharedReactions';
import { listSharedWorkspaces, type SharedWorkspaceSummary } from '../../services/sharedWorkspaces';

/** Everything the sharing hub shows: the shared list, its vote and star totals, and your own reactions. */
export function useSharedHub(userId: string | null) {
  const [shared, setShared] = useState<SharedWorkspaceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Map<string, SharedStats>>(new Map());
  const [mine, setMine] = useState<Map<string, Reaction>>(new Map());
  // False when the votes migration has not been run: the list still works, without vote and star buttons.
  const [reactionsAvailable, setReactionsAvailable] = useState(true);
  const [reactionError, setReactionError] = useState<string | null>(null);

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
    const apply = (from: Reaction, to: Reaction) => {
      setMine((current) => new Map(current).set(sharedId, to));
      setStats((current) => new Map(current).set(sharedId, applyReaction(current.get(sharedId) ?? NO_STATS, from, to)));
    };
    setReactionError(null);
    apply(before, next);
    try {
      await saveReaction(supabase, userId, sharedId, next);
    } catch (err) {
      apply(next, before);
      setReactionError(err instanceof Error ? err.message : 'Could not save your vote');
    }
  }, [mine, userId]);

  return { shared, loading, error: reactionError ?? error, stats: reactionsAvailable ? stats : null, mine, reload, react };
}
