/**
 * The Supabase client.
 *
 * Both values are public by design — the anon/publishable key is meant to ship
 * in client code, and every table it can reach is guarded by row-level
 * security. Without them the app still runs, in demo mode.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when no project is configured — the app then offers demo mode only. */
export const supabaseConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // The OAuth redirect comes back with the session in the URL hash.
        detectSessionInUrl: true,
      },
    })
  : null;

/** Narrowing helper: throws rather than returning null all over the codebase. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured on this build.');
  return supabase;
}

export const PHOTO_BUCKET = 'photos';
