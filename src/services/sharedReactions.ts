import type { SupabaseClient } from '@supabase/supabase-js';
import type { SharedWorkspaceSummary } from './sharedWorkspaces';

export type Vote = -1 | 0 | 1;

/** One user's reaction to one shared workspace. */
export interface Reaction {
  vote: Vote;
  starred: boolean;
}

export interface SharedStats {
  upvotes: number;
  downvotes: number;
  stars: number;
}

export type SortMode = 'newest' | 'top' | 'stars';

export const NO_REACTION: Reaction = { vote: 0, starred: false };
export const NO_STATS: SharedStats = { upvotes: 0, downvotes: 0, stars: 0 };

function fail(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

/** Totals per shared workspace id (counts only; who voted is never visible). */
export async function fetchStats(client: SupabaseClient): Promise<Map<string, SharedStats>> {
  const { data, error } = await client.from('shared_workspace_stats').select('shared_id,upvotes,downvotes,stars');
  fail(error);
  return new Map((data ?? []).map((row) => [row.shared_id as string, {
    upvotes: Number(row.upvotes), downvotes: Number(row.downvotes), stars: Number(row.stars),
  }]));
}

/** The signed-in user's own votes and stars (RLS returns only their rows). */
export async function fetchMyReactions(client: SupabaseClient): Promise<Map<string, Reaction>> {
  const { data, error } = await client.from('shared_workspace_reactions').select('shared_id,vote,starred');
  fail(error);
  return new Map((data ?? []).map((row) => [row.shared_id as string, { vote: (Number(row.vote) || 0) as Vote, starred: Boolean(row.starred) }]));
}

export async function saveReaction(client: SupabaseClient, userId: string, sharedId: string, reaction: Reaction): Promise<void> {
  const { error } = await client.from('shared_workspace_reactions').upsert(
    { user_id: userId, shared_id: sharedId, vote: reaction.vote, starred: reaction.starred },
    { onConflict: 'user_id,shared_id' },
  );
  fail(error);
}

/** Clicking the active vote clears it; clicking the other one switches. */
export function toggleVote(current: Reaction, clicked: 1 | -1): Reaction {
  return { ...current, vote: current.vote === clicked ? 0 : clicked };
}

export function toggleStar(current: Reaction): Reaction {
  return { ...current, starred: !current.starred };
}

/** Totals after one user's reaction changes from `before` to `after` (for instant feedback before the server answers). */
export function applyReaction(stats: SharedStats, before: Reaction, after: Reaction): SharedStats {
  return {
    upvotes: stats.upvotes - (before.vote === 1 ? 1 : 0) + (after.vote === 1 ? 1 : 0),
    downvotes: stats.downvotes - (before.vote === -1 ? 1 : 0) + (after.vote === -1 ? 1 : 0),
    stars: stats.stars - (before.starred ? 1 : 0) + (after.starred ? 1 : 0),
  };
}

export const score = (stats: SharedStats) => stats.upvotes - stats.downvotes;

export interface BrowseOptions {
  query: string;
  sort: SortMode;
  starredOnly: boolean;
}

/** Search, "my starred" filter and sorting for the browse list. Ties fall back to newest first. */
export function arrangeShared(
  items: SharedWorkspaceSummary[],
  stats: Map<string, SharedStats>,
  mine: Map<string, Reaction>,
  { query, sort, starredOnly }: BrowseOptions,
): SharedWorkspaceSummary[] {
  const needle = query.trim().toLowerCase();
  const get = (id: string) => stats.get(id) ?? NO_STATS;
  const newest = (a: SharedWorkspaceSummary, b: SharedWorkspaceSummary) => b.updatedAt.localeCompare(a.updatedAt);
  return items
    .filter((item) => (!needle || `${item.name} ${item.description} ${item.ownerLabel}`.toLowerCase().includes(needle))
      && (!starredOnly || mine.get(item.id)?.starred))
    .sort((a, b) => {
      if (sort === 'top') return score(get(b.id)) - score(get(a.id)) || newest(a, b);
      if (sort === 'stars') return get(b.id).stars - get(a.id).stars || newest(a, b);
      return newest(a, b);
    });
}
