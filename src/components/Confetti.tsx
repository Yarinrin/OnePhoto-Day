/**
 * A short burst of paper scraps. Fourteen pieces, 1.4s, then gone —
 * enough to mark the moment without turning it into a parade.
 */

import { useMemo } from 'react';

const COLORS = ['var(--yellow)', 'var(--pink)', 'var(--blue)', 'var(--green)', 'var(--lavender)'];

export function Confetti({ count = 14 }: { count?: number }) {
  const prefersReduced =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: `${6 + (i * 88) / count + (i % 3) * 3}%`,
        delay: `${(i % 5) * 70}ms`,
        background: COLORS[i % COLORS.length],
        transform: `rotate(${(i * 37) % 90}deg)`,
      })),
    [count],
  );

  if (prefersReduced) return null;

  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          style={{
            left: p.left,
            animationDelay: p.delay,
            background: p.background,
            transform: p.transform,
          }}
        />
      ))}
    </div>
  );
}
