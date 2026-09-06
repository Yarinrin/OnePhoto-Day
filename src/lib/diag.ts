/**
 * What actually happened, on the actual phone.
 *
 * Every Android failure in this project has been diagnosed by reasoning about
 * code that could not be run here, and the reasoning kept being wrong: the nav
 * bar was dead for a reason invisible to a browser, and sign-in failed
 * silently because the session arrived somewhere nothing was looking. Guessing
 * again is not a plan. So the app records its own boot and sign-in trace,
 * pushes it to a write-only table, and shows it on screen — the device gets to
 * say what happened instead of being guessed at.
 *
 * Rules this file lives by:
 *  - It can never break the app. Every failure inside is swallowed.
 *  - It never records a secret. Codes and tokens are reduced to a length.
 *  - It costs nothing when nothing goes wrong: a handful of small rows.
 */

import { supabase } from './supabase';

const DEVICE_KEY = 'opd.device';
const TRAIL_KEY = 'opd.trail';
const TRAIL_MAX = 60;

export interface DiagEntry {
  at: string;
  event: string;
  detail?: string;
}

/** A random per-install id, so one phone's trail can be read as a story. */
function deviceId(): string {
  try {
    const found = localStorage.getItem(DEVICE_KEY);
    if (found) return found;
    const made = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
    localStorage.setItem(DEVICE_KEY, made);
    return made;
  } catch {
    return 'unknown';
  }
}

/** Anything secret-shaped becomes its shape, never its value. */
export function redact(value: string | null | undefined): string {
  if (!value) return 'none';
  return `present(${value.length})`;
}

function readTrail(): DiagEntry[] {
  try {
    const raw = localStorage.getItem(TRAIL_KEY);
    return raw ? (JSON.parse(raw) as DiagEntry[]) : [];
  } catch {
    return [];
  }
}

/** The trail as shown on screen, newest last. */
export function trail(): DiagEntry[] {
  return readTrail();
}

export function clearTrail(): void {
  try {
    localStorage.removeItem(TRAIL_KEY);
  } catch {
    /* nothing to do */
  }
}

export function deviceName(): string {
  return deviceId();
}

/**
 * Records one step. Kept on the device so it survives with no connection, and
 * pushed to the database so it can be read from here.
 */
export function logEvent(event: string, detail?: string): void {
  const entry: DiagEntry = { at: new Date().toISOString(), event, detail };

  try {
    const next = [...readTrail(), entry].slice(-TRAIL_MAX);
    localStorage.setItem(TRAIL_KEY, JSON.stringify(next));
  } catch {
    /* a full disk must not stop the app */
  }

  // Fire and forget. A failed insert is not worth a word to the user.
  try {
    void supabase
      ?.from('debug_events')
      .insert({ device: deviceId(), event, detail: detail ?? null })
      .then(
        () => {},
        () => {},
      );
  } catch {
    /* offline, unconfigured, blocked — all fine */
  }
}
