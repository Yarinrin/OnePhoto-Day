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
```

The smoke test drives a real browser through onboarding, album creation,
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

## Known limits

This is a single-device prototype. There is no server, so albums are **not
actually shared** — each browser holds its own separate world, and the demo
join codes (`BAND-77`, `FLAT-24`) work because those albums are seeded into
your own storage. Two real people cannot share an album, and there is no
account to sign in with on a second device.

The notification toggles store a real preference but send nothing; delivery
needs a server. The Profile screen says so rather than implying otherwise.

Making it real means adding identity, a shared database, object storage for the
photo files, and server-side enforcement of the daily rule — in Postgres terms,
`UNIQUE (album_id, author_id, day)`, which is the same rule the reducer keeps
locally, in the one place a client can't bypass.

## Accessibility

Real `<button>`s and labelled inputs throughout, `aria-current` on the active
tab, `role="switch"` toggles, live-region toasts, `alt` text naming who took
each photo and when, Escape-to-close on dialogs and the lightbox, and visible
focus rings. The browser Back button works everywhere, including out of the
lightbox's parent screens.
