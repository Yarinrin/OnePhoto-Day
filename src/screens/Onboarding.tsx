/**
 * Three beats: the brand, your name, and where you want to go.
 * Nothing else — no password, no email, no permission wall.
 */

import { useEffect, useRef, useState } from 'react';

import { CameraMark, IconPlus, IconUsers, Sparkle } from '../components/Icons';
import { Button, TextField } from '../components/ui';
import { buildSeedWorld } from '../lib/seed';
import { useApp } from '../state/AppContext';
import { useRouter } from '../state/router';

type Step = 'brand' | 'name' | 'go';

export function Onboarding() {
  const { dispatch } = useApp();
  const { push } = useRouter();
  const [step, setStep] = useState<Step>('brand');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (step === 'name') {
      // Wait for the page transition before pulling up the keyboard.
      const t = window.setTimeout(() => inputRef.current?.focus(), 340);
      return () => window.clearTimeout(t);
    }
  }, [step]);

  const submitName = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('We need something to call you — two letters is plenty.');
      return;
    }
    setError(null);
    // Building the world here means the next screen already has history in it.
    dispatch({ type: 'signIn', name: trimmed, data: buildSeedWorld(trimmed) });
    setStep('go');
  };

  return (
    <div className="ob">
      <div className="ob__body">
        {step === 'brand' && <BrandStep />}

        {step === 'name' && (
          <div className="ob__step">
            <div>
              <p className="eyebrow" style={{ marginBottom: 12 }}>
                Step 1 of 2
              </p>
              <h1 className="ob__q">
                What&apos;s
                <br />
                your name?
              </h1>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitName();
              }}
            >
              <TextField
                ref={inputRef}
                label="Your name"
                placeholder="Yarin"
                value={name}
                maxLength={24}
                autoComplete="given-name"
                error={error}
                hint="This is what your friends will see next to your photos."
                onChange={(e) => {
                  setName(e.target.value);
                  if (error) setError(null);
                }}
              />
            </form>
          </div>
        )}

        {step === 'go' && (
          <div className="ob__step">
            <div>
              <div className="ob__hello">
                <Sparkle size={20} />
                <p className="eyebrow">Hi, {name.trim()}</p>
              </div>
              <h1 className="ob__q">
                Let&apos;s get
                <br />
                started.
              </h1>
              <p className="ob__tagline" style={{ marginTop: 18, animation: 'none' }}>
                Start something with your people, or step into an album that&apos;s already going.
              </p>
            </div>

            <div className="stack" style={{ gap: 14 }}>
              <button
                className="choice enter"
                style={{ ['--i' as string]: 0 }}
                onClick={() => push({ name: 'create' })}
              >
                <span className="choice__icon">
                  <IconPlus size={26} strokeWidth={2.8} />
                </span>
                <span>
                  <span className="choice__title">Create an album</span>
                  <span className="choice__sub">Name it, invite your people, start today.</span>
                </span>
              </button>

              <button
                className="choice enter"
                data-accent="blue"
                style={{ ['--i' as string]: 1 }}
                onClick={() => push({ name: 'join' })}
              >
                <span className="choice__icon">
                  <IconUsers size={26} />
                </span>
                <span>
                  <span className="choice__title">Join an album</span>
                  <span className="choice__sub">Got a code from a friend? Drop it in.</span>
                </span>
              </button>
            </div>

            <button
              className="btn btn--ghost"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => push({ name: 'home' })}
            >
              Skip for now
            </button>
          </div>
        )}
      </div>

      {step !== 'go' && (
        <div className="ob__foot">
          {step === 'brand' ? (
            <Button variant="primary" size="lg" block onClick={() => setStep('name')}>
              Start
            </Button>
          ) : (
            <Button variant="primary" size="lg" block onClick={submitName}>
              Continue
            </Button>
          )}
          <p className="eyebrow" style={{ textAlign: 'center' }}>
            No feed · No likes · No strangers
          </p>
        </div>
      )}
    </div>
  );
}

function BrandStep() {
  return (
    <div>
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
  );
}
