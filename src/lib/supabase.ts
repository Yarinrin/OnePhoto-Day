/**
 * The Supabase client.
 *
 * Both values are public by design — the anon/publishable key is meant to ship
 * in client code, and every table it can reach is guarded by row-level
 * security. Without them the app still runs, in demo mode.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { isNative } from './native';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when no project is configured — the app then offers demo mode only. */
export const supabaseConfigured = Boolean(url && key);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, key!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // Explicit, because the default is `implicit` — which hands the
        // session back in the URL *fragment*. A fragment survives a browser
        // redirect but is invisible to a deep-link handler reading query
        // parameters, so sign-in came back to the app carrying a session
        // nothing was looking for and silently did nothing at all.
        // PKCE returns `?code=` instead, and is the right flow for a public
        // client regardless: the secret never leaves the device.
        flowType: 'pkce',
        // On the web the OAuth redirect lands back on our own page carrying
        // the code, so let the client pick it up. In the Android app there is
        // no such navigation — the code arrives as a deep link and is
        // exchanged by hand — and the app's own URL never carries one, so
        // leaving this on would only be a chance to misread a route.
        detectSessionInUrl: !isNative,
      },
    })
  : null;

/** Narrowing helper: throws rather than returning null all over the codebase. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured on this build.');
  return supabase;
}

export const PHOTO_BUCKET = 'photos';
