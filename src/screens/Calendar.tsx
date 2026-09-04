/**
 * A month at a glance. Days that hold photos are filled tiles you can press;
 * everything else is quiet. Weeks start on Monday.
 */

import { useMemo, useState } from 'react';

import { IconBack, IconChevron } from '../components/Icons';
import { PhotoImage } from '../components/PhotoImage';
import { PageHeader, Screen } from '../components/Shell';
import { EmptyState, IconButton } from '../components/ui';
import { dateFromKey, dayKey, formatDay, monthName } from '../lib/util';
import { useApp } from '../state/AppContext';
import { useRouter } from '../state/router';
import { albumDays, daysWithPhotos, photosOnDay } from '../state/selectors';
import { NotFound } from './NotFound';

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export function Calendar({ albumId }: { albumId: string }) {
  const { data } = useApp();
  const { push, back } = useRouter();
  const album = data.albums[albumId];

  const today = dayKey();
  const [cursor, setCursor] = useState(() => {
    const d = dateFromKey(today);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const filled = useMemo(() => (album ? daysWithPhotos(data, album.id) : new Set<string>()), [data, album]);
  const allDays = useMemo(() => (album ? albumDays(data, album.id) : []), [data, album]);

  if (!album) return <NotFound />;

  const { year, month } = cursor;
  const first = new Date(year, month, 1);
  // Monday-first offset.
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const key = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const inMonth = allDays.filter((d) => d.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`));
  const photosThisMonth = inMonth.reduce((n, d) => n + photosOnDay(data, album.id, d).length, 0);

  const step = (delta: number) => {
    const d = new Date(year, month + delta, 1);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
  };

  // Don't let people wander past the current month.
  const now = dateFromKey(today);
  const atLatest = year === now.getFullYear() && month === now.getMonth();
  const earliest = allDays.length ? dateFromKey(allDays[allDays.length - 1]) : now;
  const atEarliest =
    year < earliest.getFullYear() ||
    (year === earliest.getFullYear() && month <= earliest.getMonth());

  return (
    <Screen nav accent={album.accent}>
      <PageHeader
        title="Calendar"
        subtitle={album.name}
        onBack={() => back({ name: 'album', id: album.id })}
      />

      <div className="cal">
        <div className="cal__head">
          <IconButton label="Previous month" onClick={() => step(-1)} disabled={atEarliest}
            style={{ opacity: atEarliest ? 0.35 : 1 }}>
            <IconBack size={19} />
          </IconButton>
          <span className="cal__month">
            {monthName(month)} {year}
          </span>
          <IconButton label="Next month" onClick={() => step(1)} disabled={atLatest}
            style={{ opacity: atLatest ? 0.35 : 1 }}>
            <IconChevron size={19} />
          </IconButton>
        </div>

        <div className="cal__dows" aria-hidden="true">
          {DOW.map((d) => (
            <span className="cal__dow" key={d}>
              {d}
            </span>
          ))}
        </div>

        <div className="cal__grid" role="grid" aria-label={`${monthName(month)} ${year}`}>
          {Array.from({ length: lead }, (_, i) => (
            <span className="cal__cell cal__cell--empty" key={`lead-${i}`} aria-hidden="true" />
          ))}

          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const k = key(d);
            const has = filled.has(k);
            const isToday = k === today;
            const future = k > today;
            const n = has ? photosOnDay(data, album.id, k).length : 0;

            const classes = [
              'cal__cell',
              has && 'cal__cell--has',
              isToday && 'cal__cell--today',
              future && 'cal__cell--future',
            ]
              .filter(Boolean)
              .join(' ');

            const label = has
              ? `${monthName(month)} ${d} — ${n} ${n === 1 ? 'photo' : 'photos'}`
              : `${monthName(month)} ${d} — no photos`;

            return has ? (
              <button
                key={k}
                className={classes}
                style={{ ['--i' as string]: i }}
                onClick={() => push({ name: 'today', id: album.id, day: k })}
                aria-label={label}
              >
                {d}
                <span className="cal__dot" aria-hidden="true" />
              </button>
            ) : (
              <span
                key={k}
                className={classes}
                style={{ ['--i' as string]: i }}
                role="gridcell"
                aria-label={label}
              >
                {d}
              </span>
            );
          })}
        </div>

        <div className="cal__legend">
          <span>
            <i />
            Has photos
          </span>
          <span>
            {inMonth.length} {inMonth.length === 1 ? 'day' : 'days'} · {photosThisMonth} photos
          </span>
        </div>
      </div>

      {inMonth.length === 0 && (
        <div style={{ padding: '0 20px 24px' }}>
          <EmptyState
            title="Nothing kept this month"
            body="Move back a month, or start today's page."
          />
        </div>
      )}

      {inMonth.length > 0 && <MonthSheet albumId={album.id} days={inMonth} month={month} />}
    </Screen>
  );
}

/**
 * A contact sheet for the month below the grid — the calendar answers "when",
 * this answers "what", and it keeps the screen from ending in dead paper.
 */
function MonthSheet({
  albumId,
  days,
  month,
}: {
  albumId: string;
  days: string[];
  month: number;
}) {
  const { data } = useApp();
  const { push } = useRouter();

  // One frame per day: two from the same day sit next to each other and read
  // as a repeat, which is exactly what a glance shouldn't show.
  const shots = days
    .map((d) => photosOnDay(data, albumId, d)[0])
    .filter(Boolean)
    .slice(0, 12);

  if (!shots.length) return null;

  return (
    <section style={{ paddingBottom: 8 }}>
      <div className="section">
        <h2 className="section__title">{monthName(month)} at a glance</h2>
        <span className="section__count">{shots.length}</span>
      </div>
      <div className="sheet">
        {shots.map((p, i) => (
          <button
            key={p.id}
            className="gridcell"
            style={{ ['--i' as string]: Math.min(i, 8) }}
            onClick={() => push({ name: 'today', id: albumId, day: p.day })}
            aria-label={`Open ${formatDay(p.day)}`}
          >
            <PhotoImage
              image={p.image}
              alt=""
              ratio="1 / 1"
              overlay={<span className="sheet__day">{dateFromKey(p.day).getDate()}</span>}
            />
          </button>
        ))}
      </div>
    </section>
  );
}
