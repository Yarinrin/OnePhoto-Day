/**
 * Choosing what a cover actually shows.
 *
 * Picking a cover used to be the whole interaction: whatever the middle of
 * your photo happened to be became the cover, and a portrait shot of a person
 * reliably produced a cover of their chest. This puts the frame under your
 * finger — drag to pan, pinch or use the slider to zoom — and bakes the result.
 *
 * It bakes rather than storing a focal point because a cover is displayed in
 * exactly one shape (the square-ish thumbnail on an album card), so there is
 * no second aspect ratio for a stored offset to serve. What you frame is
 * literally the file that gets saved.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from './ui';
import { useDismissible } from '../lib/dismiss';

/** Edge of the baked square, in pixels. */
const OUT = 900;

interface Placement {
  /** Multiplier on top of the scale that just covers the frame. */
  zoom: number;
  /** Top-left of the displayed image, relative to the frame, in frame px. */
  x: number;
  y: number;
}

export function CoverCropper({
  src,
  onCancel,
  onDone,
}: {
  src: string;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [frame, setFrame] = useState(0);
  const [place, setPlace] = useState<Placement>({ zoom: 1, x: 0, y: 0 });
  const [working, setWorking] = useState(false);

  useDismissible(true, onCancel);

  // The frame is square and sized by CSS, so its pixel size has to be measured
  // rather than assumed — it differs between a 320px phone and a desktop.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => setFrame(el.getBoundingClientRect().width);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** The scale at which the image exactly covers the frame. */
  const baseScale =
    natural && frame ? Math.max(frame / natural.w, frame / natural.h) : 1;

  /**
   * Keeps the image covering the frame. Panning past an edge would show cream
   * behind the photo and bake a transparent stripe into the cover.
   */
  const clamp = useCallback(
    (next: Placement): Placement => {
      if (!natural || !frame) return next;
      const zoom = Math.min(4, Math.max(1, next.zoom));
      const s = baseScale * zoom;
      const minX = frame - natural.w * s;
      const minY = frame - natural.h * s;
      return {
        zoom,
        x: Math.min(0, Math.max(minX, next.x)),
        y: Math.min(0, Math.max(minY, next.y)),
      };
    },
    [natural, frame, baseScale],
  );

  const onLoad = useCallback(() => {
    const img = imgRef.current;
    if (img) setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  /*
   * Centring needs both the image's size and the frame's, and they do not
   * arrive together — a cached image can finish loading before the frame has
   * ever been measured. Doing it in the load handler meant dividing by a frame
   * width of zero and pinning the photo to its top-left corner.
   *
   * Only the first pairing centres. Later frame changes — a rotation, a
   * keyboard opening — re-clamp instead, which keeps the photo covering the
   * frame without throwing away the framing the user just chose.
   */
  const centred = useRef(false);
  useEffect(() => {
    if (!natural || !frame) return;
    if (centred.current) {
      setPlace((p) => clamp(p));
      return;
    }
    centred.current = true;
    const s = Math.max(frame / natural.w, frame / natural.h);
    setPlace({
      zoom: 1,
      x: (frame - natural.w * s) / 2,
      y: (frame - natural.h * s) / 2,
    });
  }, [natural, frame, clamp]);

  /* ---- Dragging, and pinching ---- */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ place: Placement; spread: number; cx: number; cy: number } | null>(
    null,
  );

  const spreadOf = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return 0;
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const centreOf = () => {
    const pts = [...pointers.current.values()];
    const n = pts.length || 1;
    return {
      x: pts.reduce((t, p) => t + p.x, 0) / n,
      y: pts.reduce((t, p) => t + p.y, 0) / n,
    };
  };

  const start = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const c = centreOf();
    gesture.current = { place, spread: spreadOf(), cx: c.x, cy: c.y };
  };

  const move = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    const c = centreOf();
    let next: Placement = {
      zoom: g.place.zoom,
      x: g.place.x + (c.x - g.cx),
      y: g.place.y + (c.y - g.cy),
    };

    // Two fingers also zoom, about the point between them, so the pixel you
    // are pinching stays under your fingers.
    if (pointers.current.size > 1 && g.spread > 0) {
      const zoom = g.place.zoom * (spreadOf() / g.spread);
      const rect = frameRef.current?.getBoundingClientRect();
      if (rect) {
        const fx = g.cx - rect.left;
        const fy = g.cy - rect.top;
        const ratio = zoom / g.place.zoom;
        next = {
          zoom,
          x: next.x + (g.place.x - fx) * (ratio - 1),
          y: next.y + (g.place.y - fy) * (ratio - 1),
        };
      }
    }
    setPlace(clamp(next));
  };

  const end = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const c = centreOf();
    gesture.current = pointers.current.size
      ? { place, spread: spreadOf(), cx: c.x, cy: c.y }
      : null;
  };

  /** Zoom from the slider keeps the centre of the frame put. */
  const setZoom = (zoom: number) => {
    const ratio = zoom / place.zoom;
    const mid = frame / 2;
    setPlace(
      clamp({
        zoom,
        x: place.x + (place.x - mid) * (ratio - 1),
        y: place.y + (place.y - mid) * (ratio - 1),
      }),
    );
  };

  /* ---- Baking ---- */

  const bake = () => {
    const img = imgRef.current;
    if (!img || !natural || !frame) return;
    setWorking(true);
    try {
      const s = baseScale * place.zoom;
      const canvas = document.createElement('canvas');
      canvas.width = OUT;
      canvas.height = OUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Your browser blocked image processing.');
      // The frame, expressed back in the source image's own pixels.
      ctx.drawImage(img, -place.x / s, -place.y / s, frame / s, frame / s, 0, 0, OUT, OUT);
      onDone(canvas.toDataURL('image/jpeg', 0.86));
    } catch {
      setWorking(false);
    }
  };

  return (
    <div className="cropper" role="dialog" aria-modal="true" aria-label="Position the cover">
      <div className="cropper__sheet">
        <h2 className="cropper__title">Frame it</h2>
        <p className="cropper__hint">Drag to move · pinch or slide to zoom</p>

        <div
          className="cropper__frame"
          ref={frameRef}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
        >
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            onLoad={onLoad}
            style={
              natural
                ? {
                    width: natural.w * baseScale * place.zoom,
                    height: natural.h * baseScale * place.zoom,
                    transform: `translate(${place.x}px, ${place.y}px)`,
                  }
                : { opacity: 0 }
            }
          />
        </div>

        <input
          className="cropper__zoom"
          type="range"
          min={1}
          max={4}
          step={0.01}
          value={place.zoom}
          onChange={(e) => setZoom(Number(e.currentTarget.value))}
          aria-label="Zoom"
        />

        <div className="cropper__actions">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={bake} disabled={!natural || working}>
            Use this
          </Button>
        </div>
      </div>
    </div>
  );
}
