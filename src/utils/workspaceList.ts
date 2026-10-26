import type { CloudWorkspaceInfo } from '../services/cloudWorkspace';
import { deriveWorkspaceStorageKey } from '../services/revisionDb';
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
  return [...byKey.values()];
}
