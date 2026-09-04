/**
 * One day, everyone's frame. People who haven't posted still get a pocket on
 * the page — the gap is the point; it's what makes tomorrow interesting.
 */

import { useMemo, useState } from 'react';

import { IconCalendar, IconCamera, IconChevron, IconBack } from '../components/Icons';
import { Lightbox } from '../components/Lightbox';
import { PhotoImage } from '../components/PhotoImage';
import { PageHeader, Screen } from '../components/Shell';
import { Button, IconButton, Progress, Tag } from '../components/ui';
import type { Photo } from '../lib/types';
import { dayKey, formatDay, formatDayLong } from '../lib/util';
import { useApp } from '../state/AppContext';
import { useRouter } from '../state/router';
import { albumDays, members, photosOnDay, todayState } from '../state/selectors';
import { NotFound } from './NotFound';

export function TodayView({ albumId, day }: { albumId: string; day?: string }) {
  const { data } = useApp();
  const { push, back } = useRouter();
  const [open, setOpen] = useState<Photo | null>(null);

  const album = data.albums[albumId];
  const viewing = day ?? dayKey();
  const isToday = viewing === dayKey();

  const state = useMemo(
    () => (album ? todayState(data, album, viewing) : null),
    [data, album, viewing],
  );
  const days = useMemo(() => (album ? albumDays(data, album.id) : []), [data, album]);

  if (!album || !state) return <NotFound />;

  const photos = photosOnDay(data, album.id, viewing);
  const roster = members(data, album);
  const meId = data.currentUserId;

  // Neighbouring days that actually hold photos, for the arrows.
  const idx = days.indexOf(viewing);
  const older = idx >= 0 ? days[idx + 1] : days.find((d) => d < viewing);
  const newer = idx > 0 ? days[idx - 1] : [...days].reverse().find((d) => d > viewing);

  const goDay = (target?: string) => {
    if (target) push({ name: 'today', id: album.id, day: target });
  };

  return (
    <Screen nav accent={album.accent}>
      <PageHeader
        title={isToday ? 'Today' : formatDay(viewing)}
        subtitle={isToday ? formatDayLong(viewing) : album.name}
        onBack={() => back({ name: 'album', id: album.id })}
        right={
          <IconButton label="Open calendar" onClick={() => push({ name: 'calendar', id: album.id })}>
            <IconCalendar size={21} />
          </IconButton>
        }
      />

      <div className="roster" style={{ marginTop: 0 }}>
        <div className="roster__top">
          <span className="roster__count">
            {state.count} / {state.total} posted {isToday ? 'today' : 'that day'}
          </span>
          <span className="grow" />
          {state.complete && <Tag variant="accent">Full page</Tag>}
        </div>
        <Progress value={state.count} total={state.total} />
      </div>

      {photos.length === 0 && state.waiting.length === roster.length ? (
        <div style={{ padding: '0 20px 24px' }}>
          <div className="empty">
            <h3 className="empty__title">
              {isToday ? "Today's page is still empty" : 'Nothing was kept that day'}
            </h3>
            <p className="empty__body">
              {isToday
                ? 'Be the first one to post — everyone else sees the page fill up.'
                : 'Some days slip past. That happens.'}
            </p>
            {isToday && (
              <Button
                variant="primary"
                icon={<IconCamera size={18} />}
                style={{ marginTop: 8 }}
                onClick={() => push({ name: 'upload', id: album.id })}
              >
                Add today&apos;s photo
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="grid">
          {photos.map((p, i) => {
            const author = data.people[p.authorId];
            return (
              <button
                key={p.id}
                className={`gridcell ${p.authorId === meId ? 'gridcell--mine' : ''}`}
                style={{ ['--i' as string]: i }}
                onClick={() => setOpen(p)}
                aria-label={`Open ${author?.name ?? 'a'}'s photo`}
              >
                <PhotoImage
                  image={p.image}
                  alt={`${author?.name ?? 'A member'}'s photo from ${formatDay(viewing)}`}
                  ratio="3 / 4"
                  overlay={
                    <span className="byline">{p.authorId === meId ? 'You' : author?.name}</span>
                  }
                />
              </button>
            );
          })}

          {state.waiting.map((person, i) => (
            <div
              key={person.id}
              className="waiting"
              style={{ ['--i' as string]: photos.length + i }}
            >
              <span className="waiting__name">{person.id === meId ? 'You' : person.name}</span>
              <span className="waiting__dots" aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="waiting__note">
                {person.id === meId
                  ? isToday
                    ? 'Your frame is still open'
                    : 'You skipped this one'
                  : isToday
                    ? 'Waiting for today’s photo…'
                    : 'Never posted'}
              </span>
            </div>
          ))}
        </div>
      )}

      {isToday && !state.mine && photos.length > 0 && (
        <div style={{ padding: '0 20px 24px' }}>
          <Button
            variant="primary"
            size="lg"
            block
            icon={<IconCamera size={20} />}
            onClick={() => push({ name: 'upload', id: album.id })}
          >
            Add your photo
          </Button>
        </div>
      )}

      <div className="quickrow">
        <button className="quick" disabled={!older} onClick={() => goDay(older)}
          style={{ opacity: older ? 1 : 0.4, cursor: older ? 'pointer' : 'default' }}>
          <IconBack size={18} />
          {older ? formatDay(older) : 'Nothing older'}
        </button>
        <button
          className="quick"
          disabled={!newer}
          onClick={() => goDay(newer)}
          style={{ opacity: newer ? 1 : 0.4, cursor: newer ? 'pointer' : 'default', justifyContent: 'flex-end' }}
        >
          {newer ? formatDay(newer) : 'Nothing newer'}
          <IconChevron size={18} />
        </button>
      </div>

      <Lightbox photo={open} albumId={album.id} onClose={() => setOpen(null)} />
    </Screen>
  );
}
