/**
 * The thin seam between the browser build and the Android build.
 *
 * Everything here is a no-op on the web. `isNative` is the only thing the rest
 * of the app branches on, and it is resolved once at module load, so a web
 * build never pays for the native paths.
 *
 * Why sign-in needs a native path at all: Google refuses OAuth inside an
 * embedded WebView, so the consent screen has to open in the real browser
 * (a Chrome Custom Tab). That means the session comes back *out of band* —
 * as a deep link into the app — rather than as a page navigation the way it
 * does on the web.
 */

import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

/** True inside the Android app, false in any browser. */
export const isNative = Capacitor.isNativePlatform();

/**
 * Where Google sends the user back to. Registered as an intent filter in
 * `android/app/src/main/AndroidManifest.xml`, and it must also be listed in
 * Supabase → Authentication → URL Configuration → Redirect URLs, or Supabase
 * refuses to redirect to it.
 */
export const NATIVE_REDIRECT = 'com.yarinrin.onephotoday://auth';

/** Opens a URL in the system browser — a Custom Tab, not a WebView. */
export async function openExternal(url: string): Promise<void> {
  await Browser.open({ url });
}

/** Dismisses the Custom Tab once we're done with it. */
export async function closeExternal(): Promise<void> {
  try {
    await Browser.close();
  } catch {
    // Already gone — the user may have dismissed it by hand.
  }
}

/**
 * Calls back with every deep link the app is opened by. Returns an unsubscribe.
 * Resolves to a no-op on the web.
 */
export function onDeepLink(handler: (url: string) => void): () => void {
  if (!isNative) return () => {};
  const listener = App.addListener('appUrlOpen', ({ url }) => handler(url));
  return () => {
    void listener.then((l) => l.remove());
  };
}

/**
 * Calls back when the app returns to the foreground. Live mode uses this to
 * pull in other people's photos; on the web the equivalent is a focus event.
 */
export function onResume(handler: () => void): () => void {
  if (!isNative) return () => {};
  const listener = App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) handler();
  });
  return () => {
    void listener.then((l) => l.remove());
  };
}

/**
 * Hands the hardware Back button to a handler. Android's back button is a
 * system gesture, not a browser control: without this it closes the app from
 * any screen, which in a five-deep navigation stack feels broken.
 */
export function onHardwareBack(handler: () => void): () => void {
  if (!isNative) return () => {};
  const listener = App.addListener('backButton', () => handler());
  return () => {
    void listener.then((l) => l.remove());
  };
}

/** Closes the app. Only called when back is pressed with nowhere left to go. */
export async function exitApp(): Promise<void> {
  if (!isNative) return;
  await App.exitApp();
}
