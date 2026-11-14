import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureCloudWorkspace, fetchCloudWorkspace, pushWorkspaceContent } from './cloudWorkspace';
import { fetchRemoteRevisionRecords, upsertRecords } from './revisionSync';
import { mergeRevisionRecordSets } from './revisionSyncMerge';
import type { CompletedQuestionRecord } from './revisionDb';
import { emptyStructureTree, emptyTestsStructure } from './workspaceParsing';
import { mergeWorkspaceContents, type MergeReport } from './workspaceMerge';
import type { WorkspaceContent } from './workspaceTypes';

export interface MergeInput {
  key: string;
  name: string;
  /** Content already on this device (the open workspace); otherwise the cloud copy is read. */
  content?: WorkspaceContent;
}

export interface MergeOutcome {
  targetKey: string;
  targetName: string;
  report: MergeReport;
  /** Revision records carried over (after removing duplicates by question). */
  revisionRecords: number;
}

const emptyContent = (): WorkspaceContent => ({ lessons: [], tests: [], roadmaps: [], lessonStructure: emptyStructureTree(), testsStructure: emptyTestsStructure() });

/**
 * Merges workspaces into `target` (a new key, or an existing cloud-only workspace listed first in `sources`).
 * The source workspaces are left untouched. Revision records of every source are carried over so the merged
 * workspace is revised as one.
 */
export async function mergeCloudWorkspaces(
  client: SupabaseClient,
  sources: MergeInput[],
  target: { key: string; name: string },
  readLocalRecords: (workspaceKey: string) => Promise<CompletedQuestionRecord[]>,
): Promise<MergeOutcome> {
  const loaded = await Promise.all(sources.map(async (source) => ({
    ...source,
    content: source.content ?? (await fetchCloudWorkspace(client, source.key)) ?? emptyContent(),
  })));
  const { content, report, idMaps } = mergeWorkspaceContents(loaded.map(({ name, content: body }) => ({ name, content: body })));

  const sets = await Promise.all(loaded.map(async (source, index) => {
    const [remote, local] = await Promise.all([fetchRemoteRevisionRecords(client, source.key).catch(() => []), readLocalRecords(source.key).catch(() => [])]);
    return { records: [...local, ...remote], titles: idMaps[index].testTitles };
  }));
  const records = mergeRevisionRecordSets(sets);

  await ensureCloudWorkspace(client, target.key, target.name);
  await pushWorkspaceContent(client, target.key, content);
  if (records.length > 0) await upsertRecords(client, target.key, records);
  return { targetKey: target.key, targetName: target.name, report, revisionRecords: records.length };
}
