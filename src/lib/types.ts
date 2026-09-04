export type AccentKey = 'yellow' | 'pink' | 'blue' | 'green' | 'lavender' | 'clay';

export const ACCENTS: AccentKey[] = ['yellow', 'pink', 'blue', 'green', 'lavender', 'clay'];

/** A person. Members of an album are people; the signed-in user is one too. */
export interface Person {
  id: string;
  name: string;
  accent: AccentKey;
  /** Reference into the image store, if they set a profile picture. */
  avatarImageId?: string;
}

/**
 * Where a photo's pixels live.
 * `generated` scenes are drawn on the fly from a seed, so demo data costs no
 * storage; `stored` images are user uploads kept in the image store.
 */
export type ImageRef =
  | { kind: 'generated'; scene: string; seed: number }
  | { kind: 'stored'; id: string };

export interface Photo {
  id: string;
  albumId: string;
  authorId: string;
  /** Local calendar day, `YYYY-MM-DD`. One per author per album per day. */
  day: string;
  /** ISO timestamp of the moment it was posted. */
  postedAt: string;
  caption?: string;
  image: ImageRef;
}

export interface Album {
  id: string;
  name: string;
  accent: AccentKey;
  inviteCode: string;
  ownerId: string;
  createdAt: string;
  memberIds: string[];
  cover?: ImageRef;
}

/** The whole persisted world. Swap the store, keep this shape. */
export interface AppData {
  version: number;
  currentUserId: string | null;
  people: Record<string, Person>;
  albums: Record<string, Album>;
  photos: Record<string, Photo>;
  activeAlbumId: string | null;
  settings: {
    dailyReminder: boolean;
    albumActivity: boolean;
  };
}

export const DATA_VERSION = 1;

export function emptyData(): AppData {
  return {
    version: DATA_VERSION,
    currentUserId: null,
    people: {},
    albums: {},
    photos: {},
    activeAlbumId: null,
    settings: { dailyReminder: true, albumActivity: true },
  };
}
