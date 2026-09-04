/**
 * Today's photo: choose → preview → post.
 *
 * The daily limit is checked here for the UI *and* enforced in the reducer,
 * so a stale tab or a back-button can't sneak a second frame through.
 */

import { useState } from 'react';

import { Confetti } from '../components/Confetti';
import { IconCamera, IconCheck, IconClock, IconImage, IconRefresh, Sparkle } from '../components/Icons';
import { PageHeader, Screen } from '../components/Shell';
import { Avatar, Button, EmptyState, TextArea } from '../components/ui';
import { useImagePicker } from '../hooks/useImagePicker';
import { formatDayLong, formatTime, timeUntilTomorrow } from '../lib/util';
import { useApp } from '../state/AppContext';
import { useRouter } from '../state/router';
import { currentUser, hasPostedToday, personAlbumStreak, todayState } from '../state/selectors';
import { NotFound } from './NotFound';

type Stage = 'pick' | 'preview' | 'done';

export function Upload({ albumId }: { albumId: string }) {
  const { data, commands, toast, today, busy } = useApp();
  const { push, back, replace } = useRouter();

  const album = data.albums[albumId];
  const me = currentUser(data);
  const already = album && me ? hasPostedToday(data, album.id, me.id) : false;

  const [stage, setStage] = useState<Stage>('pick');
  // Held in memory only. Nothing is written or uploaded until Post is pressed,
  // so abandoning the flow leaves nothing behind to clean up.
  const [preview, setPreview] = useState<{ src: string } | null>(null);
  const [caption, setCaption] = useState('');
  const [posting, setPosting] = useState(false);

  const picker = useImagePicker(
    (dataUrl) => {
      setPreview({ src: dataUrl });
      setStage('preview');
    },
    (message) => toast(message, 'bad'),
  );

  if (!album || !me) return <NotFound />;

  /* ---- Already used today's frame ---- */
  if (already && stage !== 'done') {
    const mine = todayState(data, album).mine;
    return (
      <Screen nav accent={album.accent}>
        <PageHeader
          title={<>One a<br />day</>}
          subtitle={album.name}
          onBack={() => back({ name: 'album', id: album.id })}
        />
        <div style={{ padding: '0 20px' }}>
          <EmptyState
            art={<Avatar person={me} size={64} posted />}
            title="You've already posted today"
            body={
              mine
                ? `Your frame went in at ${formatTime(mine.postedAt)}. That's the whole idea — one photo, then get on with your day.`
                : 'One photo per album, per day. See you tomorrow.'
            }
            action={
              <div className="stack" style={{ gap: 10, width: '100%', marginTop: 10 }}>
                <Button variant="primary" block onClick={() => replace({ name: 'today', id: album.id })}>
                  See today&apos;s page
                </Button>
                <Button variant="ghost" block onClick={() => push({ name: 'home' })}>
                  My albums
                </Button>
              </div>
            }
          />

          <p className="nextframe">
            <IconClock size={15} />
            Next frame opens in {timeUntilTomorrow()}
          </p>
        </div>
      </Screen>
    );
  }

  /* ---- Posted just now ---- */
  if (stage === 'done') {
    const postedStreak = personAlbumStreak(data, album.id, me.id, today);
    return (
      <Screen accent={album.accent}>
        <Confetti count={10} />
        <div className="celebrate" style={{ paddingTop: 96 }}>
          <div className="bigcheck">
            <IconCheck size={38} strokeWidth={3.4} />
          </div>
          <h1 className="celebrate__title">Photo posted</h1>
          <p className="celebrate__sub">
            That&apos;s today&apos;s frame in <strong>{album.name}</strong>. See you tomorrow.
          </p>
          {/* The reward for showing up, stated once and quietly. */}
          {postedStreak.current > 1 && (
            <p className="streakline">
              <Sparkle size={13} />
              {postedStreak.current} days in a row
              {postedStreak.current >= postedStreak.best ? ' — your best yet' : ''}
            </p>
          )}
          <div className="stack" style={{ gap: 10, width: '100%', marginTop: 16 }}>
            <Button variant="ink" size="lg" block onClick={() => replace({ name: 'today', id: album.id })}>
              See today&apos;s page
            </Button>
            <Button variant="ghost" block onClick={() => replace({ name: 'home' })}>
              Back to my albums
            </Button>
          </div>
        </div>
      </Screen>
    );
  }

  /* ---- Post it ---- */
  const post = async () => {
    if (!preview) return;
    // Guard the race between opening this screen and pressing the button.
    // The database enforces the same rule again; this is just a faster, and
    // friendlier, way to hear about it.
    if (hasPostedToday(data, album.id, me.id)) {
      toast("You've already posted to this album today", 'bad');
      return;
    }
    setPosting(true);
    try {
      await commands.postPhoto(album.id, { dataUrl: preview.src }, caption);
      setStage('done');
    } catch (err) {
      toast(err instanceof Error ? err.message : "That photo didn't post", 'bad');
    } finally {
      setPosting(false);
    }
  };

  /* ---- Choose / preview ---- */
  return (
    <Screen accent={album.accent}>
      {picker.inputs}
      <PageHeader
        title={<>Today&apos;s<br />photo</>}
        subtitle={`${album.name} · ${formatDayLong(today)}`}
        onBack={() => (stage === 'preview' ? setStage('pick') : back({ name: 'album', id: album.id }))}
      />

      <div className="form">
        {stage === 'pick' || !preview ? (
          <>
            <button className="slot" onClick={picker.chooseFile} disabled={picker.busy}>
              <span className="slot__inner">
                <span className="slot__lens">
                  <IconImage size={32} />
                </span>
                <span className="slot__title">{picker.busy ? 'Opening…' : 'Choose a photo'}</span>
                <span className="slot__sub">From your camera roll or files.</span>
              </span>
            </button>

            <Button
              variant="primary"
              size="lg"
              block
              icon={<IconCamera size={20} />}
              onClick={picker.takePhoto}
              disabled={picker.busy}
            >
              Take a photo
            </Button>

            <p className="join__hint">
              One photo per album, per day.
              <br />
              Make it the one that actually happened.
            </p>
          </>
        ) : (
          <>
            <div className="mounted">
              <img src={preview.src} alt="The photo you're about to post" />
              <div className="mounted__strip">
                <Avatar person={me} size={32} />
                <span className="mounted__meta">
                  <span className="mounted__who" style={{ display: 'block' }}>
                    {me.name}
                  </span>
                  <span className="mounted__when">Not posted yet</span>
                </span>
              </div>
            </div>

            <TextArea
              label="Add a caption — optional"
              placeholder="What a day…"
              rows={2}
              maxLength={120}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              hint={`${caption.length}/120`}
            />

            <div className="stack" style={{ gap: 12 }}>
              <Button
                variant="primary"
                size="lg"
                block
                onClick={() => void post()}
                disabled={posting || busy}
              >
                {posting ? 'Posting…' : 'Post photo'}
              </Button>
              <Button
                variant="ghost"
                block
                icon={<IconRefresh size={17} />}
                onClick={picker.chooseFile}
                disabled={posting}
              >
                Pick a different one
              </Button>
            </div>
          </>
        )}
      </div>
    </Screen>
  );
}
