/** Rename, recolour, re-cover, invite, and the two ways out. */

import { useState } from 'react';

import {
  IconCheck,
  IconCopy,
  IconExit,
  IconImage,
  IconRefresh,
  IconShare,
  IconTrash,
  IconUsers,
} from '../components/Icons';
import { useImageSrc } from '../components/PhotoImage';
import { PageHeader, Screen } from '../components/Shell';
import { Button, Modal, TextField, useCopy } from '../components/ui';
import { useImagePicker } from '../hooks/useImagePicker';
import { shareInvite } from '../lib/share';
import { ACCENTS, type AccentKey } from '../lib/types';
import { useApp } from '../state/AppContext';
import { useRouter } from '../state/router';
import { albumPhotoCount, members } from '../state/selectors';
import { NotFound } from './NotFound';

export function AlbumSettings({ albumId }: { albumId: string }) {
  const { data, commands, toast } = useApp();
  const { push, back, replace } = useRouter();
  const [copied, copy] = useCopy();
  const [confirm, setConfirm] = useState<'leave' | 'delete' | null>(null);

  const album = data.albums[albumId];
  const cover = useImageSrc(album?.cover);

  const picker = useImagePicker(
    async (dataUrl) => {
      await commands.setAlbumCover(albumId, { dataUrl });
      toast('Cover updated', 'ok');
    },
    (message) => toast(message, 'bad'),
  );

  if (!album) return <NotFound />;

  const roster = members(data, album);
  const isOwner = album.ownerId === data.currentUserId;

  return (
    <Screen nav accent={album.accent}>
      {picker.inputs}
      <PageHeader
        title="Album settings"
        subtitle={album.name}
        onBack={() => back({ name: 'album', id: album.id })}
      />

      <div className="form" style={{ gap: 22, paddingBottom: 8 }}>
        <TextField
          label="Album name"
          value={album.name}
          maxLength={28}
          onChange={(e) => void commands.renameAlbum(albumId, e.target.value)}
        />

        <div>
          <p className="field__label">Album colour</p>
          <div className="swatches">
            {ACCENTS.map((key: AccentKey) => (
              <button
                key={key}
                type="button"
                className="swatch"
                data-accent={key}
                aria-label={key}
                aria-pressed={album.accent === key}
                onClick={() => void commands.setAlbumAccent(albumId, key)}
              >
                {album.accent === key && <IconCheck size={20} strokeWidth={3.2} />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="field__label">Cover photo</p>
          <button
            type="button"
            className={`dropzone ${cover ? 'dropzone--filled' : ''}`}
            onClick={picker.chooseFile}
            aria-label="Change cover photo"
          >
            {cover ? (
              <>
                <img src={cover} alt="Current album cover" />
                <span className="btn btn--sm dropzone__swap">
                  <IconImage size={14} /> Change
                </span>
              </>
            ) : (
              <span className="dropzone__inner">
                <span className="dropzone__plus">
                  <IconImage size={22} />
                </span>
                <span className="dropzone__hint">Add a cover</span>
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="rows">
        <p className="field__label">Invite</p>
        <div className="coderow">
          <span className="coderow__code">{album.inviteCode}</span>
          <Button
            size="sm"
            icon={copied ? <IconCheck size={14} strokeWidth={3} /> : <IconCopy size={14} />}
            onClick={async () => {
              const ok = await copy(album.inviteCode);
              toast(ok ? 'Code copied' : "Couldn't reach the clipboard", ok ? 'ok' : 'bad');
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>

        <div className="rows__group">
          <button className="row-item" onClick={() => void shareInvite(album, toast)}>
            <span className="row-item__icon">
              <IconShare size={17} />
            </span>
            <span className="row-item__mid">
              <span className="row-item__label">Share invite</span>
              <span className="row-item__value">Send the code to your people</span>
            </span>
          </button>

          {isOwner && (
            <button
              className="row-item"
              onClick={async () => {
                try {
                  await commands.regenerateCode(albumId);
                  toast('New invite code generated', 'ok');
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Could not change the code', 'bad');
                }
              }}
            >
              <span className="row-item__icon">
                <IconRefresh size={17} />
              </span>
              <span className="row-item__mid">
                <span className="row-item__label">New code</span>
                <span className="row-item__value">The old one stops working</span>
              </span>
            </button>
          )}

          <button className="row-item" onClick={() => push({ name: 'members', id: album.id })}>
            <span className="row-item__icon">
              <IconUsers size={17} />
            </span>
            <span className="row-item__mid">
              <span className="row-item__label">Members</span>
              <span className="row-item__value">
                {roster.length} {roster.length === 1 ? 'person' : 'people'} ·{' '}
                {albumPhotoCount(data, album.id).toLocaleString()} photos
              </span>
            </span>
          </button>
        </div>
      </div>

      <div className="rows">
        <p className="field__label">Danger zone</p>
        <div className="rows__group">
          <button className="row-item row-item--danger" onClick={() => setConfirm('leave')}>
            <span className="row-item__icon">
              <IconExit size={17} />
            </span>
            <span className="row-item__mid">
              <span className="row-item__label">Leave album</span>
              <span className="row-item__value">Your photos here go with you</span>
            </span>
          </button>

          {isOwner && (
            <button className="row-item row-item--danger" onClick={() => setConfirm('delete')}>
              <span className="row-item__icon">
                <IconTrash size={17} />
              </span>
              <span className="row-item__mid">
                <span className="row-item__label">Delete album</span>
                <span className="row-item__value">Everyone loses it. No undo.</span>
              </span>
            </button>
          )}
        </div>
      </div>

      <Modal
        open={confirm === 'leave'}
        title={`Leave ${album.name}?`}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <Button
              variant="danger"
              block
              onClick={async () => {
                const name = album.name;
                try {
                  await commands.leaveAlbum(albumId);
                  setConfirm(null);
                  toast(`You left ${name}`);
                  replace({ name: 'home' });
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Could not leave', 'bad');
                }
              }}
            >
              Yes, leave
            </Button>
            <Button variant="ghost" block onClick={() => setConfirm(null)}>
              Stay
            </Button>
          </>
        }
      >
        You&apos;ll stop seeing new photos, and the ones you posted here are removed. You can rejoin
        later with the code.
      </Modal>

      <Modal
        open={confirm === 'delete'}
        title={`Delete ${album.name}?`}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <Button
              variant="danger"
              block
              onClick={async () => {
                const name = album.name;
                try {
                  await commands.deleteAlbum(albumId);
                  setConfirm(null);
                  toast(`${name} deleted`);
                  replace({ name: 'home' });
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'Could not delete', 'bad');
                }
              }}
            >
              Delete for everyone
            </Button>
            <Button variant="ghost" block onClick={() => setConfirm(null)}>
              Keep it
            </Button>
          </>
        }
      >
        This removes {albumPhotoCount(data, album.id).toLocaleString()} photos for all{' '}
        {roster.length} members. There&apos;s no undo.
      </Modal>
    </Screen>
  );
}
