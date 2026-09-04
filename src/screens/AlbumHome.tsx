/**
 * The album. Today sits at the top — either an empty slot asking for your
 * frame, or your frame, mounted. Everything else is history below it.
 */

import { useEffect, useMemo } from 'react';

import {
  IconCalendar,
  IconCamera,
  IconChevron,
  IconSettings,
  IconShare,
  IconUsers,
  Sparkle,
} from '../components/Icons';
import { PhotoImage, useImageSrc } from '../components/PhotoImage';
import { PageHeader, Screen } from '../components/Shell';
import { Avatar, Button, EmptyState, IconButton, Progress, Tag } from '../components/ui';
import { shareInvite } from '../lib/share';
import { formatDay, formatTime } from '../lib/util';
import { useApp } from '../state/AppContext';
import { useRouter } from '../state/router';
import {
  albumDays,
  albumPhotoCount,
  currentUser,
  members,
  personAlbumStreak,
  photosOnDay,
  todayState,
} from '../state/selectors';
import { NotFound } from './NotFound';

export function AlbumHome({ albumId }: { albumId: string }) {
  const { data, dispatch, toast, today } = useApp();
  const { push, back } = useRouter();
  const album = data.albums[albumId];

  // Opening an album makes it the one the bottom bar acts on.
  useEffect(() => {
    if (album && data.activeAlbumId !== album.id) {
      dispatch({ type: 'setActiveAlbum', albumId: album.id });
    }
  }, [album, data.activeAlbumId, dispatch]);

  // `today` is in the deps so a tab left open past midnight moves on rather
  // than showing yesterday's page as today's.
  const state = useMemo(
    () => (album ? todayState(data, album, today) : null),
    [data, album, today],
  );
  const history = useMemo(
    () => (album ? albumDays(data, album.id).filter((d) => d !== state?.day).slice(0, 3) : []),
    [data, album, state?.day],
  );

  if (!album || !state) return <NotFound />;

  const roster = members(data, album);
  const me = currentUser(data);
  const photoCount = albumPhotoCount(data, album.id);
  const myCount = me
    ? Object.values(data.photos).filter((p) => p.albumId === album.id && p.authorId === me.id).length
    : 0;
  const myStreak = me
    ? personAlbumStreak(data, album.id, me.id, today)
    : { current: 0, best: 0 };

  return (
    <Screen nav accent={album.accent}>
      <PageHeader
        title={album.name}
        subtitle={`${roster.length} ${roster.length === 1 ? 'member' : 'members'} · ${photoCount.toLocaleString()} photos`}
        onBack={() => back({ name: 'home' })}
        right={
          <IconButton label="Album settings" onClick={() => push({ name: 'settings', id: album.id })}>
            <IconSettings size={21} />
          </IconButton>
        }
      />

      <section className="today">
        <div className="today__label">
          <span className="today__word">Today</span>
          {state.mine ? (
            <Tag variant="ink">Posted</Tag>
          ) : (
            <Tag variant="quiet">{formatDay(state.day)}</Tag>
          )}
          <span className="grow" />
          {state.complete && (
            <Tag variant="accent">
              <Sparkle size={10} /> Everyone&apos;s here
            </Tag>
          )}
        </div>

        {state.mine ? (
          <MountedPhoto
            albumId={album.id}
            onView={() => push({ name: 'today', id: album.id })}
          />
        ) : (
          <button className="slot" onClick={() => push({ name: 'upload', id: album.id })}>
            <span className="slot__inner">
              <span className="slot__lens">
                <IconCamera size={34} />
              </span>
              <span className="slot__title">Add today&apos;s photo</span>
              <span className="slot__sub">
                {state.count === 0
                  ? "Today's page is still empty. Be the first one to post."
                  : `${state.count} of ${state.total} have posted. Your frame is still open.`}
              </span>
            </span>
          </button>
        )}
      </section>

      {roster.length === 1 ? (
        /* A brand-new album: a 0/1 progress bar is a joke on the person who
           just made it. Ask them to bring someone instead. */
        <div className="roster">
          <div className="roster__top">
            <span className="roster__count">It&apos;s just you in here</span>
          </div>
          <p style={{ fontSize: 13, color: 'var(--ink-faint)', lineHeight: 1.4 }}>
            Send the code to your people — the album starts properly once someone else is in.
          </p>
          <Button
            variant="primary"
            block
            size="sm"
            icon={<IconShare size={15} />}
            onClick={() => void shareInvite(album, toast)}
          >
            Invite with {album.inviteCode}
          </Button>
        </div>
      ) : (
      <div className="roster">
        <div className="roster__top">
          <span className="avatar-stack">
            {/* Overlapping avatars have no room for tick badges — the greyed
                ones are the people still out, and the count says the rest. */}
            {roster.slice(0, 5).map((p) => (
              <Avatar
                key={p.id}
                person={p}
                size={30}
                dim={state.waiting.some((w) => w.id === p.id)}
              />
            ))}
          </span>
          <span className="grow" />
          <span className="roster__count">
            {state.count} / {state.total} posted today
          </span>
        </div>
        <Progress value={state.count} total={state.total} />
        {state.mine && (
          <Button
            variant="primary"
            block
            size="sm"
            icon={<IconChevron size={15} />}
            onClick={() => push({ name: 'today', id: album.id })}
          >
            View today
          </Button>
        )}
      </div>
      )}

      {/* A row of zeroes tells a new album's owner nothing. */}
      {photoCount > 0 && (
        <div className="stats">
          {/* A live streak lights up; a broken one stays quiet paper. */}
          <div className={`stat ${myStreak.current > 0 ? 'stat--live' : ''}`}>
            <b>{myStreak.current}</b>
            <span>Your streak</span>
          </div>
          <div className="stat">
            <b>{myStreak.best}</b>
            <span>Your best</span>
          </div>
          <div className="stat">
            <b>{myCount}</b>
            <span>Your photos</span>
          </div>
        </div>
      )}

      <div className="quickrow">
        <button className="quick" onClick={() => push({ name: 'calendar', id: album.id })}>
          <IconCalendar size={20} />
          Calendar
        </button>
        <button className="quick" onClick={() => push({ name: 'members', id: album.id })}>
          <IconUsers size={20} />
          Members
        </button>
      </div>

      <div className="section">
        <h2 className="section__title">Earlier</h2>
        <span className="grow" />
        {history.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => push({ name: 'timeline', id: album.id })}>
            See all
          </Button>
        )}
      </div>

      {history.length === 0 ? (
        <div style={{ padding: '0 20px' }}>
          <EmptyState
            title="No history yet"
            body="Once a few days go by, they'll stack up here like pages."
          />
        </div>
      ) : (
        history.map((day, i) => (
          <DayStrip key={day} albumId={album.id} day={day} index={i} />
        ))
      )}
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function MountedPhoto({ albumId, onView }: { albumId: string; onView: () => void }) {
  const { data } = useApp();
  const album = data.albums[albumId];
  const state = todayState(data, album);
  const photo = state.mine;
  const src = useImageSrc(photo?.image);
  const me = currentUser(data);

  if (!photo || !me) return null;

  return (
    <div className="mounted" onClick={onView} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onView()}>
      {src ? (
        <img src={src} alt={`Your photo for ${formatDay(photo.day)}`} />
      ) : (
        <div style={{ aspectRatio: '4 / 3' }} className="frame__skeleton" />
      )}
      {photo.caption && <p className="mounted__caption">“{photo.caption}”</p>}
      <div className="mounted__strip">
        <Avatar person={me} size={32} posted />
        <span className="mounted__meta">
          <span className="mounted__who" style={{ display: 'block' }}>
            Your frame
          </span>
          <span className="mounted__when">You posted at {formatTime(photo.postedAt)}</span>
        </span>
        <IconChevron size={19} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function DayStrip({
  albumId,
  day,
  index,
}: {
  albumId: string;
  day: string;
  index: number;
}) {
  const { data } = useApp();
  const { push } = useRouter();
  const photos = photosOnDay(data, albumId, day);
  if (!photos.length) return null;

  return (
    <section className="day" style={{ ['--i' as string]: index }}>
      <div className="day__head">
        <h3 className="day__date">{formatDay(day)}</h3>
        <span className="day__rule" />
        <span className="day__n">{photos.length}</span>
      </div>
      <div className="strip">
        {photos.map((p) => {
          const author = data.people[p.authorId];
          return (
            <button
              key={p.id}
              className="gridcell"
              onClick={() => push({ name: 'today', id: albumId, day })}
              aria-label={`${author?.name ?? 'Someone'}'s photo from ${formatDay(day)}`}
            >
              <PhotoImage
                image={p.image}
                alt=""
                ratio="3 / 4"
                overlay={<span className="byline">{author?.name ?? '—'}</span>}
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
