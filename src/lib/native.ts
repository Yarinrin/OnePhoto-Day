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

/* ---- Deep links ------------------------------------------------------ */

/*
 * Deep links are captured from the moment this module loads, not from the
 * moment React is ready for them, because sign-in has two ways to lose one:
 *
 *  - Android often destroys the activity while the Chrome tab is in front. The
 *    link then arrives as a *cold start*, and the bridge fires `appUrlOpen`
 *    while the app is still booting — before any component has mounted.
 *    `getLaunchUrl()` is how you recover the intent that started the app.
 *  - `addListener` is asynchronous: it returns a promise for the handle, so
 *    even a warm resume has a window where the native side has no listener.
 *
 * Either way the URL carries the one-time code that completes sign-in. Miss it
 * and the app sits on the login screen having apparently done nothing — so
 * anything that arrives before a handler exists waits in `pending` instead.
 */

const pending: string[] = [];
const seen = new Set<string>();
let sink: ((url: string) => void) | null = null;

function deliver(url: string): void {
  // The launch intent and the live listener can both report the same URL on a
  // cold start. Handling it twice would spend the code, then fail on the
  // replay and show the user an error for something that worked.
  if (seen.has(url)) return;
  seen.add(url);
  if (sink) sink(url);
  else pending.push(url);
}

if (isNative) {
  void App.addListener('appUrlOpen', ({ url }) => deliver(url));
  void App.getLaunchUrl()
    .then((result) => {
      if (result?.url) deliver(result.url);
    })
    .catch(() => {});
}

export interface AuthRedirect {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
}

/**
 * Pulls the result of a sign-in out of the URL the app was opened with.
 *
 * Both halves of the URL have to be read. PKCE puts its one-time code in the
 * query (`?code=`), the implicit flow puts the tokens in the fragment
 * (`#access_token=`), and an error can arrive in either. Reading only the
 * query is what made sign-in fail with no symptom at all: the session came
 * back in the fragment, nothing was looking there, and the app sat on the
 * login screen having apparently done nothing.
 *
 * Returns an empty object for any link that isn't a sign-in result.
 */
export function parseAuthRedirect(url: string): AuthRedirect {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {};
  }
  const query = parsed.searchParams;
  const fragment = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const param = (key: string) => query.get(key) ?? fragment.get(key) ?? undefined;

  const error = param('error_description') ?? param('error');
  if (error) return { error };

  const code = param('code');
  const accessToken = param('access_token');
  if (!code && !accessToken) return {};

  return { code, accessToken, refreshToken: param('refresh_token') };
}

/**
 * Registers the handler for deep links, replaying any that arrived before it
 * existed. Returns an unsubscribe. A no-op on the web.
 */
export function onDeepLink(handler: (url: string) => void): () => void {
  if (!isNative) return () => {};
  sink = handler;
  for (const url of pending.splice(0)) handler(url);
  return () => {
    if (sink === handler) sink = null;
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
