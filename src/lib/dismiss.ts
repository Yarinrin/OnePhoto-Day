/**
 * A stack of things that "go away" before a navigation does: open dialogs and
 * the lightbox.
 *
 * On the web this only powers Escape, and each overlay could have handled that
 * alone. Android's hardware Back button is why a shared stack exists: it is
 * one button for both dismissing and navigating, so something has to know
 * whether anything is open. Without it, Back from an open lightbox would leave
 * the album *behind* the lightbox — the overlay still on screen, the page under
 * it gone.
 *
 * Last opened is first dismissed, which is what both Escape and Back mean.
 */

import { useEffect } from 'react';

const stack: Array<() => void> = [];

/** Registers a dismisser; returns the function that unregisters it. */
export function pushDismiss(fn: () => void): () => void {
  stack.push(fn);
  return () => {
    const i = stack.lastIndexOf(fn);
    if (i >= 0) stack.splice(i, 1);
  };
}

/** Dismisses the topmost overlay. False when there was nothing to dismiss. */
export function dismissTop(): boolean {
  const fn = stack.pop();
  if (!fn) return false;
  fn();
  return true;
}

/**
 * Wires an overlay into both ways out of it: the Escape key, and the shared
 * stack that Android's Back button drains.
 */
export function useDismissible(open: boolean, onClose: () => void): void {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const unregister = pushDismiss(onClose);
    return () => {
      document.removeEventListener('keydown', onKey);
      unregister();
    };
  }, [open, onClose]);
}
