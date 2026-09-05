/**
 * The front door. Two ways in: a real account that syncs between phones, or
 * a local demo that never leaves this browser.
 */

import { useState } from 'react';

import { CameraMark, IconUsers } from '../components/Icons';
import { Button, TextField } from '../components/ui';
import { supabaseConfigured, useApp } from '../state/AppContext';

export function Welcome() {
  const { signInWithGoogle, startDemo } = useApp();
  const [signingIn, setSigningIn] = useState(false);
  const [email, setEmail] = useState(false);

  if (email) return <EmailForm onBack={() => setEmail(false)} />;

  return (
    <div className="ob">
      <div className="ob__body">
        <CameraMark size={124} className="ob__camera" />
        <div className="wordmark">
          <span className="wordmark__line">One</span>
          <span className="wordmark__line">Photo</span>
          <span className="wordmark__line wordmark__line--pink">/Day</span>
        </div>
        <p className="ob__tagline">
          One photo. Every day.
          <br />
          Real moments, together.
        </p>
        <div className="rule ob__rule" />
      </div>

      <div className="ob__foot">
        {supabaseConfigured && (
          <>
            {/* Email first: it is the only route that never leaves the app,
                so it is the one that works everywhere. */}
            <Button variant="primary" size="lg" block onClick={() => setEmail(true)}>
              Continue with email
            </Button>

            <Button
              variant="plain"
              block
              icon={<GoogleMark />}
              disabled={signingIn}
              onClick={async () => {
                setSigningIn(true);
                try {
                  await signInWithGoogle();
                } finally {
                  setSigningIn(false);
                }
              }}
            >
              {signingIn ? 'Opening Google…' : 'Sign in with Google'}
            </Button>
          </>
        )}

        <Button variant="ghost" block icon={<IconUsers size={18} />} onClick={startDemo}>
          Try the demo
        </Button>

        <p className="eyebrow" style={{ textAlign: 'center', lineHeight: 1.7 }}>
          {supabaseConfigured
            ? 'Sign in to share albums · Demo stays on this device'
            : 'No account configured — demo only'}
        </p>
      </div>
    </div>
  );
}

/**
 * Email and password, in one screen that does both jobs.
 *
 * Nothing here leaves the WebView: no browser hand-off, no deep link back, no
 * SMS provider to pay for. That is the entire point of it — it is the route
 * with the fewest moving parts, and so the one most likely to just work.
 */
function EmailForm({ onBack }: { onBack: () => void }) {
  const { signInWithEmail, signUpWithEmail } = useApp();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const joining = mode === 'up';

  const submit = async () => {
    setError(null);
    if (!address.includes('@')) {
      setError('That does not look like an email address.');
      return;
    }
    if (password.length < 6) {
      setError('Passwords need at least six characters.');
      return;
    }
    if (joining && name.trim().length < 2) {
      setError('We need something to call you.');
      return;
    }
    setBusy(true);
    // A success navigates by itself: the session change boots live mode.
    const failure = joining
      ? await signUpWithEmail(address, password, name)
      : await signInWithEmail(address, password);
    setBusy(false);
    if (failure) setError(failure);
  };

  return (
    <div className="ob">
      <div className="ob__body">
        <div className="ob__step">
          <div>
            <h1 className="ob__q">
              {joining ? (
                <>
                  Make an
                  <br />
                  account
                </>
              ) : (
                <>
                  Welcome
                  <br />
                  back
                </>
              )}
            </h1>
            <p className="ob__tagline">
              {joining
                ? 'One account, every album you are in.'
                : 'Sign in to find your albums.'}
            </p>
          </div>
          {joining && (
            <TextField
              label="Your name"
              placeholder="Yarin"
              value={name}
              maxLength={24}
              autoComplete="name"
              onChange={(e) => setName(e.currentTarget.value)}
            />
          )}
          <TextField
            label="Email"
            type="email"
            placeholder="you@example.com"
            value={address}
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            onChange={(e) => setAddress(e.currentTarget.value)}
          />
          <TextField
            label="Password"
            type="password"
            placeholder="At least six characters"
            value={password}
            autoComplete={joining ? 'new-password' : 'current-password'}
            onChange={(e) => setPassword(e.currentTarget.value)}
            error={error ?? undefined}
          />
        </div>
      </div>

      <div className="ob__foot">
        <Button variant="primary" size="lg" block disabled={busy} onClick={() => void submit()}>
          {busy ? 'One moment…' : joining ? 'Create account' : 'Sign in'}
        </Button>
        <Button
          variant="ghost"
          block
          onClick={() => {
            setError(null);
            setMode(joining ? 'in' : 'up');
          }}
        >
          {joining ? 'I already have an account' : 'I need an account'}
        </Button>
        <Button variant="ghost" block onClick={onBack}>
          Back
        </Button>
      </div>
    </div>
  );
}

/** Google's mark, drawn rather than fetched so nothing loads from their CDN. */
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.1-3.8 6.6-9.4 6.6-16.1z"
      />
      <path
        fill="#34A853"
        d="M24 46c5.9 0 10.9-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.8-12.3-9H4.4v5.7C8 41.1 15.4 46 24 46z"
      />
      <path
        fill="#FBBC05"
        d="M11.7 28.2c-.4-1.3-.7-2.7-.7-4.2s.2-2.9.7-4.2v-5.7H4.4C2.9 17 2 20.4 2 24s.9 7 2.4 9.9l7.3-5.7z"
      />
      <path
        fill="#EA4335"
        d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.4 2 8 6.9 4.4 14.1l7.3 5.7c1.7-5.2 6.6-9 12.3-9z"
      />
    </svg>
  );
}
