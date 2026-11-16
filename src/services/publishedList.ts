import type { SharedWorkspaceSummary } from './sharedWorkspaces';

export interface WorkspaceOption {
  key: string;
  name: string;
}

/** The signed-in user's own published snapshots, most recently published first. */
export function myPublished(shared: SharedWorkspaceSummary[], userId: string | undefined): SharedWorkspaceSummary[] {
  if (!userId) return [];
  return shared
    .filter((item) => item.ownerId === userId)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/**
 * Workspaces that can still be published as new. A workspace has at most one published snapshot, so the ones
 * already published are left out here and updated from the published list instead.
 */
export function unpublishedOptions(options: WorkspaceOption[], published: SharedWorkspaceSummary[]): WorkspaceOption[] {
  const taken = new Set(published.map((item) => item.sourceWorkspaceKey));
  return options.filter((option) => !taken.has(option.key));
}

/** "16 Nov 2026, 13:47" style text for a stored ISO timestamp; empty when it cannot be read. */
export function formatPublishedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
