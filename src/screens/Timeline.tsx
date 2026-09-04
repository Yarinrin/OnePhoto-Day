/**
 * The album as a diary: one page per day, newest first, loaded in chunks so a
 * long-running album doesn't render a thousand frames at once.
 */

import { useMemo, useState } from 'react';

import { IconCalendar } from '../components/Icons';
import { PageHeader, Screen } from '../components/Shell';
import { Button, EmptyState, IconButton } from '../components/ui';
import { useApp } from '../state/AppContext';
import { useRouter } from '../state/router';
import { albumDays, albumPhotoCount } from '../state/selectors';
import { DayStrip } from './AlbumHome';
import { NotFound } from './NotFound';

const PAGE = 12;

export function Timeline({ albumId }: { albumId: string }) {
  const { data } = useApp();
  const { push, back } = useRouter();
  const [shown, setShown] = useState(PAGE);

  const album = data.albums[albumId];
  const days = useMemo(() => (album ? albumDays(data, album.id) : []), [data, album]);

  if (!album) return <NotFound />;

  const visible = days.slice(0, shown);

  return (
    <Screen nav accent={album.accent}>
      <PageHeader
        title="Timeline"
        subtitle={`${album.name} · ${albumPhotoCount(data, album.id).toLocaleString()} photos`}
        onBack={() => back({ name: 'album', id: album.id })}
        right={
          <IconButton label="Open calendar" onClick={() => push({ name: 'calendar', id: album.id })}>
            <IconCalendar size={21} />
          </IconButton>
        }
      />

      {days.length === 0 ? (
        <div style={{ padding: '0 20px' }}>
          <EmptyState
            title="No pages yet"
            body="The first photo starts the diary. It fills in from there."
          />
        </div>
      ) : (
        <>
          {visible.map((day, i) => (
            <DayStrip key={day} albumId={album.id} day={day} index={Math.min(i, 6)} />
          ))}

          {shown < days.length && (
            <div style={{ padding: '0 20px 32px' }}>
              <Button variant="ghost" block onClick={() => setShown((n) => n + PAGE)}>
                Load earlier days
              </Button>
            </div>
          )}

          {shown >= days.length && (
            <p
              className="eyebrow"
              style={{ textAlign: 'center', padding: '0 20px 32px' }}
            >
              — the beginning —
            </p>
          )}
        </>
      )}
    </Screen>
  );
}
