/**
 * The world a demo user starts with.
 *
 * `newWorld` is what actually ships: you, and nothing else. An app that
 * invents four albums and a cast of friends you have never met reads as
 * broken, not as generous — the first thing it says about itself is that its
 * contents aren't real.
 *
 * `buildSeedWorld` is the populated alternative, months of history across four
 * albums. It is reachable on demand (`?sample=1`) and is what the smoke suite
 * drives, since checking a calendar, a timeline and a streak needs something
 * to have happened. Everything it builds is ordinary app data and can be
 * edited or deleted like anything else.
 */

import { dayKey, hashString, makeInviteCode, shiftDay, uid } from './util';
import { emptyData, type AccentKey, type AppData, type Album, type Person, type Photo } from './types';

interface AlbumSpec {
  name: string;
  accent: AccentKey;
  /** Other members, in join order. */
  cast: string[];
  scenes: string[];
  /** How many days back the album goes. */
  historyDays: number;
  /** Chance any given member posts on any given day. */
  density: number;
  /** How today looks for the signed-in user. */
  today: 'user-pending' | 'user-posted' | 'nobody-yet' | 'dormant';
  /**
   * Albums the user has *not* joined yet, so the invite-code flow has
   * something real to find. Their codes are fixed and hinted in the UI.
   */
  joinable?: string;
}

const SPECS: AlbumSpec[] = [
  {
    name: 'The Boys',
    accent: 'blue',
    cast: ['Noam', 'Dan', 'Tom', 'Ori', 'Omer'],
    scenes: ['sunset', 'nightLights', 'stage', 'cityStreet', 'tableTop', 'water'],
    historyDays: 168,
    density: 0.82,
    today: 'user-pending',
  },
  {
    name: 'Summer 2026',
    accent: 'yellow',
    cast: ['Maya', 'Shira', 'Ido'],
    scenes: ['water', 'sunset', 'openRoad', 'tableTop'],
    historyDays: 46,
    density: 0.74,
    today: 'user-posted',
  },
  {
    name: 'Family',
    accent: 'green',
    cast: ['Mum', 'Dad', 'Alma', 'Guy'],
    scenes: ['tableTop', 'forest', 'mountains', 'snow', 'cityStreet'],
    historyDays: 92,
    density: 0.58,
    today: 'nobody-yet',
  },
  {
    name: 'Italy Trip',
    accent: 'clay',
    cast: ['Noam', 'Tom', 'Maya'],
    scenes: ['cityStreet', 'tableTop', 'water', 'mountains', 'sunset'],
    historyDays: 34,
    density: 0.88,
    today: 'dormant',
  },
  {
    name: 'Band Life',
    accent: 'lavender',
    cast: ['Ravid', 'Yoni', 'Lior'],
    scenes: ['stage', 'nightLights', 'cityStreet'],
    historyDays: 58,
    density: 0.7,
    today: 'nobody-yet',
    joinable: 'BAND-77',
  },
  {
    name: 'Flat 4B',
    accent: 'pink',
    cast: ['Roni', 'Adi', 'Gal'],
    scenes: ['tableTop', 'cityStreet', 'forest'],
    historyDays: 40,
    density: 0.65,
    today: 'nobody-yet',
    joinable: 'FLAT-24',
  },
];

/** Codes surfaced as a hint on the join screen so the flow is discoverable. */
export const DEMO_INVITE_CODES = ['BAND-77', 'FLAT-24'];

const CAPTIONS = [
  'golden hour again',
  'no notes',
  'this one',
  'we made it',
  'last light',
  'best table in town',
  'took the long way home',
  'nobody wanted to leave',
  'quiet one today',
  'found this street',
  'worth the walk',
  'same spot, new day',
  'the good kind of tired',
  'peak summer',
  'again tomorrow',
];

const PERSON_ACCENTS: AccentKey[] = ['pink', 'blue', 'green', 'lavender', 'clay', 'yellow'];

function accentFor(name: string): AccentKey {
  return PERSON_ACCENTS[hashString(name) % PERSON_ACCENTS.length];
}

/** Deterministic-ish spread of posting times across a plausible day. */
function postedAt(day: string, offsetMinutes: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const base = new Date(y, m - 1, d, 8, 0, 0);
  base.setMinutes(base.getMinutes() + offsetMinutes);
  return base.toISOString();
}

