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

export type SortMode = 'newest' | 'oldest' | 'title' | 'author' | 'top' | 'stars';

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
  /** Title contains (case-insensitive). */
  title?: string;
  /** Author label contains (case-insensitive). */
  author?: string;
  /** Published on or after this local day, "YYYY-MM-DD". */
  publishedAfter?: string;
  /** Published on or before this local day, "YYYY-MM-DD". */
  publishedBefore?: string;
  sort: SortMode;
  starredOnly: boolean;
}

/** The local calendar day of an ISO timestamp as "YYYY-MM-DD" (empty when unreadable). */
export function localDay(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** How many filters are switched on, for the badge on the filter icon. */
export function activeFilterCount(options: Pick<BrowseOptions, 'title' | 'author' | 'publishedAfter' | 'publishedBefore' | 'starredOnly'>): number {
  return [options.title?.trim(), options.author?.trim(), options.publishedAfter, options.publishedBefore, options.starredOnly].filter(Boolean).length;
}

/** Search, filters and sorting for the browse list. Ties fall back to newest published first. */
export function arrangeShared(
  items: SharedWorkspaceSummary[],
  stats: Map<string, SharedStats>,
  mine: Map<string, Reaction>,
  { title = '', author = '', publishedAfter = '', publishedBefore = '', sort, starredOnly }: BrowseOptions,
): SharedWorkspaceSummary[] {
  const titleNeedle = title.trim().toLowerCase();
  const authorNeedle = author.trim().toLowerCase();
  const get = (id: string) => stats.get(id) ?? NO_STATS;
  const newest = (a: SharedWorkspaceSummary, b: SharedWorkspaceSummary) => b.publishedAt.localeCompare(a.publishedAt);
  return items
    .filter((item) => {
      if (titleNeedle && !item.name.toLowerCase().includes(titleNeedle)) return false;
      if (authorNeedle && !item.ownerLabel.toLowerCase().includes(authorNeedle)) return false;
      const day = localDay(item.publishedAt);
      if (publishedAfter && day < publishedAfter) return false;
      if (publishedBefore && day > publishedBefore) return false;
      return !starredOnly || Boolean(mine.get(item.id)?.starred);
    })
    .sort((a, b) => {
      if (sort === 'top') return score(get(b.id)) - score(get(a.id)) || newest(a, b);
      if (sort === 'stars') return get(b.id).stars - get(a.id).stars || newest(a, b);
      if (sort === 'oldest') return a.publishedAt.localeCompare(b.publishedAt);
      if (sort === 'title') return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || newest(a, b);
      if (sort === 'author') return a.ownerLabel.localeCompare(b.ownerLabel, undefined, { sensitivity: 'base' }) || newest(a, b);
      return newest(a, b);
    });
}
