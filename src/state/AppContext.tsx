/**
 * App-wide state.
 *
 * The reducer still owns the in-memory world, exactly as it did when this was
 * a local-only prototype. What changed is where that world comes from and
 * where changes go: in demo mode it's this browser, in live mode it's
 * Supabase. Screens don't know the difference — they call `commands`.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { Session } from '@supabase/supabase-js';

import {
  DemoBackend,
  SupabaseBackend,
  type Backend,
  type Mode,
  type PickedImage,
} from '../lib/backend';
import {
  closeExternal,
  isNative,
  NATIVE_REDIRECT,
  onDeepLink,
  onResume,
  openExternal,
  parseAuthRedirect,
} from '../lib/native';
import { collectOrphanedImages, dataStore } from '../lib/store';
import { supabase, supabaseConfigured } from '../lib/supabase';
import { emptyData, type AccentKey, type AppData } from '../lib/types';
import { dayKey, makeInviteCode } from '../lib/util';
import { newAlbumAction, findAlbumByCode, newPhoto, reducer, type Action } from './reducer';
import { referencedImageIds } from './selectors';

export interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'bad' | 'plain';
}

/**
 * Every mutation a screen can make. Async because in live mode each one is a
 * round trip; demo mode resolves immediately but keeps the same shape.
 */
export interface Commands {
  createAlbum(name: string, accent: AccentKey, cover?: PickedImage): Promise<string>;
  joinByCode(code: string): Promise<string>;
  postPhoto(albumId: string, image: PickedImage, caption?: string): Promise<void>;
  renameAlbum(albumId: string, name: string): Promise<void>;
  setAlbumAccent(albumId: string, accent: AccentKey): Promise<void>;
  setAlbumCover(albumId: string, image: PickedImage): Promise<void>;
  regenerateCode(albumId: string): Promise<void>;
  leaveAlbum(albumId: string): Promise<void>;
  deleteAlbum(albumId: string): Promise<void>;
  renameUser(name: string): Promise<void>;
  setAvatar(image: PickedImage | null): Promise<void>;
  refresh(): Promise<void>;
}

interface AppValue {
  data: AppData;
  ready: boolean;
  /** null until the user picks demo or signs in. */
  mode: Mode | null;
  session: Session | null;
  /** True while a live command is in flight. */
  busy: boolean;
  today: string;
  backend: Backend | null;
  dispatch: (action: Action) => void;
  commands: Commands;
  startDemo: () => void;
  signInWithGoogle: () => Promise<void>;
  /** Resolves to an error message, or null when the user is on their way in. */
  signInWithEmail: (email: string, password: string) => Promise<string | null>;
  signUpWithEmail: (email: string, password: string, name: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  toast: (message: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}

const Ctx = createContext<AppValue | null>(null);

const MODE_KEY = 'opd.mode';

/**
 * The signed-in user, known from the session alone — no request required.
 *
 * Google gives a display name; the part of an email before the @ is a decent
 * last resort. The profile row in the database will overwrite all of this the
 * moment it loads.
 */
function identityFrom(session: Session): AppData {
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const named = [meta.full_name, meta.name, session.user.email?.split('@')[0]].find(
    (v): v is string => typeof v === 'string' && v.trim() !== '',
  );
  const data = emptyData();
  data.currentUserId = session.user.id;
  data.people[session.user.id] = {
    id: session.user.id,
    name: named ?? 'You',
    accent: 'pink',
  };
  return data;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, null, emptyData);
  const [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [today, setToday] = useState(dayKey);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const backendRef = useRef<Backend | null>(null);
  const demoHydrated = useRef(false);

  /* ---- Toasts ---- */

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, tone: Toast['tone'] = 'plain') => {
      const id = ++toastId.current;
      setToasts((prev) => [...prev.slice(-2), { id, message, tone }]);
      window.setTimeout(() => dismissToast(id), 3200);
    },
    [dismissToast],
  );

  /* ---- Session ---- */

