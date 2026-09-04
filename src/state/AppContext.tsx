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

import { dataStore } from '../lib/store';
import { emptyData, type AppData } from '../lib/types';
import { reducer, type Action } from './reducer';

export interface Toast {
  id: number;
  message: string;
  tone: 'ok' | 'bad' | 'plain';
}

interface AppValue {
  data: AppData;
  ready: boolean;
  dispatch: (action: Action) => void;
  toast: (message: string, tone?: Toast['tone']) => void;
  toasts: Toast[];
  dismissToast: (id: number) => void;
}

const Ctx = createContext<AppValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, null, emptyData);
  const [ready, setReady] = useState(false);
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
    });
    return () => {
      alive = false;
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
    () => ({ data, ready, dispatch, toast, toasts, dismissToast }),
    [data, ready, toast, toasts, dismissToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside AppProvider');
  return v;
}
