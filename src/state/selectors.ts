/** Derived reads over AppData. Pure, memo-friendly, no React. */

import type { AppData, Album, Person, Photo } from '../lib/types';
import { dayKey } from '../lib/util';

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

/** Consecutive days, ending today or yesterday, where the album has a photo. */
export function albumStreak(data: AppData, albumId: string): number {
  const days = daysWithPhotos(data, albumId);
  if (!days.size) return 0;
  const cursor = new Date();
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
