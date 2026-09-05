import { useEffect, useRef } from 'react';

import { CameraMark } from './components/Icons';
import { NavHost, Toasts } from './components/Shell';
import type { Mode } from './lib/backend';
import { useApp } from './state/AppContext';
import { useRouter, type Route } from './state/router';
import { AlbumHome } from './screens/AlbumHome';
import { AlbumSettings } from './screens/AlbumSettings';
import { Calendar } from './screens/Calendar';
import { CreateAlbum } from './screens/CreateAlbum';
import { Home } from './screens/Home';
import { JoinAlbum } from './screens/JoinAlbum';
import { Members } from './screens/Members';
import { Onboarding } from './screens/Onboarding';
import { Profile } from './screens/Profile';
import { Timeline } from './screens/Timeline';
import { TodayView } from './screens/TodayView';
import { Upload } from './screens/Upload';
import { Welcome } from './screens/Welcome';

export function App() {
  const { data, ready, mode } = useApp();
  const { route, direction, replace } = useRouter();
  // In live mode the account *is* the identity, so there's no name step.
  const signedIn = Boolean(data.currentUserId);

  // Whether this visit began with a name already on file. Signing in *during*
  // onboarding must not yank the user off it — they still have to pick
  // create-or-join — so only a returning visitor is redirected away.
  const returning = useRef<boolean | null>(null);

  useEffect(() => {
    if (!ready || mode !== 'demo') return;
    // Latched the first time the stored world is available, never after.
    if (returning.current === null) returning.current = signedIn;

    if (!signedIn && route.name !== 'onboarding') replace({ name: 'onboarding' });
    if (signedIn && route.name === 'onboarding' && returning.current) replace({ name: 'home' });
  }, [ready, mode, signedIn, route.name, replace]);

  if (!ready) {
    return (
      <div className="desk">
        <div className="phone" />
      </div>
    );
  }

  return (
    <div className="desk">
      <DeskPanel />
      <div className="phone">
        <NavHost>
          {/* Keying on the path restarts the entrance animation per screen. */}
          <div className={`page page--${direction}`} key={mode ? pageKey(route) : 'welcome'}>
            {mode === null ? <Welcome /> : render(route, signedIn, mode)}
          </div>
        </NavHost>
        <Toasts />
      </div>
    </div>
  );
}

/**
 * Wide screens get the poster beside the phone rather than acres of blank
 * paper. Hidden below 1080px, where the phone is the whole page.
 */
function DeskPanel() {
  return (
    <aside className="deskpanel" aria-hidden="true">
      <CameraMark size={104} className="deskpanel__cam" />
      <div className="wordmark">
        <span className="wordmark__line">One</span>
        <span className="wordmark__line">Photo</span>
        <span className="wordmark__line wordmark__line--pink">/Day</span>
      </div>
      <p className="deskpanel__tag">
        One photo. Every day.
        <br />
        Real moments, together.
      </p>
      <div className="rule" />
      <ul className="deskpanel__list">
        <li>A private album for your people</li>
        <li>One frame each, every day</li>
        <li>No feed. No likes. No strangers.</li>
      </ul>
    </aside>
  );
}

/** Distinct pages get distinct keys; changing days inside Today does not. */
function pageKey(route: Route): string {
  return route.name === 'today' ? `today:${'id' in route ? route.id : ''}` : route.name + ('id' in route ? `:${route.id}` : '');
}

function render(route: Route, signedIn: boolean, mode: Mode) {
  // Demo mode still asks for a name; live mode already has one from Google.
  if (!signedIn) return mode === 'demo' ? <Onboarding /> : <Welcome />;

  switch (route.name) {
    case 'onboarding':
      return mode === 'demo' ? <Onboarding /> : <Home />;
    case 'home':
      return <Home />;
    case 'create':
      return <CreateAlbum />;
    case 'join':
      return <JoinAlbum />;
    case 'profile':
      return <Profile />;
    case 'album':
      return <AlbumHome albumId={route.id} />;
    case 'today':
      return <TodayView albumId={route.id} day={route.day} />;
    case 'upload':
      return <Upload albumId={route.id} />;
    case 'timeline':
      return <Timeline albumId={route.id} />;
    case 'calendar':
      return <Calendar albumId={route.id} />;
    case 'members':
      return <Members albumId={route.id} />;
    case 'settings':
      return <AlbumSettings albumId={route.id} />;
    default:
      return <Home />;
  }
}