/** You, and an empty shelf. What a new demo user gets. */
export function newWorld(userName: string): AppData {
  const data = emptyData();
  const me: Person = {
    id: uid('p'),
    name: userName.trim() || 'You',
    accent: 'pink',
  };
  data.people[me.id] = me;
  data.currentUserId = me.id;
  return data;
}

/*
 * Read once, at load, and never again: the router rewrites the address bar
 * with `replaceState` as soon as it resolves a route, and that drops the query
 * string. By the time the name is submitted the flag is long gone from the URL.
 */
const SAMPLE_REQUESTED =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).has('sample');

/** Whether this session asked for the populated sample world instead. */
export function wantsSampleWorld(): boolean {
  return SAMPLE_REQUESTED;
}

export function buildSeedWorld(userName: string): AppData {
  const data = emptyData();
  const today = dayKey();

  const me: Person = {
    id: uid('p'),
    name: userName.trim() || 'You',
    accent: 'pink',
  };
  data.people[me.id] = me;
  data.currentUserId = me.id;

  // Cast members are shared across albums when the name repeats.
  const byName = new Map<string, Person>();
  const person = (name: string): Person => {
    const existing = byName.get(name);
    if (existing) return existing;
    const p: Person = { id: uid('p'), name, accent: accentFor(name) };
    byName.set(name, p);
    data.people[p.id] = p;
    return p;
  };

  SPECS.forEach((spec, specIndex) => {
    const cast = spec.cast.map(person);
    // Joinable albums exist without the user; everything else they're in.
    const members = spec.joinable ? cast : [me, ...cast];
    const album: Album = {
      id: uid('a'),
      name: spec.name,
      accent: spec.accent,
      inviteCode: spec.joinable ?? makeInviteCode(),
      ownerId: spec.joinable || specIndex === 3 ? cast[0].id : me.id,
      createdAt: new Date(Date.now() - spec.historyDays * 86_400_000).toISOString(),
      memberIds: members.map((m) => m.id),
    };

    // Deterministic per-album randomness keeps reloads visually stable.
    let tick = hashString(spec.name);
    const rand = () => {
      tick = (Math.imul(tick ^ (tick >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
      return tick / 4294967296;
    };

    // `dormant` albums stopped a few days ago — they have a quiet card.
    const gap = spec.today === 'dormant' ? 3 : 0;

    for (let back = spec.historyDays; back >= gap; back--) {
      const day = shiftDay(today, -back);
      const isToday = back === 0;

      // Participation ramps up over an album's life, the way it really does.
      const maturity = 0.45 + 0.55 * (1 - back / Math.max(1, spec.historyDays));

      members.forEach((member, mi) => {
        const isMe = member.id === me.id;

        if (isToday) {
          if (spec.today === 'nobody-yet') return;
          if (isMe && spec.today !== 'user-posted') return;
          if (!isMe && spec.today === 'user-posted' && mi > 2) return;
          if (!isMe && spec.today === 'user-pending' && mi > 4) return;
        } else if (rand() > spec.density * maturity) {
          return;
        }

        // Rotate scenes by member and by day rather than drawing at random:
        // a random draw clusters, and a day's page full of near-identical
        // frames is the one thing that makes generated photos look generated.
        const scene =
          spec.scenes[(mi + hashString(day)) % spec.scenes.length];
        const photo: Photo = {
          id: uid('ph'),
          albumId: album.id,
          authorId: member.id,
          day,
          postedAt: postedAt(day, Math.floor(rand() * 760)),
          image: { kind: 'generated', scene, seed: Math.floor(rand() * 100000) + 1 },
        };
        if (rand() > 0.72) photo.caption = CAPTIONS[Math.floor(rand() * CAPTIONS.length)];
        data.photos[photo.id] = photo;
      });
    }

    // Cover: the album's most recent frame.
    const latest = Object.values(data.photos)
      .filter((p) => p.albumId === album.id)
      .sort((a, b) => (a.day < b.day ? 1 : -1))[0];
    if (latest) album.cover = latest.image;

    data.albums[album.id] = album;
  });

  data.activeAlbumId = Object.keys(data.albums)[0] ?? null;
  return data;
}
