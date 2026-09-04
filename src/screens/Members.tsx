/** Who's in, and who's posted today. No follower counts, no rankings. */

import { useMemo } from 'react';

import { IconCheck, IconClock, IconShare } from '../components/Icons';
import { PageHeader, Screen } from '../components/Shell';
import { Avatar, Button, Progress, Tag } from '../components/ui';
import { shareInvite } from '../lib/share';
import { formatTime } from '../lib/util';
import { useApp } from '../state/AppContext';
import { useRouter } from '../state/router';
import { members, todayState } from '../state/selectors';
import { NotFound } from './NotFound';

export function Members({ albumId }: { albumId: string }) {
  const { data, toast } = useApp();
  const { back } = useRouter();
  const album = data.albums[albumId];

  const state = useMemo(() => (album ? todayState(data, album) : null), [data, album]);

  if (!album || !state) return <NotFound />;

  const roster = members(data, album);
  const postedIds = new Map(state.posted.map((p) => [p.authorId, p]));

  // Posted first, in the order they posted; then everyone still out.
  const ordered = [...roster].sort((a, b) => {
    const pa = postedIds.get(a.id);
    const pb = postedIds.get(b.id);
    if (pa && pb) return pa.postedAt < pb.postedAt ? -1 : 1;
    if (pa) return -1;
    if (pb) return 1;
    return a.name.localeCompare(b.name);
  });

  return (
    <Screen nav accent={album.accent}>
      <PageHeader
        title="Members"
        subtitle={`${album.name} · ${roster.length} ${roster.length === 1 ? 'member' : 'members'}`}
        onBack={() => back({ name: 'album', id: album.id })}
      />

      <div className="roster" style={{ marginTop: 0 }}>
        <div className="roster__top">
          <span className="roster__count">
            {state.count} / {state.total} posted today
          </span>
          <span className="grow" />
          {state.complete && <Tag variant="accent">Everyone&apos;s here</Tag>}
        </div>
        <Progress value={state.count} total={state.total} />
      </div>

      <ul className="memberlist">
        {ordered.map((person, i) => {
          const photo = postedIds.get(person.id);
          const isMe = person.id === data.currentUserId;
          return (
            <li
              key={person.id}
              className="member enter"
              style={{ ['--i' as string]: Math.min(i, 6) }}
            >
              <Avatar person={person} size={42} posted={Boolean(photo)} dim={!photo} />
              <span className="member__mid">
                <span className="member__name">
                  {person.name}
                  {isMe && <span className="member__you">You</span>}
                  {person.id === album.ownerId && <Tag variant="quiet">Owner</Tag>}
                </span>
                <span className="member__status">
                  {photo ? `Posted at ${formatTime(photo.postedAt)}` : 'Waiting for today’s photo…'}
                </span>
              </span>
              <span className={`member__mark ${photo ? 'member__mark--done' : ''}`}>
                {photo ? <IconCheck size={17} strokeWidth={3.2} /> : <IconClock size={17} />}
              </span>
            </li>
          );
        })}
      </ul>

      <div style={{ padding: '0 20px 32px' }}>
        <Button
          variant="primary"
          block
          icon={<IconShare size={18} />}
          onClick={() => void shareInvite(album, toast)}
        >
          Invite someone
        </Button>
      </div>
    </Screen>
  );
}
