import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

/** Returns a client when both env vars are set, otherwise null (login is hidden). */
export function createSupabaseClient(env: SupabaseEnv): SupabaseClient | null {
  const url = env.VITE_SUPABASE_URL?.trim();
  const anonKey = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

export const supabase = createSupabaseClient(import.meta.env as SupabaseEnv);
