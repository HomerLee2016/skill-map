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

const resolvedKey = (userId: string) => `skill-map-sync-resolved:${userId}`;
const preferCloudKey = (userId: string) => `skill-map-prefer-cloud:${userId}`;

function readFlag(key: string): boolean {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}

function writeFlag(key: string, value: boolean): void {
  try {
    if (value) localStorage.setItem(key, '1'); else localStorage.removeItem(key);
  } catch { /* storage unavailable; the prompt may show again */ }
}

export const isConflictResolved = (userId: string) => readFlag(resolvedKey(userId));
export const markConflictResolved = (userId: string) => writeFlag(resolvedKey(userId), true);
/** When set, the cloud copy of lessons/tests/roadmaps is shown even if a local folder is selected. */
export const isCloudPreferred = (userId: string | null) => (userId ? readFlag(preferCloudKey(userId)) : false);
export const setCloudPreferred = (userId: string, value: boolean) => writeFlag(preferCloudKey(userId), value);
