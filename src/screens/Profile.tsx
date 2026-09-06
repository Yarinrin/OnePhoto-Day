/** You, your albums, and the handful of switches worth having. */

import { useMemo, useState, type ReactNode } from 'react';

import {
  IconCamera,
  IconClock,
  IconExit,
  IconImage,
  IconPlus,
  IconTrash,
  IconUsers,
} from '../components/Icons';
import { useImageSrc } from '../components/PhotoImage';
import { PageHeader, Screen } from '../components/Shell';
import { Avatar, Button, IconButton, Modal, TextField } from '../components/ui';
import { useImagePicker } from '../hooks/useImagePicker';
import { dataStore } from '../lib/store';
import { useApp } from '../state/AppContext';
import { useRouter } from '../state/router';
import { currentUser, myAlbums, personAlbumStreak, personStreak } from '../state/selectors';

export function Profile() {
  const { data, dispatch, commands, toast, today, mode, signOut } = useApp();
  const { push, replace } = useRouter();
  const me = currentUser(data);
  const albums = useMemo(() => myAlbums(data), [data]);
  const [confirmReset, setConfirmReset] = useState(false);

  const avatar = useImageSrc(
    me?.avatarImageId
      ? mode === 'live'
        ? { kind: 'remote', path: me.avatarImageId }
        : { kind: 'stored', id: me.avatarImageId }
      : null,
  );

  const picker = useImagePicker(
    async (image) => {
      await commands.setAvatar(image);
      toast('Profile photo updated', 'ok');
    },
    (message) => toast(message, 'bad'),
  );

  if (!me) return null;

  const myPhotos = Object.values(data.photos).filter((p) => p.authorId === me.id).length;
  const overall = personStreak(data, me.id, today);

  return (
    <Screen nav>
      {picker.inputs}
      <PageHeader title="You" subtitle="Profile & settings" />

      <div className="profile__hero">
        <button className="profile__avatar" onClick={picker.chooseFile} aria-label="Change profile photo">
          <Avatar person={me} size={78} src={avatar} />
          <span className="profile__edit" aria-hidden="true">
            <IconCamera size={15} />
          </span>
        </button>
        <div className="grow">
          <h2 className="profile__name">{me.name}</h2>
          <p className="profile__meta">
            {albums.length} {albums.length === 1 ? 'album' : 'albums'} · {myPhotos.toLocaleString()}{' '}
            photos kept
          </p>
        </div>
      </div>

      {/* Your run across every album — posting anywhere keeps the day alive. */}
      <div className="stats">
        <div className={`stat ${overall.current > 0 ? 'stat--live' : ''}`}>
          <b>{overall.current}</b>
          <span>Day streak</span>
        </div>
        <div className="stat">
          <b>{overall.best}</b>
          <span>Best ever</span>
        </div>
        <div className="stat">
          <b>{myPhotos.toLocaleString()}</b>
          <span>Photos</span>
        </div>
      </div>

      <div className="section">
        <h2 className="section__title">My albums</h2>
        <span className="section__count">{albums.length}</span>
        <span className="grow" />
        <IconButton label="Create an album" accent onClick={() => push({ name: 'create' })}>
          <IconPlus size={20} strokeWidth={2.8} />
        </IconButton>
      </div>

      {albums.length > 0 && (
        <div className="tablewrap">
          <table className="dtable">
            <caption className="sr-only">
              Your albums, how many people are in each, and your posting streaks
            </caption>
            <thead>
              <tr>
                <th scope="col">Album</th>
                <th scope="col" className="dtable__num">
                  People
                </th>
                <th scope="col" className="dtable__num">
                  Streak
                </th>
                <th scope="col" className="dtable__num">
                  Best
                </th>
              </tr>
            </thead>
            <tbody>
              {albums.map((a) => {
                const streak = personAlbumStreak(data, a.id, me.id, today);
                return (
                  <tr key={a.id}>
                    <th scope="row">
                      <button
                        className="dtable__link"
                        onClick={() => push({ name: 'album', id: a.id })}
                      >
                        <span className="dtable__dot" data-accent={a.accent} aria-hidden="true" />
                        {a.name}
                      </button>
                    </th>
                    <td className="dtable__num">{a.memberIds.length}</td>
                    <td className={`dtable__num ${streak.current > 0 ? 'dtable__num--live' : ''}`}>
                      {streak.current}
                    </td>
                    <td className="dtable__num">{streak.best}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rows">
        <p className="field__label">Your details</p>
        <div style={{ marginBottom: 16 }}>
          <TextField
            label="Name"
            value={me.name}
            maxLength={24}
            onChange={(e) => void commands.renameUser(e.target.value)}
            hint="Shown next to your photos."
          />
        </div>

        <div className="rows__group">
          <button className="row-item" onClick={picker.chooseFile}>
            <span className="row-item__icon">
              <IconImage size={17} />
            </span>
            <span className="row-item__mid">
              <span className="row-item__label">Profile photo</span>
              <span className="row-item__value">
                {me.avatarImageId ? 'Tap to change' : 'Add one so your friends spot you'}
              </span>
            </span>
          </button>
          {me.avatarImageId && (
            <button
              className="row-item"
              onClick={async () => {
                await commands.setAvatar(null);
                toast('Back to initials');
              }}
            >
              <span className="row-item__icon">
                <IconTrash size={17} />
              </span>
              <span className="row-item__mid">
                <span className="row-item__label">Remove photo</span>
                <span className="row-item__value">Go back to your initials</span>
              </span>
            </button>
          )}
        </div>
      </div>

      <div className="rows">
        <p className="field__label">Notifications</p>
        <div className="rows__group">
          <ToggleRow
            icon={<IconClock size={17} />}
            label="Daily reminder"
            value="An evening nudge if your frame is open"
            checked={data.settings.dailyReminder}
            onChange={(v) => dispatch({ type: 'setSetting', key: 'dailyReminder', value: v })}
          />
          <ToggleRow
            icon={<IconUsers size={17} />}
            label="Album activity"
            value="When an album fills up for the day"
            checked={data.settings.albumActivity}
            onChange={(v) => dispatch({ type: 'setSetting', key: 'albumActivity', value: v })}
          />
        </div>
        {/* These are stored preferences, not working notifications — sending
            them needs a server. Saying so beats a switch that quietly lies. */}
        <p className="field__hint" style={{ marginTop: 10 }}>
          Saved on this device. Reminders start arriving once albums sync between
          phones — this build keeps everything local.
        </p>
      </div>

      <div className="rows">
        <p className="field__label">Albums</p>
        <div className="rows__group">
          <button className="row-item" onClick={() => push({ name: 'create' })}>
            <span className="row-item__icon">
              <IconPlus size={17} strokeWidth={2.8} />
            </span>
            <span className="row-item__mid">
              <span className="row-item__label">Create album</span>
              <span className="row-item__value">Start something with your people</span>
            </span>
          </button>
          <button className="row-item" onClick={() => push({ name: 'join' })}>
            <span className="row-item__icon">
              <IconUsers size={17} />
            </span>
            <span className="row-item__mid">
              <span className="row-item__label">Join with a code</span>
              <span className="row-item__value">Six characters from a friend</span>
            </span>
          </button>
        </div>
      </div>

      <div className="rows">
        <div className="rows__group">
          {mode === 'live' ? (
            <button className="row-item row-item--danger" onClick={() => void signOut()}>
              <span className="row-item__icon">
                <IconExit size={17} />
              </span>
              <span className="row-item__mid">
                <span className="row-item__label">Sign out</span>
                <span className="row-item__value">
                  Your albums stay put — sign back in any time
                </span>
              </span>
            </button>
          ) : (
            <button className="row-item row-item--danger" onClick={() => setConfirmReset(true)}>
              <span className="row-item__icon">
                <IconTrash size={17} />
              </span>
              <span className="row-item__mid">
                <span className="row-item__label">Start over</span>
                <span className="row-item__value">Clear everything on this device</span>
              </span>
            </button>
          )}
        </div>
      </div>

      <p className="eyebrow" style={{ textAlign: 'center', padding: '0 20px 30px' }}>
        One photo / day · No feed · No likes
      </p>

      <Modal
        open={confirmReset}
        title="Start over?"
        onClose={() => setConfirmReset(false)}
        actions={
          <>
            <Button
              variant="danger"
              block
              onClick={async () => {
                await dataStore.clear();
                setConfirmReset(false);
                await signOut();
                replace({ name: 'onboarding' });
              }}
            >
              Clear everything
            </Button>
            <Button variant="ghost" block onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
          </>
        }
      >
        This wipes your albums and photos from this device and takes you back to the welcome screen.
      </Modal>
    </Screen>
  );
}

function ToggleRow({
  icon,
  label,
  value,
  checked,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="row-item row-item--static">
      <span className="row-item__icon">{icon}</span>
      <span className="row-item__mid">
        <span className="row-item__label">{label}</span>
        <span className="row-item__value">{value}</span>
      </span>
      <button
        type="button"
        className="toggle"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}
