/**
 * The data layer, behind one interface with two implementations.
 *
 *   demo — everything in this browser: localStorage + IndexedDB, seeded with
 *          a fake world. No account, nothing shared, nothing leaves the device.
 *   live — Supabase: real accounts, real sharing, photos in object storage.
 *
 * Screens never talk to either directly; they call commands on the app
 * context, which forwards here. That's what makes the two modes
 * interchangeable, and what kept the screens untouched when live mode landed.
 */

import { PHOTO_BUCKET, requireSupabase } from './supabase';
import { dataStore, imageStore, ImageWriteError } from './store';
import {
  emptyData,
  type AccentKey,
  type Album,
  type AppData,
  type ImageRef,
  type Person,
  type Photo,
} from './types';
import { dayKey, makeInviteCode, normalizeCode, uid } from './util';

export type Mode = 'demo' | 'live';

/** A picked image on its way to storage. */
export interface PickedImage {
  dataUrl: string;
}

export interface Backend {
  readonly mode: Mode;

  /** Pull the whole world this user can see. */
  load(): Promise<AppData>;

  createAlbum(name: string, accent: AccentKey, cover?: PickedImage): Promise<string>;
  joinByCode(code: string): Promise<{ albumId: string }>;
  postPhoto(albumId: string, image: PickedImage, caption?: string): Promise<void>;

  renameAlbum(albumId: string, name: string): Promise<void>;
  setAlbumAccent(albumId: string, accent: AccentKey): Promise<void>;
  setAlbumCover(albumId: string, image: PickedImage): Promise<void>;
  regenerateCode(albumId: string): Promise<string>;
  leaveAlbum(albumId: string): Promise<void>;
  deleteAlbum(albumId: string): Promise<void>;

  renameUser(name: string): Promise<void>;
  setAvatar(image: PickedImage | null): Promise<void>;

  /** Resolve an image reference to something an <img> can display. */
  resolveImage(ref: ImageRef): Promise<string | null>;
}

/* ================================================================== */
/* Shared helpers                                                      */
/* ================================================================== */

