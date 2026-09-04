/** Name it, pick a colour, add a cover — then hand over the invite code. */

import { useState } from 'react';

import { Confetti } from '../components/Confetti';
import { IconCheck, IconCopy, IconImage, IconPlus, IconShare } from '../components/Icons';
import { PageHeader, Screen } from '../components/Shell';
import { Button, TextField, useCopy } from '../components/ui';
import { useImagePicker } from '../hooks/useImagePicker';
import { imageStore } from '../lib/store';
import { ACCENTS, type AccentKey, type ImageRef } from '../lib/types';
import { uid } from '../lib/util';
import { useApp } from '../state/AppContext';
import { newAlbumAction } from '../state/reducer';
import { useRouter } from '../state/router';
import { shareInvite } from '../lib/share';

export function CreateAlbum() {
  const { data, dispatch, toast } = useApp();
  const { back } = useRouter();

  const [name, setName] = useState('');
  const [accent, setAccent] = useState<AccentKey>('yellow');
  const [cover, setCover] = useState<ImageRef | null>(null);
  const [coverSrc, setCoverSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const picker = useImagePicker(
    async (dataUrl) => {
      const id = uid('img');
      await imageStore.put(id, dataUrl);
      setCover({ kind: 'stored', id });
      setCoverSrc(dataUrl);
    },
    (message) => toast(message, 'bad'),
  );

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      setError('Give it a name your friends will recognise.');
      return;
    }
    const clash = Object.values(data.albums).some(
      (a) => a.memberIds.includes(data.currentUserId ?? '') && a.name.toLowerCase() === trimmed.toLowerCase(),
    );
    if (clash) {
      setError('You already have an album with that name.');
      return;
    }
    const action = newAlbumAction(trimmed, accent, cover ?? undefined);
    dispatch(action);
    setCreatedId(action.type === 'createAlbum' ? action.albumId : null);
  };

  if (createdId) return <AlbumCreated albumId={createdId} />;

  return (
    <Screen accent={accent}>
      {picker.inputs}
      <PageHeader title={<>Create<br />album</>} subtitle="Step 1 of 1" onBack={() => back({ name: 'home' })} />

      <div className="form">
        <TextField
          label="Album name"
          placeholder="The Boys"
          value={name}
          maxLength={28}
          error={error}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />

        <div>
          <p className="field__label">Album colour</p>
          <div className="swatches">
            {ACCENTS.map((key) => (
              <button
                key={key}
                type="button"
                className="swatch"
                data-accent={key}
                aria-label={key}
                aria-pressed={accent === key}
                onClick={() => setAccent(key)}
              >
                {accent === key && <IconCheck size={20} strokeWidth={3.2} />}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="field__label">Cover photo — optional</p>
          <button
            type="button"
            className={`dropzone ${coverSrc ? 'dropzone--filled' : ''}`}
            onClick={picker.chooseFile}
            aria-label={coverSrc ? 'Change cover photo' : 'Add a cover photo'}
          >
            {coverSrc ? (
              <>
                <img src={coverSrc} alt="Selected album cover" />
                <span className="btn btn--sm dropzone__swap">
                  <IconImage size={14} /> Change
                </span>
              </>
            ) : (
              <span className="dropzone__inner">
                <span className="dropzone__plus">
                  <IconPlus size={24} strokeWidth={2.8} />
                </span>
                <span className="dropzone__hint">Add a photo</span>
              </span>
            )}
          </button>
        </div>

        <Button variant="primary" size="lg" block onClick={submit} disabled={picker.busy}>
          {picker.busy ? 'Working…' : 'Create album'}
        </Button>
      </div>
    </Screen>
  );
}

/* ------------------------------------------------------------------ */

function AlbumCreated({ albumId }: { albumId: string }) {
  const { data, toast } = useApp();
  const { replace } = useRouter();
  const [copied, copy] = useCopy();
  const album = data.albums[albumId];

  if (!album) return null;

  return (
    <Screen accent={album.accent}>
      <Confetti />
      <div className="celebrate">
        <div className="bigcheck">
          <IconCheck size={38} strokeWidth={3.4} />
        </div>
        <h1 className="celebrate__title">Album created!</h1>
        <p className="celebrate__sub">
          <strong>{album.name}</strong> is yours. Invite your people — everyone gets one photo a day.
        </p>

        <div className="ticket">
          <p className="ticket__label">Invite code</p>
          <p className="ticket__code">{album.inviteCode}</p>
          <div className="ticket__tear" aria-hidden="true" />
          <div className="ticket__actions">
            <Button
              variant="primary"
              block
              icon={copied ? <IconCheck size={17} strokeWidth={3} /> : <IconCopy size={17} />}
              onClick={async () => {
                const ok = await copy(album.inviteCode);
                toast(ok ? 'Code copied' : "Couldn't reach the clipboard", ok ? 'ok' : 'bad');
              }}
            >
              {copied ? 'Copied' : 'Copy code'}
            </Button>
            <Button
              variant="ghost"
              block
              icon={<IconShare size={17} />}
              onClick={() => void shareInvite(album, toast)}
            >
              Share invite
            </Button>
          </div>
        </div>

        <Button
          variant="ink"
          size="lg"
          block
          style={{ marginTop: 8 }}
          onClick={() => replace({ name: 'album', id: album.id })}
        >
          Go to album
        </Button>
      </div>
    </Screen>
  );
}
