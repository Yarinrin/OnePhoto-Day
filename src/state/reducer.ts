/**
 * The whole app's business logic, in one reducer.
 *
 * Rules that matter (notably "one photo per person, per album, per day") are
 * enforced here rather than in the screens, so no UI path can slip past them.
 */

import type { AccentKey, AppData, Album, ImageRef, Person, Photo } from '../lib/types';
import { dayKey, makeInviteCode, normalizeCode, uid } from '../lib/util';

export type Action =
  | { type: 'hydrate'; data: AppData }
  | { type: 'signIn'; name: string; data: AppData }
  | { type: 'renameUser'; name: string }
  | { type: 'setUserAvatar'; imageId?: string }
  | { type: 'createAlbum'; name: string; accent: AccentKey; cover?: ImageRef; albumId: string; code: string }
  | { type: 'joinAlbum'; albumId: string }
  | { type: 'postPhoto'; photo: Photo }
  | { type: 'setActiveAlbum'; albumId: string | null }
  | { type: 'renameAlbum'; albumId: string; name: string }
  | { type: 'setAlbumAccent'; albumId: string; accent: AccentKey }
  | { type: 'setAlbumCover'; albumId: string; cover: ImageRef }
  | { type: 'regenerateCode'; albumId: string; code: string }
  | { type: 'leaveAlbum'; albumId: string }
  | { type: 'deleteAlbum'; albumId: string }
  | { type: 'setSetting'; key: keyof AppData['settings']; value: boolean }
  | { type: 'reset'; data: AppData };

function withoutAlbum(data: AppData, albumId: string): AppData {
  const albums = { ...data.albums };
  delete albums[albumId];
  const photos = Object.fromEntries(
    Object.entries(data.photos).filter(([, p]) => p.albumId !== albumId),
  );
  const remaining = Object.keys(albums);
  return {
    ...data,
    albums,
    photos,
    activeAlbumId: data.activeAlbumId === albumId ? (remaining[0] ?? null) : data.activeAlbumId,
  };
}

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'hydrate':
    case 'reset':
      return action.data;

    case 'signIn':
      return action.data;

    case 'renameUser': {
      const id = state.currentUserId;
      if (!id) return state;
      const name = action.name.trim();
      if (!name) return state;
      const me: Person = { ...state.people[id], name };
      return { ...state, people: { ...state.people, [id]: me } };
    }

    case 'setUserAvatar': {
      const id = state.currentUserId;
      if (!id) return state;
      const me: Person = { ...state.people[id], avatarImageId: action.imageId };
      return { ...state, people: { ...state.people, [id]: me } };
    }

    case 'createAlbum': {
      const owner = state.currentUserId;
      if (!owner) return state;
      const album: Album = {
        id: action.albumId,
        name: action.name.trim(),
        accent: action.accent,
        inviteCode: action.code,
        ownerId: owner,
        createdAt: new Date().toISOString(),
        memberIds: [owner],
        cover: action.cover,
      };
      return {
        ...state,
        albums: { ...state.albums, [album.id]: album },
        activeAlbumId: album.id,
      };
    }

    case 'joinAlbum': {
      const me = state.currentUserId;
      const album = state.albums[action.albumId];
      if (!me || !album || album.memberIds.includes(me)) return state;
      const updated: Album = { ...album, memberIds: [...album.memberIds, me] };
      return {
        ...state,
        albums: { ...state.albums, [album.id]: updated },
        activeAlbumId: album.id,
      };
    }

    case 'postPhoto': {
      const { photo } = action;
      const album = state.albums[photo.albumId];
      if (!album || !album.memberIds.includes(photo.authorId)) return state;

      // The rule. One frame per person, per album, per day — no exceptions.
      const alreadyPosted = Object.values(state.photos).some(
        (p) => p.albumId === photo.albumId && p.authorId === photo.authorId && p.day === photo.day,
      );
      if (alreadyPosted) return state;

      const albums =
        photo.day === dayKey()
          ? { ...state.albums, [album.id]: { ...album, cover: album.cover ?? photo.image } }
          : state.albums;

      return { ...state, albums, photos: { ...state.photos, [photo.id]: photo } };
    }

    case 'setActiveAlbum':
      return { ...state, activeAlbumId: action.albumId };

    case 'renameAlbum': {
      const album = state.albums[action.albumId];
      const name = action.name.trim();
      if (!album || !name) return state;
      return { ...state, albums: { ...state.albums, [album.id]: { ...album, name } } };
    }

    case 'setAlbumAccent': {
      const album = state.albums[action.albumId];
      if (!album) return state;
      return {
        ...state,
        albums: { ...state.albums, [album.id]: { ...album, accent: action.accent } },
      };
    }

    case 'setAlbumCover': {
      const album = state.albums[action.albumId];
      if (!album) return state;
      return {
        ...state,
        albums: { ...state.albums, [album.id]: { ...album, cover: action.cover } },
      };
    }

    case 'regenerateCode': {
      const album = state.albums[action.albumId];
      if (!album) return state;
      return {
        ...state,
        albums: { ...state.albums, [album.id]: { ...album, inviteCode: action.code } },
      };
    }

    case 'leaveAlbum': {
      const me = state.currentUserId;
      const album = state.albums[action.albumId];
      if (!me || !album) return state;
      // Last one out turns off the lights.
      if (album.memberIds.length <= 1) return withoutAlbum(state, album.id);

      const memberIds = album.memberIds.filter((id) => id !== me);
      const photos = Object.fromEntries(
        Object.entries(state.photos).filter(
          ([, p]) => !(p.albumId === album.id && p.authorId === me),
        ),
      );
      const ownerId = album.ownerId === me ? memberIds[0] : album.ownerId;
      const remaining = Object.keys(state.albums).filter((id) => id !== album.id);
      return {
        ...state,
        albums: { ...state.albums, [album.id]: { ...album, memberIds, ownerId } },
        photos,
        activeAlbumId: state.activeAlbumId === album.id ? (remaining[0] ?? null) : state.activeAlbumId,
      };
    }

    case 'deleteAlbum':
      return withoutAlbum(state, action.albumId);

    case 'setSetting':
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };

    default:
      return state;
  }
}

/* ---------------------------------------------------------------- */
/* Action builders that need to generate ids / codes                  */
/* ---------------------------------------------------------------- */

export function newAlbumAction(name: string, accent: AccentKey, cover?: ImageRef): Action {
  return { type: 'createAlbum', name, accent, cover, albumId: uid('a'), code: makeInviteCode() };
}

export function newPhoto(
  albumId: string,
  authorId: string,
  image: ImageRef,
  caption?: string,
): Photo {
  const trimmed = caption?.trim();
  return {
    id: uid('ph'),
    albumId,
    authorId,
    day: dayKey(),
    postedAt: new Date().toISOString(),
    image,
    ...(trimmed ? { caption: trimmed } : {}),
  };
}

/** Resolve an invite code to an album id, ignoring dashes and case. */
export function findAlbumByCode(state: AppData, raw: string): Album | undefined {
  const wanted = normalizeCode(raw);
  if (!wanted) return undefined;
  return Object.values(state.albums).find((a) => normalizeCode(a.inviteCode) === wanted);
}
