/**
 * The trail, on screen.
 *
 * The database copy is the one that gets read from a laptop, but it needs a
 * connection and a configured project. This is the copy that always exists:
 * open it on the phone, read what happened, screenshot it if need be. It is
 * reachable from the front door, because the front door is where the app has
 * spent most of its time being stuck.
 */

import { useState } from 'react';

import { clearTrail, deviceName, trail } from '../lib/diag';
import { isNative } from '../lib/native';
import { supabaseConfigured } from '../state/AppContext';
import { Button } from './ui';

export function Diagnostics({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState(() => trail());

  return (
    <div className="diag" role="dialog" aria-modal="true" aria-label="Diagnostics">
      <div className="diag__sheet">
        <h2 className="diag__title">Diagnostics</h2>
        <p className="diag__facts">
          device <b>{deviceName()}</b>
          <br />
          native <b>{String(isNative)}</b> · account <b>{String(supabaseConfigured)}</b>
          <br />
          online <b>{String(navigator.onLine)}</b>
        </p>

        <div className="diag__log">
          {entries.length === 0 ? (
            <p className="diag__empty">Nothing recorded yet.</p>
          ) : (
            entries
              .slice()
              .reverse()
              .map((e, i) => (
                <div className="diag__row" key={`${e.at}-${i}`}>
                  <span className="diag__time">{e.at.slice(11, 19)}</span>
                  <span className="diag__event">{e.event}</span>
                  {e.detail && <span className="diag__detail">{e.detail}</span>}
                </div>
              ))
          )}
        </div>

        <div className="diag__actions">
          <Button
            variant="ghost"
            onClick={() => {
              clearTrail();
              setEntries([]);
            }}
          >
            Clear
          </Button>
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
