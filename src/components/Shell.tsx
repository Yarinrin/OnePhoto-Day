/** Page chrome: screen wrapper, header, bottom navigation, toasts. */

import type { ReactNode } from 'react';

import { useApp } from '../state/AppContext';
import { useRouter, type Route } from '../state/router';
import { hasPostedToday } from '../state/selectors';
import {
  IconBack,
  IconCalendar,
  IconCamera,
  IconCheck,
  IconHome,
  IconUser,
  IconUsers,
} from './Icons';
import { IconButton } from './ui';

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export function Screen({
  children,
  nav = false,
  accent,
}: {
  children: ReactNode;
  nav?: boolean;
  accent?: string;
}) {
  return (
    <div className={`screen ${nav ? 'has-nav' : ''}`} data-accent={accent}>
      <div className="screen__scroll">{children}</div>
      {nav && <BottomNav />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

export function PageHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <header className="pagehead">
      {onBack && (
        <IconButton label="Go back" onClick={onBack}>
          <IconBack size={21} />
        </IconButton>
      )}
      <div className="pagehead__mid">
        <h1 className="pagehead__title">{title}</h1>
        {subtitle && <p className="pagehead__sub">{subtitle}</p>}
      </div>
      {right}
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Bottom navigation                                                   */
/* ------------------------------------------------------------------ */

const TABS = ['home', 'members', 'shutter', 'calendar', 'profile'] as const;

export function BottomNav() {
  const { data } = useApp();
  const { route, push } = useRouter();
  const albumId = data.activeAlbumId;
  const album = albumId ? data.albums[albumId] : null;
  const me = data.currentUserId;

  const postedToday = Boolean(album && me && hasPostedToday(data, album.id, me));

  /** Album-scoped tabs need an album; without one we send people home. */
  const goAlbum = (make: (id: string) => Route) => {
    if (album) push(make(album.id));
    else push({ name: 'home' });
  };

  const isActive = (tab: (typeof TABS)[number]) => {
    switch (tab) {
      case 'home':
        return route.name === 'home' || route.name === 'album' || route.name === 'timeline';
      case 'members':
        return route.name === 'members' || route.name === 'today';
      case 'calendar':
        return route.name === 'calendar';
      case 'profile':
        return route.name === 'profile' || route.name === 'settings';
      default:
        return false;
    }
  };

  const item = (
    tab: (typeof TABS)[number],
    label: string,
    icon: ReactNode,
    onClick: () => void,
  ) => {
    const active = isActive(tab);
    return (
      <button
        key={tab}
        type="button"
        className="nav__item"
        aria-current={active ? 'page' : undefined}
        onClick={onClick}
      >
        {active && <span className="nav__blip" aria-hidden="true" />}
        {icon}
        <span className="nav__label">{label}</span>
        {!active && <span className="sr-only">{label}</span>}
      </button>
    );
  };

  return (
    <nav className="nav" aria-label="Main">
      {item('home', 'Home', <IconHome size={23} />, () => push({ name: 'home' }))}
      {item('members', 'Today', <IconUsers size={23} />, () =>
        goAlbum((id) => ({ name: 'today', id })),
      )}

      <button
        type="button"
        className={[
          'nav__shutter',
          postedToday && 'nav__shutter--done',
          album && !postedToday && 'nav__shutter--nudge',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={() => goAlbum((id) => ({ name: 'upload', id }))}
        aria-label={postedToday ? "Today's photo is posted" : "Add today's photo"}
      >
        {postedToday ? <IconCheck size={27} strokeWidth={3} /> : <IconCamera size={27} />}
      </button>

      {item('calendar', 'Calendar', <IconCalendar size={23} />, () =>
        goAlbum((id) => ({ name: 'calendar', id })),
      )}
      {item('profile', 'You', <IconUser size={23} />, () => push({ name: 'profile' }))}
    </nav>
  );
}

/* ------------------------------------------------------------------ */
/* Toasts                                                              */
/* ------------------------------------------------------------------ */

export function Toasts() {
  const { toasts } = useApp();
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.tone !== 'plain' ? `toast--${t.tone}` : ''}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
