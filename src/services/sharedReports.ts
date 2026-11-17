import type { SupabaseClient } from '@supabase/supabase-js';

export const REPORT_REASONS = [
  { value: 'malicious', label: 'Malicious or unsafe content' },
  { value: 'inappropriate', label: 'Inappropriate or offensive' },
  { value: 'spam', label: 'Spam' },
  { value: 'copyright', label: 'Copyright or stolen content' },
  { value: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['value'];

export const MAX_REPORT_NOTE = 500;

/** Reports a shared workspace. The database enforces one report per user and share, a daily limit, and that you cannot report your own. */
export async function reportSharedWorkspace(client: SupabaseClient, sharedId: string, reason: ReportReason, note: string): Promise<void> {
  const { error } = await client.from('shared_workspace_reports').insert({ shared_id: sharedId, reason, note: note.trim().slice(0, MAX_REPORT_NOTE) });
  if (!error) return;
  if (/duplicate key|unique/i.test(error.message)) throw new Error('You already reported this workspace. Thank you.');
  if (/limit reached/i.test(error.message)) throw new Error('You have sent many reports today. Please try again tomorrow.');
  if (/shared_workspace_reports/i.test(error.message) && /(does not exist|schema cache|could not find)/i.test(error.message)) {
    throw new Error('Reporting needs the "sharing hub hardening" database migration, which has not been run yet.');
  }
  if (/row-level security/i.test(error.message)) throw new Error('You cannot report your own workspace, or one that is no longer available.');
  throw new Error(error.message);
}
