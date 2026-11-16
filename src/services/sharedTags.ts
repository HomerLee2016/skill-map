import type { SharedWorkspaceSummary } from './sharedWorkspaces';

export const MAX_TAGS = 10;
export const MAX_TAG_LENGTH = 30;

/** One tag as stored: trimmed, lowercase, single spaces, no leading "#". Empty when nothing is left. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_TAG_LENGTH).trim();
}

/** A clean tag list: normalised, no empty ones, no duplicates, at most MAX_TAGS, in the order given. */
export function normalizeTags(raw: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of raw) {
    const tag = normalizeTag(entry);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length === MAX_TAGS) break;
  }
  return out;
}

/** Every tag in use with how many shared workspaces carry it, most used first (then A to Z). */
export function tagCounts(items: readonly Pick<SharedWorkspaceSummary, 'tags'>[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