  useEffect(() => {
    if (!supabase) {
      // No project configured: demo is the only thing on offer.
      void bootDemo();
      return;
    }

    let alive = true;

    supabase.auth.getSession().then(({ data: { session: found } }) => {
      if (!alive) return;
      if (found) {
        void bootLive(found);
      } else if (localStorage.getItem(MODE_KEY) === 'demo') {
        void bootDemo();
      } else {
        setReady(true); // show the sign-in screen
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      if (event === 'SIGNED_IN' && next) void bootLive(next);
      if (event === 'SIGNED_OUT') {
        backendRef.current = null;
        setSession(null);
        setMode(null);
        dispatch({ type: 'reset', data: emptyData() });
        setReady(true);
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function bootDemo() {
    const backend = new DemoBackend();
    backendRef.current = backend;
    const loaded = await backend.load();
    dispatch({ type: 'hydrate', data: loaded });
    demoHydrated.current = true;
    setMode('demo');
    localStorage.setItem(MODE_KEY, 'demo');
    setReady(true);

    // Sweep images the world no longer points at. Load is the only moment
    // this is safe: nothing is mid-flow, so a picked-but-unposted draft
    // can't be mistaken for an orphan. Best effort — never block the app.
    void collectOrphanedImages(referencedImageIds(loaded)).catch(() => {});
  }

  async function bootLive(next: Session) {
    setSession(next);
    const backend = new SupabaseBackend(next.user.id);
    backendRef.current = backend;
    setMode('live');
    localStorage.setItem(MODE_KEY, 'live');

    // Who you are comes from the session, and it is established *before* any
    // request goes out. The app treats "no current user" as "not signed in",
    // so hydrating identity only from a successful fetch meant one failed
    // request — a flaky connection, a cold project — dropped the user back on
    // the sign-in screen, having apparently done nothing. The account is the
    // identity here; the network only supplies the albums.
    dispatch({ type: 'hydrate', data: identityFrom(next) });

    try {
      dispatch({ type: 'hydrate', data: await backend.load() });
    } catch (err) {
      // Signed in, just empty-handed. Returning to the app retries: live mode
      // refreshes on focus and on resume.
      toast(err instanceof Error ? err.message : "Couldn't load your albums", 'bad');
    }
    setReady(true);
  }

  /* ---- Midnight ---- */

  useEffect(() => {
    let timer: number;

    const schedule = () => {
      window.clearTimeout(timer);
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 1);
      // Cap the wait: a machine that sleeps through midnight wakes with a
      // timer that fired late or not at all, so re-check at least hourly.
      const wait = Math.min(midnight.getTime() - now.getTime(), 3_600_000);
      timer = window.setTimeout(() => {
        setToday(dayKey());
        schedule();
      }, Math.max(1000, wait));
    };

    // Returning to a backgrounded tab is the common way to cross midnight.
    const recheck = () => {
      setToday(dayKey());
      schedule();
    };

    schedule();
    document.addEventListener('visibilitychange', recheck);
    window.addEventListener('focus', recheck);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', recheck);
      window.removeEventListener('focus', recheck);
    };
  }, []);

  /* ---- Demo mode persists the whole world after every change ---- */

  useEffect(() => {
    if (mode !== 'demo' || !demoHydrated.current) return;
    void dataStore.save(data);
  }, [data, mode]);

  /* ---- Remember the album the bottom bar acts on, across reloads ---- */

  useEffect(() => {
    if (mode === 'live' && data.activeAlbumId) {
      localStorage.setItem('opd.activeAlbum', data.activeAlbumId);
    }
  }, [mode, data.activeAlbumId]);

  /* ---- Commands ---- */

  const refresh = useCallback(async () => {
    const backend = backendRef.current;
    if (!backend || backend.mode !== 'live') return;
    try {
      dispatch({ type: 'hydrate', data: await backend.load() });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not refresh', 'bad');
    }
  }, [toast]);

  /** Runs a live command, then reloads; surfaces failures rather than
      leaving the screen showing something that never actually happened. */
  const run = useCallback(
    async <T,>(fn: (backend: Backend) => Promise<T>): Promise<T> => {
      const backend = backendRef.current;
      if (!backend) throw new Error('Not ready yet.');
      setBusy(true);
      try {
        const result = await fn(backend);
        if (backend.mode === 'live') await refresh();
        return result;
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  /** Stores a demo image, warning if the device can only hold it in memory. */
  const storeDemoImage = useCallback(
    async (backend: DemoBackend, image: PickedImage) => {
      const { ref, durable } = await backend.storeImage(image);
      if (!durable) {
        toast("Saved for now, but this device won't keep it after a reload", 'bad');
      }
      return ref;
    },
    [toast],
  );

  const commands = useMemo<Commands>(
    () => ({
      async createAlbum(name, accent, cover) {
        const backend = backendRef.current;
        if (backend?.mode === 'live') {
          return run((b) => b.createAlbum(name, accent, cover));
        }
        // Demo: the reducer makes the album, the image store keeps the cover.
        let coverRef;
        if (cover && backend instanceof DemoBackend) {
          coverRef = await storeDemoImage(backend, cover);
        }
        const action = newAlbumAction(name, accent, coverRef);
        dispatch(action);
        return action.type === 'createAlbum' ? action.albumId : '';
      },

      async joinByCode(code) {
        const backend = backendRef.current;
        if (backend?.mode === 'live') {
          const { albumId } = await run((b) => b.joinByCode(code));
          return albumId;
        }
        const album = findAlbumByCode(data, code);
        if (!album) {
          throw new Error("We couldn't find an album with that code. Check it with your friend?");
        }
        if (album.memberIds.includes(data.currentUserId ?? '')) {
          throw new Error(`You're already in ${album.name}.`);
        }
        dispatch({ type: 'joinAlbum', albumId: album.id });
        return album.id;
      },

      async postPhoto(albumId, image, caption) {
        const backend = backendRef.current;
        if (backend?.mode === 'live') {
          await run((b) => b.postPhoto(albumId, image, caption));
          return;
        }
        if (!(backend instanceof DemoBackend) || !data.currentUserId) return;
        const ref = await storeDemoImage(backend, image);
        dispatch({
          type: 'postPhoto',
          photo: newPhoto(albumId, data.currentUserId, ref, caption),
        });
      },

      async renameAlbum(albumId, name) {
        const backend = backendRef.current;
        // Optimistic either way: typing shouldn't wait on a round trip.
        dispatch({ type: 'renameAlbum', albumId, name });
        if (backend?.mode === 'live') await backend.renameAlbum(albumId, name);
      },

      async setAlbumAccent(albumId, accent) {
        const backend = backendRef.current;
        dispatch({ type: 'setAlbumAccent', albumId, accent });
        if (backend?.mode === 'live') await backend.setAlbumAccent(albumId, accent);
      },

      async setAlbumCover(albumId, image) {
        const backend = backendRef.current;
        if (backend?.mode === 'live') {
          await run((b) => b.setAlbumCover(albumId, image));
          return;
        }
        if (!(backend instanceof DemoBackend)) return;
        const ref = await storeDemoImage(backend, image);
        dispatch({ type: 'setAlbumCover', albumId, cover: ref });
      },

      async regenerateCode(albumId) {
        const backend = backendRef.current;
        if (backend?.mode === 'live') {
          await run((b) => b.regenerateCode(albumId));
          return;
        }
        dispatch({ type: 'regenerateCode', albumId, code: makeInviteCode() });
      },

      async leaveAlbum(albumId) {
        const backend = backendRef.current;
        if (backend?.mode === 'live') {
          await run((b) => b.leaveAlbum(albumId));
          return;
        }
        dispatch({ type: 'leaveAlbum', albumId });
      },

      async deleteAlbum(albumId) {
        const backend = backendRef.current;
        if (backend?.mode === 'live') {
          await run((b) => b.deleteAlbum(albumId));
          return;
        }
        dispatch({ type: 'deleteAlbum', albumId });
      },

      async renameUser(name) {
        const backend = backendRef.current;
        dispatch({ type: 'renameUser', name });
        if (backend?.mode === 'live') await backend.renameUser(name);
      },

      async setAvatar(image) {
        const backend = backendRef.current;
        if (backend?.mode === 'live') {
          await run((b) => b.setAvatar(image));
          return;
        }
        if (!(backend instanceof DemoBackend)) return;
        if (!image) {
          dispatch({ type: 'setUserAvatar', imageId: undefined });
          return;
        }
        const ref = await storeDemoImage(backend, image);
        if (ref.kind === 'stored') dispatch({ type: 'setUserAvatar', imageId: ref.id });
      },

      refresh,
    }),
    [data, refresh, run, storeDemoImage],
  );

  /* ---- Entering / leaving ---- */

  const startDemo = useCallback(() => {
    void bootDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!supabase) {
      toast('This build has no Supabase project configured.', 'bad');
      return;
    }

    // On the web this is one navigation: leave for Google, come back signed in.
    if (!isNative) {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin },
      });
      if (error) toast(error.message, 'bad');
      return;
    }

    // In the app it's three steps, because Google refuses to render consent
    // inside an embedded WebView. Ask Supabase for the URL but don't follow it
    // (`skipBrowserRedirect`), hand it to a real Chrome tab, and wait for the
    // deep link to come back — picked up by the listener below.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      toast(error?.message ?? 'Could not start sign-in.', 'bad');
      return;
    }
    await openExternal(data.url);
  }, [toast]);

  /*
   * Email and password: the one way in that never leaves the app.
   *
   * Google's flow has to hand off to a browser and be handed back through a
   * deep link, and every step of that is a place for an Android build to lose
   * the thread. This one is a single request from inside the WebView, so
   * there is nothing to lose.
   */

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'This build has no Supabase project configured.';
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    // Success needs nothing here: it fires SIGNED_IN, which boots live mode.
    return error ? error.message : null;
  }, []);

