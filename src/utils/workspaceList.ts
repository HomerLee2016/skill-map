import type { CloudWorkspaceInfo } from '../services/cloudWorkspace';
import { deriveWorkspaceStorageKey } from '../services/workspaceKey';
import type { WorkspaceHistoryEntryWithPendingCount } from './workspacePersistence';

export interface WorkspaceListEntry {
  key: string;
  name: string;
  /** Folder entry kept on this device (has a stored folder handle). */
  local?: { name: string; path: string };
  inCloud: boolean;
  pendingCount?: number;
}

/** One row per workspace: this device's recent folders merged with the user's cloud workspaces (same key = same workspace). */
export function mergeWorkspaceLists(
  history: WorkspaceHistoryEntryWithPendingCount[],
  cloud: CloudWorkspaceInfo[],
  dueCounts: Record<string, number> = {},
): WorkspaceListEntry[] {
  const byKey = new Map<string, WorkspaceListEntry>();
  for (const entry of history) {
    const key = deriveWorkspaceStorageKey(entry.path);
    byKey.set(key, { key, name: entry.name, local: { name: entry.name, path: entry.path }, inCloud: false, pendingCount: entry.pendingCount });
  }
  const bundledKey = deriveWorkspaceStorageKey(null);
  for (const workspace of cloud) {
    // The bundled demo also has a cloud row (it holds revision progress); it is not a workspace to pick or delete.
    if (workspace.key === bundledKey) continue;
    const existing = byKey.get(workspace.key);
    if (existing) existing.inCloud = true;
    else byKey.set(workspace.key, { key: workspace.key, name: workspace.name, inCloud: true });
  }
  // The badge is the due-revision count for the workspace key, so cloud-only entries (no folder on this device) get one too.
  return [...byKey.values()].map((entry) => {
    const pendingCount = dueCounts[entry.key] ?? entry.pendingCount;
    return pendingCount === undefined ? entry : { ...entry, pendingCount };
  });
}

/**
 * Hover text for the local-folder marker. Browsers only hand a page the folder's name, never its full location,
 * so a bare name gets a note saying so; a path that was kept in full is shown as it is.
 */
export function localFolderTitle(local: { name: string; path: string }): string {
  const location = local.path || local.name;
  const isFullPath = /[\\/]/.test(location);
  return isFullPath
    ? `Linked to local folder: ${location}`
    : `Linked to local folder: ${location} (the browser shares only the folder name, not its full path)`;
}
