/**
 * Resolves an ImageRef to something an <img> can use.
 *
 * Generated scenes render synchronously. Everything else — a local upload in
 * demo mode, a signed bucket URL in live mode — comes back asynchronously
 * through the active backend, so those get a brief shimmer instead of a flash
 * of empty frame.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { renderScene } from '../lib/scenes';
import type { ImageRef, ImageSize } from '../lib/types';
import { useApp } from '../state/AppContext';

/**
 * `size` defaults to the small copy because almost everywhere an image appears
 * — grid tiles, album cards, avatars — is small, and a full-size fetch there
 * costs many times the bytes for pixels the screen cannot show. The lightbox
 * is the one place that asks for 'full', and it asks explicitly.
 */
export function useImageSrc(
  ref: ImageRef | undefined | null,
  size: ImageSize = 'thumb',
): string | null {
  const { backend } = useApp();

  // Generated scenes are pure and cached, so they resolve during render.
  const generated = ref?.kind === 'generated' ? renderScene(ref.scene, ref.seed) : null;
  // The size is part of the identity: asking for the small copy and then the
  // full one must be two resolutions, not one answer reused.
  const asyncKey =
    ref?.kind === 'stored'
      ? `stored:${size}:${ref.id}`
      : ref?.kind === 'remote'
        ? `remote:${size}:${ref.path}`
        : null;

  // Stored alongside its key, so a stale result for a previous image can never
  // be shown while the new one loads — and the effect never sets state
  // synchronously just to clear it.
  const [loaded, setLoaded] = useState<{ key: string; src: string | null } | null>(null);

  useEffect(() => {
    if (!asyncKey || !ref || !backend) return;
    let alive = true;
    backend
      .resolveImage(ref, size)
      .then((src) => {
        if (alive) setLoaded({ key: asyncKey, src });
      })
      .catch(() => {
        if (alive) setLoaded({ key: asyncKey, src: null });
      });
    return () => {
      alive = false;
    };
    // `ref` is a value object; asyncKey is its identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asyncKey, backend]);

  if (generated) return generated;
  if (!asyncKey) return null;
  return loaded?.key === asyncKey ? loaded.src : null;
}

export function PhotoImage({
  image,
  alt,
  className = '',
  style,
  ratio,
  overlay,
  size = 'thumb',
}: {
  image: ImageRef | undefined | null;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** aspect-ratio for the frame, e.g. "3 / 4". */
  ratio?: string;
  overlay?: ReactNode;
  /**
   * Which copy to fetch. Everything built from this component is a tile in a
   * grid or a card, so the small one is the default and the full size is
   * asked for explicitly — by the lightbox, and nowhere else.
   */
  size?: ImageSize;
}) {
  const src = useImageSrc(image, size);
  return (
    <div
      className={`frame ${className}`}
      style={{ ...(ratio ? { aspectRatio: ratio } : null), ...style }}
    >
      {src ? (
        <img src={src} alt={alt} loading="lazy" decoding="async" />
      ) : (
        <div className="frame__skeleton" />
      )}
      {overlay}
    </div>
  );
}
