/** You, your albums, and the handful of switches worth having. */

import { useMemo, useState, type ReactNode } from 'react';

import {
  IconCamera,
  IconClock,
  IconImage,
  IconPlus,
  IconTrash,
  IconUsers,
} from '../components/Icons';
import { useImageSrc } from '../components/PhotoImage';
import { PageHeader, Screen } from '../components/Shell';
import { Avatar, Button, Modal, TextField } from '../components/ui';
import { useImagePicker } from '../hooks/useImagePicker';
import { dataStore, imageStore } from '../lib/store';
import { uid } from '../lib/util';
import { emptyData } from '../lib/types';
import { useApp } from '../state/AppContext';
import { useRouter } from '../state/router';
import { albumPhotoCount, currentUser, myAlbums } from '../state/selectors';

export function Profile() {
  const { data, dispatch, toast } = useApp();
  const { push, replace } = useRouter();
  const me = currentUser(data);
  const albums = useMemo(() => myAlbums(data), [data]);
  const [confirmReset, setConfirmReset] = useState(false);

  const avatar = useImageSrc(me?.avatarImageId ? { kind: 'stored', id: me.avatarImageId } : null);

  const picker = useImagePicker(
    async (dataUrl) => {
      const id = uid('img');
      const durable = await imageStore.put(id, dataUrl);
      dispatch({ type: 'setUserAvatar', imageId: id });
      toast(
        durable ? 'Profile photo updated' : "Photo set, but this device won't keep it",
        durable ? 'ok' : 'bad',
      );
    },
    (message) => toast(message, 'bad'),
  );

  if (!me) return null;

  const myPhotos = Object.values(data.photos).filter((p) => p.authorId === me.id).length;

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

      <div className="section">
        <h2 className="section__title">My albums</h2>
        <span className="section__count">{albums.length}</span>
      </div>

      <div className="chiplist">
        {albums.map((a) => (
          <button
            key={a.id}
            className="chip"
            data-accent={a.accent}
            onClick={() => push({ name: 'album', id: a.id })}
          >
            {a.name}
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.7 }}>
              {albumPhotoCount(data, a.id)}
            </span>
          </button>
        ))}
        <button className="chip" style={{ background: 'var(--paper)' }} onClick={() => push({ name: 'create' })}>
          <IconPlus size={15} strokeWidth={3} />
          New album
        </button>
      </div>

      <div className="rows">
        <p className="field__label">Your details</p>
        <div style={{ marginBottom: 16 }}>
          <TextField
            label="Name"
            value={me.name}
            maxLength={24}
            onChange={(e) => dispatch({ type: 'renameUser', name: e.target.value })}
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
              onClick={() => {
                dispatch({ type: 'setUserAvatar', imageId: undefined });
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
          <button className="row-item row-item--danger" onClick={() => setConfirmReset(true)}>
            <span className="row-item__icon">
              <IconTrash size={17} />
            </span>
            <span className="row-item__mid">
              <span className="row-item__label">Start over</span>
              <span className="row-item__value">Clear everything on this device</span>
            </span>
          </button>
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
                dispatch({ type: 'reset', data: emptyData() });
                setConfirmReset(false);
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
