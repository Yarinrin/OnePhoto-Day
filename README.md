# ONE PHOTO / DAY

**One person. One album. One photo per day.**

A private daily photo album for a group of friends. Not social media: no feed,
no likes, no follower counts, no ranking. Everyone in an album gets exactly one
frame per day, and what builds up over time is a visual diary of a group of
people rather than a performance.

```
YARIN
├── The Boys        6 members
├── Summer 2026     4 members
├── Family          5 members
└── Italy Trip      4 members
```

## Running it

```bash
npm install
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm run build        # typecheck + production build
npm run lint         # oxlint
npm run smoke        # end-to-end checks (needs `npm run dev` running)
npm run icons        # redraw every app icon from one source
npm run android      # build the web app into the native project
```

`npm run smoke` runs two suites. `scripts/navcheck.mjs` is the smaller one:
it presses every button on the bottom navigation and walks the email sign-in
screen. It exists because the nav bar was once completely dead on a phone
while looking perfect in a browser, and nothing in the suite had ever actually
pressed it.

The main smoke test drives a real browser through onboarding, album creation,
joining by code, uploading, the one-per-day limit, persistence across reload,
every screen, desktop and 320px layouts, reduced-motion, image cleanup, a
broken image store, and the midnight rollover. Add `--shots=<dir>` to capture
a screenshot of each screen it visits.

## Design

Retro editorial: cream paper, black ink, thick outlines, hard offset shadows,
chunky corners, a controlled pastel palette where each album owns an accent.
Archivo Black for display, Space Grotesk for body, Space Mono for codes and
labels — all self-hosted, no font CDN at runtime.

Photography leads. UI chrome frames the pictures rather than competing with
them: photos sit in bordered "pockets", and the byline is a small pill rather
than a caption bar.

**Motion** follows a Playful personality — one signature curve
(`cubic-bezier(0.175, 0.885, 0.32, 1.275)`) for most interactions, directional
curves for entrance and exit, three durations (140/260/420ms). Presses travel
into their own shadow; stagger budgets stay under 400ms; every animation is
disabled under `prefers-reduced-motion`.

## Architecture

```
src/
  lib/        types, storage adapters, scene generator, dates, sharing, demo world
  state/      reducer (all the rules), selectors, app context, router
  components/ primitives (Button, Avatar, CodeInput, Modal, …), icons, shell
  screens/    one file per screen
  styles/     tokens + one stylesheet per area
  hooks/      image picker
```

**Rules live in the reducer, not the screens.** `postPhoto` checks membership
and the one-photo-per-person-per-album-per-day limit itself, so no UI path — a
stale tab, a back button, a hand-typed URL — can slip a second frame through.
The smoke test asserts this against the reducer directly.

**Persistence** is split behind two small interfaces in `lib/store.ts`:
`dataStore` (the JSON world, in `localStorage`) and `imageStore` (uploads, in
IndexedDB). Both are async and side-effect free from the app's point of view,
so swapping either for `fetch` calls against a real backend touches nothing
else. Uploaded photos are downscaled to 1400px JPEG on the way in, so a few
hundred of them fit comfortably.

A failed image write is never swallowed: `imageStore.put` throws
`ImageWriteError` when the device is out of room and resolves to `false` when
the image is only held for the session, and every call site surfaces that. In a
memory-keeping app, a photo that looks saved and isn't is the worst possible
failure.

**Unreferenced images are collected on load.** Deleting an album, leaving one,
replacing a cover or avatar, or abandoning a pick mid-upload all leave image
files behind. `collectOrphanedImages` diffs the store against
`referencedImageIds(data)` and deletes the difference. It runs only at startup,
which is the one moment nothing is mid-flow — a picked-but-unposted image is
written before its record exists and would otherwise look like an orphan.

**The day rolls over.** `today` lives in the app context, updated by a timer to
the next local midnight and re-checked whenever the tab regains focus, so a
session left open overnight moves on instead of freezing on yesterday. Views
that memoise today's state depend on it.

**Routing** is a ~100-line router over the History API. It exists rather than a
dependency because page transitions need the *direction* of each navigation,
which off-the-shelf routers don't expose.

### The photographs

This environment has no reachable image host, and grey placeholder boxes would
gut a product whose whole point is the pictures. So the demo photos are drawn:
`lib/scenes.ts` renders ten seeded scenes (sunsets, city streets, a stage, a
café table, a shoreline…) to SVG data URIs, each finished with the same grain,
halation and vignette so the whole library shares one film stock. They're
deterministic in their seed, so an album looks identical across reloads and
costs nothing to store — `ImageRef` is either `{kind:'generated', scene, seed}`
or `{kind:'stored', id}`, and only real uploads touch the image store.

