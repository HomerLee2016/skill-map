import type { SupabaseClient } from '@supabase/supabase-js';

export interface MigrationRow {
  filename: string;
  logged: boolean;
  applied_at: string | null;
  /** True/false when the database could check the script's objects; null when no check exists for it. */
  objects_ok: boolean | null;
}

export type MigrationState = 'verified' | 'logged' | 'broken' | 'missing';

export interface MigrationEntry {
  filename: string;
  state: MigrationState;
  appliedAt: string | null;
}

export interface MigrationReport {
  entries: MigrationEntry[];
  /** Scripts the database reports that are not in this build's repo list (the app is older than the database). */
  unknownToApp: string[];
  allApplied: boolean;
}

/**
 * Compares the scripts bundled with this build (the repo's supabase/migrations) with what the database reports.
 * - verified: logged and the objects exist; logged: logged, no object check; broken: logged but objects missing;
 * - missing: not logged, or objects missing without a log row.
 */
export function buildMigrationReport(expected: readonly string[], rows: readonly MigrationRow[]): MigrationReport {
  const byName = new Map(rows.map((row) => [row.filename, row]));
  const entries = [...expected].sort().map<MigrationEntry>((filename) => {
    const row = byName.get(filename);
    let state: MigrationState = 'missing';
    if (row?.logged) {
      if (row.objects_ok === false) state = 'broken';
      else state = row.objects_ok === true ? 'verified' : 'logged';
    }
    return { filename, state, appliedAt: row?.applied_at ?? null };
  });
  const expectedSet = new Set(expected);
  const unknownToApp = rows.filter((row) => row.logged && !expectedSet.has(row.filename)).map((row) => row.filename).sort();
  return { entries, unknownToApp, allApplied: entries.every((entry) => entry.state === 'verified' || entry.state === 'logged') };
}

/** Whether the signed-in user may see the Admin tab. False when the function is not installed yet. */
export async function fetchIsAdmin(client: SupabaseClient): Promise<boolean> {
  const { data, error } = await client.rpc('is_app_admin');
  return !error && data === true;
}

export async function fetchMigrationRows(client: SupabaseClient): Promise<MigrationRow[]> {
  const { data, error } = await client.rpc('admin_migration_status');
  if (error) {
    if (/not allowed|permission denied/i.test(error.message)) throw new Error('This account is not an admin.');
    if (/could not find|does not exist|schema cache/i.test(error.message)) {
      throw new Error('The admin database script has not been run yet (20261127020000_admin_migration_status.sql).');
    }
    throw new Error(error.message);
  }
  return (data ?? []) as MigrationRow[];
}
