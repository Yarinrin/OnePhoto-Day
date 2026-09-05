/**
 * A single photo, full bleed, mounted on card like a print pulled out of the
 * album. Escape, Back or the scrim closes it; the caption and byline travel
 * with it.
 */

import { IconX } from './Icons';
import { useImageSrc } from './PhotoImage';
import { Avatar, IconButton } from './ui';
import { useDismissible } from '../lib/dismiss';
import type { Photo } from '../lib/types';
import { formatDayLong, formatTime } from '../lib/util';
import { useApp } from '../state/AppContext';

export function Lightbox({
  photo,
  albumId,
  onClose,
}: {
  photo: Photo | null;
  albumId: string;
  onClose: () => void;
}) {
  const { data } = useApp();
  const src = useImageSrc(photo?.image);

  useDismissible(Boolean(photo), onClose);

  if (!photo) return null;

  const author = data.people[photo.authorId];
  const isMine = photo.authorId === data.currentUserId;
  const album = data.albums[albumId];

  return (
    <div
      className="lightbox"
      data-accent={album?.accent}
      role="dialog"
      aria-modal="true"
      aria-label={`${author?.name ?? 'A member'}'s photo`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="lightbox__card">
        <div className="lightbox__shot">
          {src ? (
            <img src={src} alt={`${author?.name ?? 'A member'}'s photo from ${formatDayLong(photo.day)}`} />
          ) : (
            <div className="frame__skeleton" style={{ aspectRatio: '3 / 4' }} />
          )}
        </div>
        {photo.caption && <p className="lightbox__caption">“{photo.caption}”</p>}
        <div className="lightbox__foot">
          {author && <Avatar person={author} size={34} />}
          <span className="grow">
            <span className="mounted__who" style={{ display: 'block' }}>
              {isMine ? 'You' : (author?.name ?? 'Someone')}
            </span>
            <span className="mounted__when">
              {formatDayLong(photo.day)} · {formatTime(photo.postedAt)}
            </span>
          </span>
        </div>
      </div>

      <IconButton label="Close photo" className="lightbox__close" onClick={onClose}>
        <IconX size={20} strokeWidth={3} />
      </IconButton>
    </div>
  );
}
