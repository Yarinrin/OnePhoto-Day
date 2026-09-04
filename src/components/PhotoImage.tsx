/**
 * Resolves an ImageRef to something an <img> can use.
 * Generated scenes render synchronously; stored uploads come back from
 * IndexedDB, so those get a brief shimmer instead of a flash of empty frame.
 */

import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';

import { renderScene } from '../lib/scenes';
import { imageStore } from '../lib/store';
import type { ImageRef } from '../lib/types';

export function useImageSrc(ref: ImageRef | undefined | null): string | null {
  // Generated scenes are pure and cached, so they resolve during render.
  const generated = ref?.kind === 'generated' ? renderScene(ref.scene, ref.seed) : null;
  const storedId = ref?.kind === 'stored' ? ref.id : null;

  // Stored alongside its id, so a stale result for a previous image can never
  // be shown while the new one loads — and the effect never sets state
  // synchronously just to clear it.
  const [loaded, setLoaded] = useState<{ id: string; src: string | null } | null>(null);

  useEffect(() => {
    if (!storedId) return;
    let alive = true;
    imageStore.get(storedId).then((src) => {
      if (alive) setLoaded({ id: storedId, src });
    });
    return () => {
      alive = false;
    };
  }, [storedId]);

  if (generated) return generated;
  if (!storedId) return null;
  return loaded?.id === storedId ? loaded.src : null;
}

export function PhotoImage({
  image,
  alt,
  className = '',
  style,
  ratio,
  overlay,
}: {
  image: ImageRef | undefined | null;
  alt: string;
  className?: string;
  style?: CSSProperties;
  /** aspect-ratio for the frame, e.g. "3 / 4". */
  ratio?: string;
  overlay?: ReactNode;
}) {
  const src = useImageSrc(image);
  return (
    <div
      className={`frame ${className}`}
      style={{ ...(ratio ? { aspectRatio: ratio } : null), ...style }}
    >
      {src ? <img src={src} alt={alt} loading="lazy" decoding="async" /> : <div className="frame__skeleton" />}
      {overlay}
    </div>
  );
}