/** `data:image/jpeg;base64,…` → Blob, for uploading. */
function dataUrlToBlob(dataUrl: string): Blob {
  const [header, encoded] = dataUrl.split(',');
  const mime = /:(.*?);/.exec(header)?.[1] ?? 'image/jpeg';
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/* ================================================================== */
/* Demo mode — this browser only                                       */
/* ================================================================== */

/**
 * Wraps the original local storage layer. The reducer still owns the in-memory
 * world here; these methods only persist it, so most are no-ops that let the
 * caller treat both modes the same way.
 */
export class DemoBackend implements Backend {
  readonly mode = 'demo' as const;

  async load(): Promise<AppData> {
    return (await dataStore.load()) ?? emptyData();
  }

  /** Demo mode persists the whole blob; the context calls this after changes. */
  async persist(data: AppData): Promise<void> {
    await dataStore.save(data);
  }

  async storeImage(image: PickedImage): Promise<{ ref: ImageRef; durable: boolean }> {
    const id = uid('img');
    const durable = await imageStore.put(id, image.dataUrl);
    return { ref: { kind: 'stored', id }, durable };
  }

  /* The mutations below are handled by the reducer in demo mode — the context
     dispatches, then calls persist(). Nothing to send anywhere. */
  async createAlbum(): Promise<string> {
    throw new Error('demo mode mutates through the reducer');
  }
  async joinByCode(): Promise<{ albumId: string }> {
    throw new Error('demo mode mutates through the reducer');
  }
  async postPhoto(): Promise<void> {}
  async renameAlbum(): Promise<void> {}
  async setAlbumAccent(): Promise<void> {}
  async setAlbumCover(): Promise<void> {}
  async regenerateCode(): Promise<string> {
    return makeInviteCode();
  }
  async leaveAlbum(): Promise<void> {}
  async deleteAlbum(): Promise<void> {}
  async renameUser(): Promise<void> {}
  async setAvatar(): Promise<void> {}

  async resolveImage(ref: ImageRef): Promise<string | null> {
    if (ref.kind === 'stored') return imageStore.get(ref.id);
    return null; // generated scenes resolve synchronously elsewhere
  }
}

/* ================================================================== */
/* Live mode — Supabase                                                */
/* ================================================================== */

interface DbProfile {
  id: string;
  name: string;
  accent: string;
  avatar_url: string | null;
}
interface DbAlbum {
  id: string;
  name: string;
  accent: string;
  invite_code: string;
  owner_id: string;
  cover_url: string | null;
  created_at: string;
}
interface DbMember {
  album_id: string;
  user_id: string;
}
interface DbPhoto {
  id: string;
  album_id: string;
  author_id: string;
  day: string;
  posted_at: string;
  caption: string | null;
  image_path: string;
}

const ACCENT_FALLBACK: AccentKey = 'yellow';
const KNOWN_ACCENTS = new Set<string>(['yellow', 'pink', 'blue', 'green', 'lavender', 'clay']);
const asAccent = (v: string): AccentKey =>
  KNOWN_ACCENTS.has(v) ? (v as AccentKey) : ACCENT_FALLBACK;

export class SupabaseBackend implements Backend {
  readonly mode = 'live' as const;

  private userId: string;

  constructor(userId: string) {
    this.userId = userId;
  }

  /* ---- Reading ---- */

  async load(): Promise<AppData> {
    const sb = requireSupabase();

    // No filters needed: row-level security already limits every one of these
    // to what this user is allowed to see.
    const [profiles, albums, members, photos] = await Promise.all([
      sb.from('profiles').select('id,name,accent,avatar_url'),
      sb.from('albums').select('id,name,accent,invite_code,owner_id,cover_url,created_at'),
      sb.from('album_members').select('album_id,user_id'),
      sb
        .from('photos')
        .select('id,album_id,author_id,day,posted_at,caption,image_path')
        .order('day', { ascending: false })
        .limit(2000),
    ]);

    const firstError =
      profiles.error ?? albums.error ?? members.error ?? photos.error ?? null;
    if (firstError) throw new Error(firstError.message);

    const data = emptyData();
    data.currentUserId = this.userId;

    for (const p of (profiles.data ?? []) as DbProfile[]) {
      const person: Person = { id: p.id, name: p.name, accent: asAccent(p.accent) };
      if (p.avatar_url) person.avatarImageId = p.avatar_url;
      data.people[p.id] = person;
    }

    const roster = new Map<string, string[]>();
    for (const m of (members.data ?? []) as DbMember[]) {
      const list = roster.get(m.album_id) ?? [];
      list.push(m.user_id);
      roster.set(m.album_id, list);
    }

    for (const a of (albums.data ?? []) as DbAlbum[]) {
      const album: Album = {
        id: a.id,
        name: a.name,
        accent: asAccent(a.accent),
        inviteCode: a.invite_code,
        ownerId: a.owner_id,
        createdAt: a.created_at,
        memberIds: roster.get(a.id) ?? [],
      };
      if (a.cover_url) album.cover = { kind: 'remote', path: a.cover_url };
      data.albums[a.id] = album;
    }

    for (const ph of (photos.data ?? []) as DbPhoto[]) {
      const photo: Photo = {
        id: ph.id,
        albumId: ph.album_id,
        authorId: ph.author_id,
        day: ph.day,
        postedAt: ph.posted_at,
        image: { kind: 'remote', path: ph.image_path },
      };
      if (ph.caption) photo.caption = ph.caption;
      data.photos[ph.id] = photo;
    }

    // Keep whatever album the user was last looking at, if it still exists.
    const remembered = localStorage.getItem('opd.activeAlbum');
    data.activeAlbumId =
      remembered && data.albums[remembered] ? remembered : (Object.keys(data.albums)[0] ?? null);

    return data;
  }

  /* ---- Images ---- */

  /**
   * Signed URLs for a private bucket, cached until shortly before they lapse.
   * Without the cache every re-render of a grid would re-sign every tile.
   */
  private signed = new Map<string, { url: string; expires: number }>();

  async resolveImage(ref: ImageRef): Promise<string | null> {
    if (ref.kind !== 'remote') {
      // A live session can still hold demo-era local refs if the user switched
      // modes; fall back to the local store rather than showing a hole.
      return ref.kind === 'stored' ? imageStore.get(ref.id) : null;
    }

    // Google avatars are already public URLs, not bucket objects.
    if (ref.path.startsWith('http')) return ref.path;

    const hit = this.signed.get(ref.path);
    if (hit && hit.expires > Date.now()) return hit.url;

    const sb = requireSupabase();
    const { data, error } = await sb.storage
      .from(PHOTO_BUCKET)
      .createSignedUrl(ref.path, 3600);
    if (error || !data) return null;

    this.signed.set(ref.path, {
      url: data.signedUrl,
      // Re-sign a minute early so a URL never expires mid-render.
      expires: Date.now() + 3540_000,
    });
    return data.signedUrl;
  }

  private async upload(albumId: string, image: PickedImage): Promise<string> {
    const sb = requireSupabase();
    const path = `${albumId}/${uid('ph')}.jpg`;
    const { error } = await sb.storage
      .from(PHOTO_BUCKET)
      .upload(path, dataUrlToBlob(image.dataUrl), {
        contentType: 'image/jpeg',
        upsert: false,
      });
    if (error) throw new ImageWriteError(`Upload failed: ${error.message}`, false);
    return path;
  }

  /* ---- Mutations ---- */

  async createAlbum(name: string, accent: AccentKey, cover?: PickedImage): Promise<string> {
    const sb = requireSupabase();

    // Has to be one privileged step in the database. Inserting the album and
    // the creator's membership separately deadlocks: you can't add yourself
    // to an album (no such policy, deliberately — that would let anyone with
    // an album id skip the invite code), and you can't read back an album
    // you're not yet a member of.
    const { data, error } = await sb.rpc('create_album', {
      p_name: name.trim(),
      p_accent: accent,
      p_code: makeInviteCode(),
    });
    if (error || !data) throw new Error(error?.message ?? 'Could not create the album.');

    const albumId = data as string;

    if (cover) {
      const path = await this.upload(albumId, cover);
      await sb.from('albums').update({ cover_url: path }).eq('id', albumId);
    }

    return albumId;
  }

  async joinByCode(code: string): Promise<{ albumId: string }> {
    const sb = requireSupabase();
    // Goes through the database function: a non-member can't see the album to
    // look it up themselves, by design.
    const { data, error } = await sb.rpc('join_album_by_code', {
      code: normalizeCode(code),
    });
    if (error) {
      if (/no album with that code/i.test(error.message)) {
        throw new Error("We couldn't find an album with that code. Check it with your friend?");
      }
      throw new Error(error.message);
    }
    return { albumId: data as string };
  }

  async postPhoto(albumId: string, image: PickedImage, caption?: string): Promise<void> {
    const sb = requireSupabase();
    const path = await this.upload(albumId, image);

    const { error } = await sb.from('photos').insert({
      album_id: albumId,
      author_id: this.userId,
      day: dayKey(),
      caption: caption?.trim() || null,
      image_path: path,
    });

    if (error) {
      // Clean up the orphaned upload — the row it belonged to never landed.
      await sb.storage.from(PHOTO_BUCKET).remove([path]).catch(() => {});
      if (error.code === '23505') {
        throw new Error("You've already posted to this album today.");
      }
      throw new Error(error.message);
    }
  }

  async renameAlbum(albumId: string, name: string): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('albums').update({ name: name.trim() }).eq('id', albumId);
    if (error) throw new Error(error.message);
  }

  async setAlbumAccent(albumId: string, accent: AccentKey): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb.from('albums').update({ accent }).eq('id', albumId);
    if (error) throw new Error(error.message);
  }

  async setAlbumCover(albumId: string, image: PickedImage): Promise<void> {
    const sb = requireSupabase();
    const path = await this.upload(albumId, image);
    const { error } = await sb.from('albums').update({ cover_url: path }).eq('id', albumId);
    if (error) throw new Error(error.message);
  }

  async regenerateCode(albumId: string): Promise<string> {
    const sb = requireSupabase();
    const code = makeInviteCode();
    const { error } = await sb.from('albums').update({ invite_code: code }).eq('id', albumId);
    if (error) throw new Error(error.message);
    return code;
  }

  async leaveAlbum(albumId: string): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb
      .from('album_members')
      .delete()
      .eq('album_id', albumId)
      .eq('user_id', this.userId);
    if (error) throw new Error(error.message);
  }

  async deleteAlbum(albumId: string): Promise<void> {
    const sb = requireSupabase();
    // Only the owner may do this — enforced by policy, not by this call.
    const { error } = await sb.from('albums').delete().eq('id', albumId);
    if (error) throw new Error(error.message);
  }

  async renameUser(name: string): Promise<void> {
    const sb = requireSupabase();
    const { error } = await sb
      .from('profiles')
      .update({ name: name.trim() })
      .eq('id', this.userId);
    if (error) throw new Error(error.message);
  }

  async setAvatar(image: PickedImage | null): Promise<void> {
    const sb = requireSupabase();

    if (!image) {
      const { error } = await sb
        .from('profiles')
        .update({ avatar_url: null })
        .eq('id', this.userId);
      if (error) throw new Error(error.message);
      return;
    }

    // Avatars live under a per-user folder in the same bucket.
    const path = `avatars/${this.userId}/${uid('av')}.jpg`;
    const { error: upErr } = await sb.storage
      .from(PHOTO_BUCKET)
      .upload(path, dataUrlToBlob(image.dataUrl), {
        contentType: 'image/jpeg',
        upsert: true,
      });
    if (upErr) throw new ImageWriteError(`Upload failed: ${upErr.message}`, false);

    const { error } = await sb.from('profiles').update({ avatar_url: path }).eq('id', this.userId);
    if (error) throw new Error(error.message);
  }
}
