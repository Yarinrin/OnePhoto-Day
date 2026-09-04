/** The album shelf, plus a nudge about today's unused frames. */

import { useMemo } from 'react';

import { CameraMark, IconCamera, IconChevron, IconImage, IconPlus, Sparkle } from '../components/Icons';
import { useImageSrc } from '../components/PhotoImage';
import { Screen } from '../components/Shell';
import { Avatar, Button, EmptyState, IconButton, Tag } from '../components/ui';
import type { Album } from '../lib/types';
import { dateFromKey, formatDay, relativeDayLabel } from '../lib/util';
import { useApp } from '../state/AppContext';
import { useRouter } from '../state/router';
import {
  albumPhotoCount,
  currentUser,
  hasPostedToday,
  lastActiveDay,
  members,
  myAlbums,
  todayState,
} from '../state/selectors';

export function Home() {
  const { data, today } = useApp();
  const { push } = useRouter();
  const me = currentUser(data);
  const albums = useMemo(() => myAlbums(data), [data]);

  const pending = albums.filter((a) => me && !hasPostedToday(data, a.id, me.id));

  return (
    <Screen nav>
      <header className="home__head">
        <div className="home__hi">
          <h1 className="home__greeting">Hi, {me?.name ?? 'there'}</h1>
          <p className="home__sub">Your memories, one day at a time.</p>
        </div>
        <div className="home__datechip" aria-label={formatDay(today)}>
          <b>{dateFromKey(today).getDate()}</b>
          <span>{formatDay(today).slice(0, 3)}</span>
        </div>
      </header>

      {albums.length > 0 && <TodayPrompt pending={pending.length} total={albums.length} />}

      <div className="section">
        <h2 className="section__title">My albums</h2>
        <span className="section__count">{albums.length}</span>
        <span className="grow" />
        <IconButton label="Create an album" accent onClick={() => push({ name: 'create' })}>
          <IconPlus size={22} strokeWidth={2.8} />
        </IconButton>
      </div>

      {albums.length === 0 ? (
        <div style={{ padding: '0 20px' }}>
          <EmptyState
            art={<CameraMark size={92} />}
            title="Nothing here yet"
            body="Create your first album and invite your people — or join one with a code."
            action={
              <div className="stack" style={{ gap: 10, width: '100%', marginTop: 8 }}>
                <Button variant="primary" block onClick={() => push({ name: 'create' })}>
                  Create an album
                </Button>
                <Button variant="ghost" block onClick={() => push({ name: 'join' })}>
                  I have a code
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <div className="albums">
          {albums.map((album, i) => (
            <AlbumCard key={album.id} album={album} index={i} />
          ))}
        </div>
      )}

      <div style={{ padding: 'var(--s6) var(--s5) 0' }}>
        <Button variant="ghost" block icon={<IconPlus size={18} />} onClick={() => push({ name: 'join' })}>
          Join with a code
        </Button>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function TodayPrompt({ pending, total }: { pending: number; total: number }) {
  const { data } = useApp();
  const { push } = useRouter();
  const albums = myAlbums(data);
  const me = data.currentUserId;
  const first = albums.find((a) => me && !hasPostedToday(data, a.id, me));

  if (pending === 0) {
    return (
      <section className="prompt prompt--done">
        <p className="prompt__eyebrow">
          <Sparkle size={13} /> All caught up
        </p>
        <h2 className="prompt__title">Today is in the book.</h2>
        <p className="prompt__body">
          You posted to {total === 1 ? 'your album' : `all ${total} albums`}. See you tomorrow.
        </p>
      </section>
    );
  }

  return (
    <section className="prompt" data-accent={first?.accent}>
      <p className="prompt__eyebrow">Today&apos;s frame</p>
      <h2 className="prompt__title">
        {pending === 1 ? 'One album is waiting on you.' : `${pending} albums are waiting on you.`}
      </h2>
      <p className="prompt__body">What&apos;s your day looking like? One photo is all it takes.</p>
      <div className="prompt__row">
        <Button
          variant="ink"
          icon={<IconCamera size={18} />}
          onClick={() => first && push({ name: 'upload', id: first.id })}
        >
          Post to {first?.name}
        </Button>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */

function AlbumCard({ album, index }: { album: Album; index: number }) {
  const { data } = useApp();
  const { push } = useRouter();
  const cover = useImageSrc(album.cover);
  const state = todayState(data, album);
  const count = albumPhotoCount(data, album.id);
  const roster = members(data, album);
  const last = lastActiveDay(data, album.id);
  const iPosted = Boolean(state.mine);

  return (
    <button
      className="albumcard"
      data-accent={album.accent}
      style={{ ['--i' as string]: index }}
      onClick={() => push({ name: 'album', id: album.id })}
      aria-label={`Open ${album.name}`}
    >
      <span className="albumcard__shot">
        {cover ? (
          <img className="albumcard__img" src={cover} alt="" />
        ) : (
          <span className="albumcard__empty">
            <IconImage size={26} />
          </span>
        )}
        {!iPosted && <span className="albumcard__dot" aria-hidden="true" />}
      </span>

      <span className="albumcard__body">
        <span className="albumcard__name">{album.name}</span>
        <span className="albumcard__meta">
          {roster.length} {roster.length === 1 ? 'member' : 'members'} · {count.toLocaleString()}{' '}
          {count === 1 ? 'photo' : 'photos'}
        </span>
        <span className="albumcard__foot">
          {last ? (
            <Tag variant={last === state.day ? 'ink' : 'quiet'}>{relativeDayLabel(last)}</Tag>
          ) : (
            <Tag variant="quiet">New</Tag>
          )}
          <span className="avatar-stack">
            {roster.slice(0, 4).map((p) => (
              <Avatar key={p.id} person={p} size={24} />
            ))}
          </span>
        </span>
      </span>

      <span className="albumcard__chev">
        <IconChevron size={20} />
      </span>
    </button>
  );
}
