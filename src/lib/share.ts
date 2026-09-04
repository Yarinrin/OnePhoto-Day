/** Sharing an invite: the Web Share sheet where it exists, clipboard where it doesn't. */

import type { Album } from './types';

type Notify = (message: string, tone?: 'ok' | 'bad' | 'plain') => void;

export function inviteText(album: Album): string {
  return `Join "${album.name}" on ONE PHOTO / DAY — one photo each, every day.\nInvite code: ${album.inviteCode}`;
}

export async function shareInvite(album: Album, notify: Notify): Promise<void> {
  const text = inviteText(album);

  if (navigator.share) {
    try {
      await navigator.share({ title: album.name, text });
      return;
    } catch (err) {
      // A user closing the share sheet isn't a failure worth announcing.
      if (err instanceof DOMException && err.name === 'AbortError') return;
    }
  }

  try {
    await navigator.clipboard.writeText(text);
    notify('Invite copied — paste it to your people', 'ok');
  } catch {
    notify(`Share this code: ${album.inviteCode}`, 'plain');
  }
}
