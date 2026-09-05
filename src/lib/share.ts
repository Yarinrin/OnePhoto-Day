/**
 * Sharing an invite.
 *
 * Three routes, best first: Android's own share sheet, the browser's Web Share
 * sheet, then the clipboard. The middle one is why the app needs the first:
 * `navigator.share` does not exist in an Android WebView, so on a phone this
 * used to fall straight through to "copied to clipboard" — technically a
 * share, but not the one anybody wants when the point is to send it to someone
 * in WhatsApp.
 */

import { Share } from '@capacitor/share';

import { isNative } from './native';
import type { Album } from './types';

type Notify = (message: string, tone?: 'ok' | 'bad' | 'plain') => void;

export function inviteText(album: Album): string {
  return `Join "${album.name}" on ONE PHOTO / DAY — one photo each, every day.\nInvite code: ${album.inviteCode}`;
}

export async function shareInvite(album: Album, notify: Notify): Promise<void> {
  const text = inviteText(album);

  if (isNative) {
    try {
      await Share.share({
        title: album.name,
        text,
        dialogTitle: `Invite someone to ${album.name}`,
      });
    } catch {
      // Dismissing the sheet rejects. That is a decision, not a failure.
    }
    return;
  }

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
