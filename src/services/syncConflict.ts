import type { CompletedQuestionRecord } from './revisionDb';
import { countContent, hasContent } from './cloudWorkspace';
import type { WorkspaceContent } from './workspaceTypes';
import { calcTotalStars } from '../utils/revisionSession';

export interface SideSummary {
  lessons: number;
  tests: number;
  roadmaps: number;
  questions: number;
  stars: number;
}

export type ConflictChoice = 'merge' | 'cloud' | 'device';

export function summarizeSide(content: WorkspaceContent | null, records: CompletedQuestionRecord[]): SideSummary {
  return { ...countContent(content), questions: records.length, stars: calcTotalStars(records) };
}

function hasData(side: SideSummary): boolean {
  return side.questions > 0 || hasContent(side);
}

/** Two copies exist (both hold data) and they differ, so the user should pick which to keep. */
export function isSyncConflict(device: SideSummary, cloud: SideSummary): boolean {
  if (!hasData(device) || !hasData(cloud)) return false;
  return (Object.keys(device) as Array<keyof SideSummary>).some((key) => device[key] !== cloud[key]);
}

// Per user and workspace: each workspace has its own cloud copy and its own "which one wins" choice.
const resolvedKey = (userId: string, workspaceKey: string) => `skill-map-sync-resolved:${userId}:${workspaceKey}`;
const preferCloudKey = (userId: string, workspaceKey: string) => `skill-map-prefer-cloud:${userId}:${workspaceKey}`;
const legacyAdoptedKey = (userId: string, workspaceKey: string) => `skill-map-legacy-adopted:${userId}:${workspaceKey}`;

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(key, '1'); else localStorage.removeItem(key);
  } catch { /* storage unavailable; the prompt may show again */ }
}

export const isConflictResolved = (userId: string, workspaceKey: string) => readFlag(resolvedKey(userId, workspaceKey));
export const markConflictResolved = (userId: string, workspaceKey: string) => writeFlag(resolvedKey(userId, workspaceKey), true);
/** When set, this workspace shows its cloud copy of lessons/tests/roadmaps even if a local folder is selected. */
export const isCloudPreferred = (userId: string | null, workspaceKey: string) => (userId ? readFlag(preferCloudKey(userId, workspaceKey)) : false);
export const setCloudPreferred = (userId: string, workspaceKey: string, value: boolean) => writeFlag(preferCloudKey(userId, workspaceKey), value);
export const isLegacyAdopted = (userId: string, workspaceKey: string) => readFlag(legacyAdoptedKey(userId, workspaceKey));
export const markLegacyAdopted = (userId: string, workspaceKey: string) => writeFlag(legacyAdoptedKey(userId, workspaceKey), true);
