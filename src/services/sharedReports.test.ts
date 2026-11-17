import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { reportSharedWorkspace } from './sharedReports';

function fakeClient(error: { message: string } | null, inserted: unknown[] = []): SupabaseClient {
  return { from: (table: string) => ({ insert: async (row: unknown) => { inserted.push([table, row]); return { error }; } }) } as unknown as SupabaseClient;
}

test('a report is inserted with a trimmed, capped note', async () => {
  const inserted: unknown[] = [];
  await reportSharedWorkspace(fakeClient(null, inserted), 's1', 'malicious', `  ${'x'.repeat(600)}  `);
  const [table, row] = inserted[0] as [string, { shared_id: string; reason: string; note: string }];
  assert.equal(table, 'shared_workspace_reports');
  assert.equal(row.shared_id, 's1');
  assert.equal(row.note.length, 500);
});

test('database errors become readable messages', async () => {
  const fail = (message: string) => reportSharedWorkspace(fakeClient({ message }), 's1', 'spam', '');
  await assert.rejects(() => fail('duplicate key value violates unique constraint'), /already reported/);
  await assert.rejects(() => fail('Report limit reached for today.'), /many reports/);
  await assert.rejects(() => fail('new row violates row-level security policy'), /cannot report your own/);
  await assert.rejects(() => fail('relation "public.shared_workspace_reports" does not exist'), /migration/);
  await assert.rejects(() => fail('boom'), /boom/);
});
