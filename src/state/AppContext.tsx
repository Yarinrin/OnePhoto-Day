/**
 * App-wide state: the persisted world, a dispatch, and a toast channel.
 * Hydration happens once on mount; every subsequent change is written back.
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

import { collectOrphanedImages, dataStore } from '../lib/store';
import { emptyData, type AppData } from '../lib/types';
import { dayKey } from '../lib/util';
import { reducer, type Action } from './reducer';
import { referencedImageIds } from './selectors';

export interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'bad' | 'plain';
}

interface AppValue {
  data: AppData;
  ready: boolean;
  /**
   * Today's local date key. Held in state rather than read from the clock at
   * each call site so that it changes at midnight in a tab left open, and so
   * memoised views can depend on it.
   */
  today: string;
  dispatch: (action: Action) => void;
  toast: (message: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}

const Ctx = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, null, emptyData);
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState(dayKey);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);
  const hydrated = useRef(false);

  useEffect(() => {
    let alive = true;
    dataStore.load().then((loaded) => {
      if (!alive) return;
      if (loaded) dispatch({ type: 'hydrate', data: loaded });
      hydrated.current = true;
      setReady(true);

      // Sweep images the world no longer points at. Load is the only moment
      // this is safe: nothing is mid-flow, so a picked-but-unposted draft
      // can't be mistaken for an orphan. Best effort — never block the app.
      void collectOrphanedImages(referencedImageIds(loaded ?? emptyData())).catch(() => {});
    });
    return () => {
      alive = false;
    };
  }, []);

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

  // Persist after hydration only, so we never overwrite storage with the
  // empty initial state during the first paint.
  useEffect(() => {
    if (!hydrated.current) return;
    void dataStore.save(data);
  }, [data]);

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

  const value = useMemo(
    () => ({ data, ready, today, dispatch, toast, toasts, dismissToast }),
    [data, ready, today, toast, toasts, dismissToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
