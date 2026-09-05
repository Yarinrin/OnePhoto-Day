/**
 * A ~100-line router. Real URLs and a working browser Back button, plus the
 * one thing an off-the-shelf router wouldn't give us: the direction of each
 * transition, which the page animation depends on.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { dismissTop } from '../lib/dismiss';
import { exitApp, onHardwareBack } from '../lib/native';

export type Route =
  | { name: 'onboarding' }
  | { name: 'home' }
  | { name: 'create' }
  | { name: 'join' }
  | { name: 'profile' }
  | { name: 'album'; id: string }
  | { name: 'today'; id: string; day?: string }
  | { name: 'upload'; id: string }
  | { name: 'timeline'; id: string }
  | { name: 'calendar'; id: string }
  | { name: 'members'; id: string }
  | { name: 'settings'; id: string };

export type Direction = 'forward' | 'back' | 'none';

export function routeToPath(r: Route): string {
  switch (r.name) {
    case 'onboarding':
      return '/welcome';
    case 'home':
      return '/';
    case 'create':
      return '/create';
    case 'join':
      return '/join';
    case 'profile':
      return '/profile';
    case 'today':
      return `/album/${r.id}/today${r.day ? `/${r.day}` : ''}`;
    case 'album':
      return `/album/${r.id}`;
    default:
      return `/album/${r.id}/${r.name}`;
  }
}

export function pathToRoute(path: string): Route {
  const seg = path.split('/').filter(Boolean);
  if (!seg.length) return { name: 'home' };
  if (seg[0] === 'welcome') return { name: 'onboarding' };
  if (seg[0] === 'create') return { name: 'create' };
  if (seg[0] === 'join') return { name: 'join' };
  if (seg[0] === 'profile') return { name: 'profile' };
  if (seg[0] === 'album' && seg[1]) {
    const id = seg[1];
    switch (seg[2]) {
      case undefined:
        return { name: 'album', id };
      case 'today':
        return { name: 'today', id, ...(seg[3] ? { day: seg[3] } : {}) };
      case 'upload':
        return { name: 'upload', id };
      case 'timeline':
        return { name: 'timeline', id };
      case 'calendar':
        return { name: 'calendar', id };
      case 'members':
        return { name: 'members', id };
      case 'settings':
        return { name: 'settings', id };
    }
  }
  return { name: 'home' };
}

interface RouterValue {
  route: Route;
  direction: Direction;
  push(route: Route): void;
  replace(route: Route): void;
  back(fallback?: Route): void;
}

const Ctx = createContext<RouterValue | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() => pathToRoute(window.location.pathname));
  const [direction, setDirection] = useState<Direction>('none');
  const depth = useRef<number>(window.history.state?.depth ?? 0);

  useEffect(() => {
    if (window.history.state?.depth == null) {
      window.history.replaceState({ depth: 0 }, '', window.location.pathname);
    }
    const onPop = (e: PopStateEvent) => {
      const next = (e.state?.depth ?? 0) as number;
      setDirection(next < depth.current ? 'back' : 'forward');
      depth.current = next;
      setRoute(pathToRoute(window.location.pathname));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = useCallback((next: Route) => {
    depth.current += 1;
    window.history.pushState({ depth: depth.current }, '', routeToPath(next));
    setDirection('forward');
    setRoute(next);
  }, []);

  const replace = useCallback((next: Route) => {
    window.history.replaceState({ depth: depth.current }, '', routeToPath(next));
    setDirection('none');
    setRoute(next);
  }, []);

  const back = useCallback(
    (fallback?: Route) => {
      if (depth.current > 0) {
        window.history.back();
      } else if (fallback) {
        depth.current += 1;
        window.history.pushState({ depth: depth.current }, '', routeToPath(fallback));
        setDirection('back');
        setRoute(fallback);
      }
    },
    [],
  );

  /**
   * Android's Back button. It's one button doing three jobs, in order: close
   * whatever overlay is open, else go back a screen, else leave the app. The
   * WebView's own default is only the middle one, which makes Back from the
   * first screen do nothing at all and Back from a lightbox navigate out from
   * underneath it.
   */
  useEffect(
    () =>
      onHardwareBack(() => {
        if (dismissTop()) return;
        if (depth.current > 0) window.history.back();
        else void exitApp();
      }),
    [],
  );

  const value = useMemo(
    () => ({ route, direction, push, replace, back }),
    [route, direction, push, replace, back],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRouter(): RouterValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useRouter must be used inside RouterProvider');
  return v;
}