Scenes rotate by member and by day rather than being drawn at random: a random
draw clusters, and a day's page full of near-identical frames is the one thing
that makes generated photos look generated.

### Demo data

The world is built on first launch, right after you enter your name, so the app
opens with real history instead of an empty shell. Four albums you're in, with
up to 168 days of backlog, plus two you aren't — `BAND-77` and `FLAT-24` — so
the invite-code flow has something real to find. It's ordinary app data and can
be edited or deleted like anything else; **Profile → Start over** clears it.

## Covers

A cover is framed, not merely picked. Choosing an image opens a square window
you drag to pan and pinch — or slide — to zoom, with a thirds grid over it; the
framed region is what gets baked and saved.

It bakes rather than storing a focal point because a cover is displayed in
exactly one shape, the thumbnail on an album card, so there is no second aspect
ratio for a stored offset to serve. The alternative was what shipped first:
whatever happened to be in the middle became the cover, which turned every
portrait of a person into a photograph of their chest.

The framing maths is small but easy to get subtly wrong, so the smoke suite
pins it down with a source image in three flat colours: an untouched frame must
land on the middle third, dragging must move which third is kept, and no zoom
level may ever pull the photo off an edge — that would bake a blank stripe into
the cover. The first run of those checks caught a real bug: a cached image can
finish loading before the frame has been measured, so centring ran against a
width of zero and pinned every cover to its top-left corner.

## Streaks

A streak is days in a row that you posted. Two numbers are tracked, per album
and overall: the **current** run and your **best** ever. Posting to any album
keeps the overall day alive — the habit is showing up, not which album you
showed up in.

A run that hasn't been extended *yet today* is still alive; you have until
midnight. Only a fully missed day breaks it. The maths lives in
`state/selectors.ts` (`personAlbumStreak`, `personStreak`) and is covered by
seven cases in the smoke suite, including the grace day, a gap breaking a run,
and "best" being the longest run rather than the most recent.

Profile shows your overall streak plus a table of every album you're in — how
many people are in it, your current streak and your best.

## Database

`supabase/schema.sql` is the backend schema: four tables (`profiles`,
`albums`, `album_members`, `photos`) plus row-level security, an
invite-code join function, a trigger that creates a profile on first sign-in,
and a private storage bucket for the photo files.

Two views answer "who's using this and how are they doing", browsable directly
in Supabase's Table Editor:

- **`user_stats`** — every signed-in user, how many albums they're in, their
  current streak, best streak, photo count and last post.
- **`album_stats`** — every album, how many people are in it, *which* people,
  the owner, photo count and days kept.

Streaks aren't stored, they're derived from the photos, so they can't drift out
of sync. The SQL uses the "gaps and islands" trick: number each person's
posting days in order and subtract that number from the date — every day in an
unbroken run lands on the same value, so grouping by it yields each run and its
length.

The daily rule becomes a constraint the database enforces itself:

```sql
constraint one_photo_per_day unique (album_id, author_id, day)
```

The whole file was verified end-to-end against a real Postgres 16 with
Supabase-shaped stubs: schema applies clean, both views return correct streaks
across gaps, the constraint rejects a second photo, and the join function
accepts a code regardless of dashes or case.

**This schema is live** — applied to the real Supabase project via the MCP
connection, not just checked locally. Supabase's own security advisor flagged
that `is_member`, `shares_album_with` and `join_album_by_code` were directly
callable over the public API by anyone, signed in or not (it auto-exposes
every `public`-schema function this way). None of them leaked real data to an
anonymous caller — each keys off `auth.uid()`, which is null when nobody's
signed in — but they're now restricted anyway: locked out for anonymous
callers entirely, and `handle_new_user` (which only the sign-up trigger should
ever invoke) is unreachable directly by anyone. Every grant change was proven
with a rollback-wrapped insert into `auth.users` — simulating a real Google
sign-in — confirming the trigger still creates a profile row under the
tightened permissions before any of it was applied for real.

## Two modes

The app opens on a front door with two ways in.

**Demo** — everything in this browser: `localStorage` plus IndexedDB, seeded
with a fake world of four albums and months of history. No account, nothing
shared, nothing leaves the device. This is what the smoke suite exercises,
since a headless browser can't complete Google's consent screen.

