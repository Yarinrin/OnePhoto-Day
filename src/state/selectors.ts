/** Derived reads over AppData. Pure, memo-friendly, no React. */

import type { AppData, Album, Person, Photo } from '../lib/types';
import { dayKey, shiftDay } from '../lib/util';

/**
 * Every stored-image id the world still points at: posted photos, album
 * covers and profile pictures. Anything in the image store outside this set is
 * dead weight. Deliberately exhaustive — a missed source here deletes a live
 * photo, so it walks all three collections rather than assuming.
 */
export function referencedImageIds(data: AppData): Set<string> {
  const ids = new Set<string>();
  for (const photo of Object.values(data.photos)) {
    if (photo.image.kind === 'stored') ids.add(photo.image.id);
  }
  for (const album of Object.values(data.albums)) {
    if (album.cover?.kind === 'stored') ids.add(album.cover.id);
  }
  for (const person of Object.values(data.people)) {
    if (person.avatarImageId) ids.add(person.avatarImageId);
  }
  return ids;
}

export function currentUser(data: AppData): Person | null {
  return data.currentUserId ? (data.people[data.currentUserId] ?? null) : null;
}

/** Albums the signed-in user belongs to, most recently active first. */
export function myAlbums(data: AppData): Album[] {
  const me = data.currentUserId;
  if (!me) return [];
  const albums = Object.values(data.albums).filter((a) => a.memberIds.includes(me));
  const lastDay = new Map<string, string>();
  for (const p of Object.values(data.photos)) {
    const prev = lastDay.get(p.albumId);
    if (!prev || p.day > prev) lastDay.set(p.albumId, p.day);
  }
  return albums.sort((a, b) => {
    const av = lastDay.get(a.id) ?? '';
    const bv = lastDay.get(b.id) ?? '';
    if (av !== bv) return av < bv ? 1 : -1;
    return a.createdAt < b.createdAt ? 1 : -1;
  });
}

export function albumPhotos(data: AppData, albumId: string): Photo[] {
  return Object.values(data.photos).filter((p) => p.albumId === albumId);
}

export function photosOnDay(data: AppData, albumId: string, day: string): Photo[] {
  return Object.values(data.photos)
    .filter((p) => p.albumId === albumId && p.day === day)
    .sort((a, b) => (a.postedAt < b.postedAt ? -1 : 1));
}

/** Days that hold at least one photo, newest first. */
export function albumDays(data: AppData, albumId: string): string[] {
  const set = new Set<string>();
  for (const p of Object.values(data.photos)) if (p.albumId === albumId) set.add(p.day);
  return [...set].sort((a, b) => (a < b ? 1 : -1));
}

export function daysWithPhotos(data: AppData, albumId: string): Set<string> {
  const set = new Set<string>();
  for (const p of Object.values(data.photos)) if (p.albumId === albumId) set.add(p.day);
  return set;
}

export function members(data: AppData, album: Album): Person[] {
  return album.memberIds.map((id) => data.people[id]).filter(Boolean);
}

export interface TodayState {
  day: string;
  posted: Photo[];
  /** Members with nothing posted yet today. */
  waiting: Person[];
  mine: Photo | null;
  total: number;
  count: number;
  /** Everyone has posted. */
  complete: boolean;
}

export function todayState(data: AppData, album: Album, day = dayKey()): TodayState {
  const posted = photosOnDay(data, album.id, day);
  const postedBy = new Set(posted.map((p) => p.authorId));
  const roster = members(data, album);
  return {
    day,
    posted,
    waiting: roster.filter((m) => !postedBy.has(m.id)),
    mine: posted.find((p) => p.authorId === data.currentUserId) ?? null,
    total: roster.length,
    count: posted.length,
    complete: roster.length > 0 && postedBy.size >= roster.length,
  };
}

/** Has this person used up their frame in this album today? */
export function hasPostedToday(data: AppData, albumId: string, personId: string): boolean {
  const today = dayKey();
  return Object.values(data.photos).some(
    (p) => p.albumId === albumId && p.authorId === personId && p.day === today,
  );
}

export function lastActiveDay(data: AppData, albumId: string): string | null {
  let latest: string | null = null;
  for (const p of Object.values(data.photos)) {
    if (p.albumId === albumId && (!latest || p.day > latest)) latest = p.day;
  }
  return latest;
}

export function albumPhotoCount(data: AppData, albumId: string): number {
  let n = 0;
  for (const p of Object.values(data.photos)) if (p.albumId === albumId) n++;
  return n;
}

/* ------------------------------------------------------------------ */
/* Streaks                                                             */
/* ------------------------------------------------------------------ */

export interface Streak {
  /** Days in a row, counting up to today. */
  current: number;
  /** The longest run ever, whether or not it's still going. */
  best: number;
}

const NO_STREAK: Streak = { current: 0, best: 0 };

/**
 * The run of consecutive days ending now.
 *
 * A streak that hasn't been extended *yet today* is still alive — you have
 * until midnight. So the walk starts at yesterday when today is empty, and
 * only a fully missed day breaks the run.
 */
function currentRun(days: Set<string>, today: string): number {
  let cursor = days.has(today) ? today : shiftDay(today, -1);
  let n = 0;
  while (days.has(cursor)) {
    n++;
    cursor = shiftDay(cursor, -1);
  }
  return n;
}

/** The longest run of consecutive days anywhere in the set. */
function longestRun(days: Set<string>): number {
  if (!days.size) return 0;
  // `YYYY-MM-DD` sorts lexically in date order, so a plain sort is enough.
  const sorted = [...days].sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < sorted.length; i++) {
    run = sorted[i] === shiftDay(sorted[i - 1], 1) ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}

function streakOf(days: Set<string>, today: string): Streak {
  if (!days.size) return NO_STREAK;
  return { current: currentRun(days, today), best: longestRun(days) };
}

/** Days this person put a photo into this album. */
function personDaysInAlbum(data: AppData, albumId: string, personId: string): Set<string> {
  const days = new Set<string>();
  for (const p of Object.values(data.photos)) {
    if (p.albumId === albumId && p.authorId === personId) days.add(p.day);
  }
  return days;
}

/** Days this person posted anywhere at all. */
function personDays(data: AppData, personId: string): Set<string> {
  const days = new Set<string>();
  for (const p of Object.values(data.photos)) {
    if (p.authorId === personId) days.add(p.day);
  }
  return days;
}

/** One person's run inside one album. */
export function personAlbumStreak(
  data: AppData,
  albumId: string,
  personId: string,
  today = dayKey(),
): Streak {
  return streakOf(personDaysInAlbum(data, albumId, personId), today);
}

/**
 * One person's run across every album. Posting to any album keeps the day
 * alive — the habit is showing up, not which album you showed up in.
 */
export function personStreak(data: AppData, personId: string, today = dayKey()): Streak {
  return streakOf(personDays(data, personId), today);
}

/** Consecutive days the album as a whole has a photo from anyone. */
export function albumStreak(data: AppData, albumId: string, today = dayKey()): number {
  return currentRun(daysWithPhotos(data, albumId), today);
}