  const signUpWithEmail = useCallback(
    async (email: string, password: string, name: string) => {
      if (!supabase) return 'This build has no Supabase project configured.';
      const { data: created, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        // The database trigger reads full_name when it creates the profile.
        options: { data: { full_name: name.trim() } },
      });
      if (error) return error.message;

      // Supabase will not admit that an address is already registered — that
      // would let anyone test which emails have accounts — so it returns a
      // success with no identities attached and sends nothing. Left alone,
      // that reads as "check your email for a link that never arrives".
      if (created.user && created.user.identities?.length === 0) {
        return 'That email already has an account. Sign in instead — and if you first used Google, use Google.';
      }

      // No session on a genuinely new sign-up means the project wants the
      // address confirmed first. Say so plainly rather than appearing to hang.
      if (!created.session) {
        return `Check ${email.trim()} for a confirmation link, then sign in.`;
      }
      return null;
    },
    [],
  );

  /* ---- Native: the other half of sign-in ---- */

  useEffect(() => {
    if (!isNative || !supabase) return;
    const sb = supabase;

    return onDeepLink((url) => {
      const result = parseAuthRedirect(url);

      if (result.error) {
        void closeExternal();
        toast(result.error, 'bad');
        return;
      }
      if (!result.code && !result.accessToken) return; // not a sign-in link

      void (async () => {
        // Either shape ends the same way: a session, which fires SIGNED_IN
        // and boots live mode. Nothing more to do here on success.
        const { error } = result.code
          ? await sb.auth.exchangeCodeForSession(result.code)
          : await sb.auth.setSession({
              access_token: result.accessToken!,
              refresh_token: result.refreshToken ?? '',
            });
        await closeExternal();
        if (error) toast(error.message, 'bad');
      })();
    });
  }, [toast]);

  const signOut = useCallback(async () => {
    localStorage.removeItem(MODE_KEY);
    if (supabase) await supabase.auth.signOut();
    backendRef.current = null;
    setSession(null);
    setMode(null);
    dispatch({ type: 'reset', data: emptyData() });
  }, []);

  /* ---- Live mode: pick up other people's photos on return ---- */

  useEffect(() => {
    if (mode !== 'live') return;
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    // A backgrounded Android app never fires `focus` on return, so the app
    // needs the platform's own resume event to catch up on the same moment.
    const stopResume = onResume(onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      stopResume();
    };
  }, [mode, refresh]);

  const value = useMemo(
    () => ({
      data,
      ready,
      mode,
      session,
      busy,
      today,
      backend: backendRef.current,
      dispatch,
      commands,
      startDemo,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      toast,
      toasts,
      dismissToast,
    }),
    [
      data,
      ready,
      mode,
      session,
      busy,
      today,
      commands,
      startDemo,
      signInWithGoogle,
      signInWithEmail,
      signUpWithEmail,
      signOut,
      toast,
      toasts,
      dismissToast,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}

export { supabaseConfigured };