**Live** — a real account, a shared Postgres database, photos in a private
storage bucket. Albums sync between phones; the invite code becomes the only
way into someone else's album.

There are two ways to hold that account, and **email and password is the one
the front door offers first**. It is a single request from inside the WebView:
no browser hand-off, no deep link back, no SMS provider to pay for. Google
sign-in is the alternative, and it is the one with somewhere to go wrong —
Google refuses consent inside an embedded WebView, so it has to leave for a
Chrome tab and be handed back through a custom-scheme deep link.

**Sign-up needs no dashboard setting.** With Supabase's default "Confirm
email" on, a new account has no session until a link arrives — over a built-in
mailer rate-limited to a handful of messages an hour that routinely delivers
none at all. Waiting on that is how sign-up came to sit forever on "check your
email". A `before insert` trigger on `auth.users` stamps every new account as
confirmed, so the account is usable the moment it exists, and the app signs
straight in after creating one instead of sending anyone to an inbox. The
address is never mailed and never has to be real.

Both halves are proven against the live project: inserting a user exactly the
way GoTrue does, inside a transaction that then rolls back, comes out with
`email_confirmed_at` set and a matching profile row.

Signing up with an address that already has an account is its own trap:
Supabase deliberately will not admit the address is taken — that would let
anyone probe which emails have accounts — so it returns a success with no
identities attached and sends nothing at all. Left unhandled that reads as
"check your email for a link that never arrives", which is exactly what it
looked like. The app now recognises the empty-identities response and says the
account already exists.

`lib/backend.ts` holds both behind one interface. Screens never touch either —
they call `commands` on the app context, which forwards to whichever backend
is active. That's what let live mode land without rewriting a single screen.

The reducer still owns the in-memory world in both modes. In demo mode it also
*is* the source of truth; in live mode it's a local mirror that each command
refreshes from the server after writing.

### Verifying live mode

`scripts/live-check.mjs` drives the whole live path in a real browser: sign in,
create an album, upload a photo to the bucket, read it back through a signed
URL, hit the daily limit, reload. It signs in with email/password purely to
obtain a session — the app itself uses Google, and every path after the token
is identical, so this exercises the same code.

**It has never been run against a live project.** The cloud container this was
built in blocks `*.supabase.co` at the network policy, so neither Node nor the
browser inside it can reach Supabase; only the database tooling could, by a
different route. Run it from a machine with normal network access, and treat
live mode as unproven until it goes green.

## The Android app

The phone app is the web app, bundled *inside* the APK — `android/` is a
Capacitor shell whose WebView loads `dist/` from the package rather than
fetching it from a server. That's the whole reason this route was taken over
wrapping a hosted site: there is no site to host, no domain to buy, no
`assetlinks.json` to publish, and demo mode works on a plane.

