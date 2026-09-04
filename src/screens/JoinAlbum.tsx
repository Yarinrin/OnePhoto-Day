/** Enter a code, see what you're walking into, then step in. */

import { useState } from 'react';

import { Confetti } from '../components/Confetti';
import { IconCheck, IconUsers, IconX } from '../components/Icons';
import { PageHeader, Screen } from '../components/Shell';
import { Avatar, Button, CodeInput } from '../components/ui';
import { DEMO_INVITE_CODES } from '../lib/seed';
import { normalizeCode } from '../lib/util';
import { useApp } from '../state/AppContext';
import { findAlbumByCode } from '../state/reducer';
import { useRouter } from '../state/router';
import { albumPhotoCount, members } from '../state/selectors';

const CODE_LENGTH = 6;

export function JoinAlbum() {
  const { data, commands, mode, busy } = useApp();
  const { push, back } = useRouter();

  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [joinedId, setJoinedId] = useState<string | null>(null);

  const fail = (message: string) => {
    setError(message);
    setShake(true);
    window.setTimeout(() => setShake(false), 420);
  };

  /**
   * Demo mode can check a code locally, so it previews the album before you
   * commit. Live mode can't: the security rules hide an album from anyone who
   * isn't in it yet, which is the point — so there the server answers when you
   * actually press Join.
   */
  const resolve = (raw: string) => {
    const clean = normalizeCode(raw);
    if (clean.length < CODE_LENGTH) {
      fail('That code looks short — six characters, like BAND-77.');
      return null;
    }
    if (mode === 'live') {
      setError(null);
      return null;
    }
    const album = findAlbumByCode(data, clean);
    if (!album) {
      fail("We couldn't find an album with that code. Check it with your friend?");
      return null;
    }
    if (album.memberIds.includes(data.currentUserId ?? '')) {
      fail(`You're already in ${album.name}.`);
      return null;
    }
    setError(null);
    return album;
  };

  const join = async (raw: string) => {
    if (normalizeCode(raw).length < CODE_LENGTH) {
      fail('That code looks short — six characters, like BAND-77.');
      return;
    }
    try {
      setJoinedId(await commands.joinByCode(raw));
    } catch (err) {
      fail(err instanceof Error ? err.message : "That code didn't work.");
    }
  };

  if (joinedId) return <JoinedAlbum albumId={joinedId} />;

  // Live preview once the code is complete and valid.
  const preview =
    mode === 'demo' && normalizeCode(code).length === CODE_LENGTH
      ? findAlbumByCode(data, code)
      : undefined;
  const previewJoinable = preview && !preview.memberIds.includes(data.currentUserId ?? '');

  return (
    <Screen accent={preview?.accent ?? 'blue'}>
      <PageHeader
        title={<>Join an<br />album</>}
        subtitle="Enter the invite code"
        onBack={() => back({ name: 'home' })}
      />

      <div className="join">
        <CodeInput
          value={code}
          length={CODE_LENGTH}
          dashAfter={4}
          shake={shake}
          onChange={(next) => {
            setCode(next);
            if (error) setError(null);
          }}
          onComplete={resolve}
        />

        {error && (
          <p className="join__error" role="alert">
            <IconX size={15} strokeWidth={3} />
            {error}
          </p>
        )}

        {previewJoinable && preview && <JoinPreview albumId={preview.id} />}

        <Button
          variant="primary"
          size="lg"
          block
          disabled={code.length < CODE_LENGTH || busy}
          onClick={() => void join(code)}
        >
          {busy ? 'Joining…' : preview && previewJoinable ? `Join ${preview.name}` : 'Join album'}
        </Button>

        <p className="join__hint">
          Codes come from whoever made the album.
          {mode === 'demo' && (
            <>
              <br />
              Trying it out? Tap{' '}
              {DEMO_INVITE_CODES.map((demo, i) => (
                <span key={demo}>
                  {i > 0 && ' or '}
                  <code
                    role="button"
                    tabIndex={0}
                    onClick={() => setCode(normalizeCode(demo))}
                    onKeyDown={(e) => e.key === 'Enter' && setCode(normalizeCode(demo))}
                  >
                    {demo}
                  </code>
                </span>
              ))}
              .
            </>
          )}
        </p>

        <Button variant="ghost" block onClick={() => push({ name: 'create' })}>
          Or create your own
        </Button>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function JoinPreview({ albumId }: { albumId: string }) {
  const { data } = useApp();
  const album = data.albums[albumId];
  if (!album) return null;
  const roster = members(data, album);
  return (
    <div className="joincard" data-accent={album.accent}>
      <span className="avatar-stack">
        {roster.slice(0, 3).map((p) => (
          <Avatar key={p.id} person={p} size={38} />
        ))}
      </span>
      <span className="grow">
        <span className="joincard__name" style={{ display: 'block' }}>
          {album.name}
        </span>
        <span className="joincard__meta">
          {roster.length} members · {albumPhotoCount(data, album.id).toLocaleString()} photos
        </span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function JoinedAlbum({ albumId }: { albumId: string }) {
  const { data } = useApp();
  const { replace } = useRouter();
  const album = data.albums[albumId];
  if (!album) return null;
  const roster = members(data, album);

  return (
    <Screen accent={album.accent}>
      <Confetti />
      <div className="celebrate">
        <div className="bigcheck">
          <IconCheck size={38} strokeWidth={3.4} />
        </div>
        <h1 className="celebrate__title">You&apos;re in!</h1>
        <p className="celebrate__sub">
          Say hello with today&apos;s photo — everyone gets one.
        </p>

        <div className="joincard" data-accent={album.accent} style={{ width: '100%' }}>
          <span className="choice__icon">
            <IconUsers size={24} />
          </span>
          <span className="grow" style={{ textAlign: 'left' }}>
            <span className="joincard__name" style={{ display: 'block' }}>
              {album.name}
            </span>
            <span className="joincard__meta">
              {roster.length} {roster.length === 1 ? 'member' : 'members'}
            </span>
          </span>
        </div>

        <span className="avatar-stack" style={{ marginTop: 4 }}>
          {roster.slice(0, 6).map((p) => (
            <Avatar key={p.id} person={p} size={34} />
          ))}
        </span>

        <Button
          variant="ink"
          size="lg"
          block
          style={{ marginTop: 12 }}
          onClick={() => replace({ name: 'album', id: album.id })}
        >
          Go to album
        </Button>
      </div>
    </Screen>
  );
}
