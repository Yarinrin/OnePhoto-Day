import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The native shell.
 *
 * The whole web app is bundled *inside* the APK — `webDir` is the Vite build —
 * so the phone app needs no web host at all. Demo mode therefore works with no
 * network whatsoever; only live mode talks to Supabase.
 *
 * `androidScheme: 'https'` makes the WebView serve the bundle from
 * `https://localhost`. That matters: on an `http://` origin Android treats
 * storage as insecure, and IndexedDB — where uploaded photos live — can be
 * evicted without warning.
 */
const config: CapacitorConfig = {
  appId: 'com.yarinrin.onephotoday',
  appName: 'One Photo',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
