/**
 * One file input, reused for uploads, covers and avatars.
 *
 * `capture` asks a phone for the camera directly; on desktop the browser
 * falls back to the normal file dialog, so one control covers both.
 */

import { useCallback, useRef, useState } from 'react';

import { fileToDataUrl } from '../lib/util';

export function useImagePicker(
  onPicked: (dataUrl: string) => void | Promise<void>,
  onError?: (message: string) => void,
) {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handle = useCallback(
    async (input: HTMLInputElement) => {
      const file = input.files?.[0];
      input.value = ''; // let the same file be picked twice in a row
      if (!file) return;
      setBusy(true);
      try {
        // Awaited, so a failure inside the handler — a full disk, say —
        // reaches onError instead of escaping as an unhandled rejection.
        await onPicked(await fileToDataUrl(file));
      } catch (err) {
        onError?.(err instanceof Error ? err.message : "That image wouldn't load.");
      } finally {
        setBusy(false);
      }
    },
    [onPicked, onError],
  );

  const inputs = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void handle(e.currentTarget)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => void handle(e.currentTarget)}
      />
    </>
  );

  return {
    inputs,
    busy,
    chooseFile: () => fileRef.current?.click(),
    takePhoto: () => cameraRef.current?.click(),
  };
}
