import test from 'node:test';
import assert from 'node:assert/strict';
import { createSupabaseClient } from './supabaseClient';

test('returns null when env vars are missing or blank', () => {
  assert.equal(createSupabaseClient({}), null);
  assert.equal(createSupabaseClient({ VITE_SUPABASE_URL: 'https://x.supabase.co' }), null);
  assert.equal(createSupabaseClient({ VITE_SUPABASE_URL: ' ', VITE_SUPABASE_ANON_KEY: ' ' }), null);
});

test('returns a client when both env vars are set', () => {
  const client = createSupabaseClient({
    VITE_SUPABASE_URL: 'https://example.supabase.co',
    VITE_SUPABASE_ANON_KEY: 'anon-key',
  });
  assert.ok(client);
});
