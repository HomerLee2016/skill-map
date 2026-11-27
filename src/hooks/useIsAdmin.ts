import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchIsAdmin } from '../services/migrationStatus';

/** True when the signed-in user is listed in the database's app_admins table. Hidden (false) on any failure. */
export function useIsAdmin(userId: string | null): boolean {
  const [admin, setAdmin] = useState<{ userId: string; value: boolean } | null>(null);

  useEffect(() => {
    if (!supabase || !userId) return;
    let cancelled = false;
    void fetchIsAdmin(supabase).then((value) => { if (!cancelled) setAdmin({ userId, value }); });
    return () => { cancelled = true; };
  }, [userId]);

  return Boolean(userId && admin?.userId === userId && admin.value);
}