**Get an APK.** Every push builds one, and the result is published to the
[latest release](https://github.com/Yarinrin/OnePhoto-Day/releases/latest) as
`one-photo-day.apk` — a plain link you can open on a phone. Tag a commit `v1.0`
and that build gets a release of its own instead of overwriting the rolling one.

It builds on GitHub because the Android SDK and the Android Gradle Plugin come
from `dl.google.com`, which the sandbox this was developed in blocks outright.

Installing it means allowing "install unknown apps" for whatever opens the file
— that is what sideloading is, and it is the only way to install an Android app
without a Play Store listing.

**Signing.** `android/sideload.keystore` is committed and its password is in the
`build.gradle` next to it. That is deliberate: it makes every build sign
identically, so a new APK installs over the old one instead of Android treating
it as a different app and demanding an uninstall — which would take the photos
with it. It is not a Play Store key and must not become one.

**What the shell adds** beyond hosting the pages:

- **The flow type.** `supabase-js` defaults to `flowType: 'implicit'`, which
  returns the session in the URL *fragment* (`#access_token=…`). A fragment
  survives a browser redirect but is invisible to a deep-link handler reading
  query parameters — so sign-in completed at Google, completed at Supabase,
  created the account, came back to the app, and did nothing whatsoever,
  because nothing was looking where the session actually was. The client now
  asks for `pkce` explicitly, which returns `?code=` and is the right flow for
  a public client anyway. `parseAuthRedirect` reads both halves regardless.
- **Sign-in**, which can't work the web way. Google refuses to render its
  consent screen inside an embedded WebView, so the app hands the URL to a real
  Chrome tab and gets the result back as a deep link on
  `com.yarinrin.onephotoday://auth` — declared as an intent filter in the
  manifest, exchanged for a session in `AppContext`. Google Cloud Console needs
  no change for this: Google's client is still Supabase, and Supabase is still
  the one redirecting. **Supabase does** — that URL has to be added under
  Authentication → URL Configuration → Redirect URLs, or Supabase refuses to
  redirect to it and sign-in stops at a blank tab. Demo mode doesn't care.
- **The Back button**, which is one hardware key doing three jobs: close the
  open lightbox or dialog, else go back a screen, else leave the app. The
  overlay half needed a shared dismissal stack (`lib/dismiss.ts`) — without it
  Back from an open lightbox navigates the page out from underneath it.
- **Resume**, because a backgrounded Android app never fires `focus`; live mode
  would come back showing whatever it had before the phone was pocketed.
- **Window insets**, which is why the bottom navigation was dead on a real
  phone while working perfectly in a browser. Android 15 lays every app out
  edge to edge whether it asks to or not, and Android's WebView never
  populates `env(safe-area-inset-*)` — they read as zero. So the nav bar was
  drawn a few pixels from the bottom of the display, underneath the gesture
  bar, where the system takes the touches before the app can. `MainActivity`
  now reads the insets where they are actually known and pads the content view
  with them. The window background is the app's cream, so the strips behind
  the system bars still look like part of the app.
- **The share sheet.** `navigator.share` does not exist in an Android WebView,
  so the invite button fell through to "copied to clipboard" — a share, but not
  the one anyone wants when the point is to send it to a friend in WhatsApp.
  Native builds now open Android's own share sheet.

**What a tappable invite link would need.** Sharing sends the album name and
its code, not a URL, because there is nowhere for a URL to point: the app is
bundled in the APK and has no website. A link that opens the app for people who
have it, and a download page for people who don't, needs the site hosted
somewhere with a real domain — the deployment step this build deliberately
avoided.

Icons and the launch screen come from `npm run icons`, which renders one drawing
— the camera mark — to every size the browser, the manifest, and five Android
density buckets ask for. It exists because the web icons and the phone icons
were briefly two drawings of the same thing that had drifted apart.

## Telling what happened on the phone

Everything downstream of the compiler was, for a long time, unverifiable:
`dl.google.com` is blocked here so the APK could only be built by CI, and
`*.supabase.co` is blocked by egress policy so nothing here can reach the
backend over HTTP either. That left every Android failure to be diagnosed by
reading code rather than by watching it run — and the diagnoses were wrong
repeatedly. A dead nav bar had a cause invisible to a browser; sign-in failed
silently because the session came back in a URL fragment nothing was reading.

So the app now records its own trace: boot (whether it believes it is native,
whether an account is configured, what the mode was), each sign-in step, each
deep link, and the outcome of every exchange. It goes two places — a
write-only `debug_events` table, readable only over SQL, and `localStorage`,
shown by a **Diagnostics** link on the front door so it works with no
connection at all.

Nothing secret is ever recorded. One-time codes and access tokens are reduced
to `present(<length>)` before they are written, and the suite asserts that no
token-shaped string can reach the trail.

## Known limits

**The APK builds, but has never been run.** CI compiles and signs it — a 3.3 MB
package, green on the first attempt — and `dl.google.com` is blocked here, so
that build is also the only one that has ever happened: nothing in this
repository has been installed on a phone. Everything downstream of the compiler
is therefore unproven, in particular the deep-link sign-in round trip and how
the layout sits against a real status bar.

**Live mode is untested end to end.** The database half is thoroughly verified —
schema, security rules, the daily-limit constraint, and the privacy model, all
checked against the real project with multiple users acting under their own
identities. The client half — the sign-in round trip, uploading to the bucket,
signed URLs — compiles and reads correctly but has never actually run against
the live project, for the network reason above.

Photos load in one page of up to 2000 rows — fine for a friend group, not for
years of a large album. Real pagination is the obvious next step.

The notification toggles store a real preference but send nothing; delivery
needs a scheduled job and push credentials. The Profile screen says so rather
than implying otherwise.

Live mode has no offline queue: post something with no connection and it fails
rather than sending later.

## Accessibility

Real `<button>`s and labelled inputs throughout, `aria-current` on the active
tab, `role="switch"` toggles, live-region toasts, `alt` text naming who took
each photo and when, Escape-to-close on dialogs and the lightbox, and visible
focus rings. The browser Back button works everywhere, including out of the
lightbox's parent screens.
