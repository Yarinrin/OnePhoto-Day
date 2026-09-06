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
import { dataStore, imageStore, ImageWriteError, thumbIdFor } from './store';
import {
  emptyData,
  type AccentKey,
  type Album,
  type AppData,
  type ImageRef,
  type ImageSize,
  type Person,
  type Photo,
} from './types';
import {
  dayKey,
  makeInviteCode,
  normalizeCode,
  uid,
  type EncodedImage,
} from './util';

export type Mode = 'demo' | 'live';

/** A picked image on its way to storage. */
/** A picked photo, already downscaled and encoded at both sizes. */
export type PickedImage = EncodedImage;

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
  resolveImage(ref: ImageRef, size: ImageSize): Promise<string | null>;
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
    const thumbId = thumbIdFor(id);
    const durable = await imageStore.put(id, image.dataUrl);
    // The small copy is a nicety, not the photo. If there is no room for it
    // the full size still displays everywhere; failing the whole upload over
    // a thumbnail would lose the picture to save a preview of it.
    await imageStore.put(thumbId, image.thumbDataUrl).catch(() => false);
    return { ref: { kind: 'stored', id, thumbId }, durable };
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

  async resolveImage(ref: ImageRef, size: ImageSize): Promise<string | null> {
    if (ref.kind !== 'stored') return null; // generated scenes resolve elsewhere
    if (size === 'thumb' && ref.thumbId) {
      const small = await imageStore.get(ref.thumbId);
      if (small) return small;
    }
    return imageStore.get(ref.id);
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
  cover_thumb_url: string | null;
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
  thumb_path: string | null;
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
      sb
        .from('albums')
        .select('id,name,accent,invite_code,owner_id,cover_url,cover_thumb_url,created_at'),
      sb.from('album_members').select('album_id,user_id'),
      sb
        .from('photos')
        .select('id,album_id,author_id,day,posted_at,caption,image_path,thumb_path')
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
      if (a.cover_url) {
        album.cover = { kind: 'remote', path: a.cover_url };
        if (a.cover_thumb_url) album.cover.thumbPath = a.cover_thumb_url;
      }
      data.albums[a.id] = album;
    }

    for (const ph of (photos.data ?? []) as DbPhoto[]) {
      const photo: Photo = {
        id: ph.id,
        albumId: ph.album_id,
        authorId: ph.author_id,
        day: ph.day,
        postedAt: ph.posted_at,
        image: ph.thumb_path
          ? { kind: 'remote', path: ph.image_path, thumbPath: ph.thumb_path }
          : { kind: 'remote', path: ph.image_path },
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

  /** Paths waiting to be signed together on the next tick. */
  private pending = new Map<string, ((url: string | null) => void)[]>();
  private flushQueued = false;

  async resolveImage(ref: ImageRef, size: ImageSize): Promise<string | null> {
    if (ref.kind !== 'remote') {
      // A live session can still hold demo-era local refs if the user switched
      // modes; fall back to the local store rather than showing a hole.
      return ref.kind === 'stored' ? imageStore.get(ref.id) : null;
    }

    // Google avatars are already public URLs, not bucket objects.
    if (ref.path.startsWith('http')) return ref.path;

    // Photos posted before there were thumbnails have only the full size.
    const path = size === 'thumb' && ref.thumbPath ? ref.thumbPath : ref.path;

    const hit = this.signed.get(path);
    if (hit && hit.expires > Date.now()) return hit.url;

    return this.signLater(path);
  }

  /*
   * Signing is batched because it is a network request, and a grid asks for
   * one per tile.
   *
   * Every <img> resolves its own source, so a screen of twenty photos used to
   * make twenty round trips to Supabase before the first byte of the first
   * photo was requested — the images were not slow to download so much as slow
   * to be allowed to start. React runs all of a commit's effects in one task,
   * so waiting a single turn of the event loop collects the whole screen into
   * one `createSignedUrls` call.
   */
  private signLater(path: string): Promise<string | null> {
    return new Promise((resolve) => {
      const waiting = this.pending.get(path);
      if (waiting) {
        // Already queued by another tile this tick — share the one request.
        waiting.push(resolve);
      } else {
        this.pending.set(path, [resolve]);
      }
      if (!this.flushQueued) {
        this.flushQueued = true;
        setTimeout(() => void this.flushSigning(), 0);
      }
    });
  }

  private async flushSigning(): Promise<void> {
    this.flushQueued = false;
    const batch = this.pending;
    this.pending = new Map();
    const paths = [...batch.keys()];
    if (paths.length === 0) return;

    const settle = (path: string, url: string | null) => {
      for (const resolve of batch.get(path) ?? []) resolve(url);
    };

    // Anything that escapes leaves every tile in this batch waiting on a
    // promise that will never settle — a skeleton that never resolves into
    // either a photo or an error.
    let sb;
    try {
      sb = requireSupabase();
    } catch {
      for (const path of paths) settle(path, null);
      return;
    }

    // Chunked because the endpoint takes a list, not an unbounded one.
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      try {
        const { data, error } = await sb.storage
          .from(PHOTO_BUCKET)
          .createSignedUrls(chunk, 3600);
        if (error || !data) {
          for (const path of chunk) settle(path, null);
          continue;
        }
        const seen = new Set<string>();
        for (const row of data) {
          // The API echoes the path back on each row; a row can carry its own
          // error while its neighbours succeeded.
          const path = row.path ?? '';
          if (!path) continue;
          seen.add(path);
          if (row.error || !row.signedUrl) {
            settle(path, null);
            continue;
          }
          this.signed.set(path, {
            url: row.signedUrl,
            // Re-sign a minute early so a URL never expires mid-render.
            expires: Date.now() + 3540_000,
          });
          settle(path, row.signedUrl);
        }
        // Anything the response didn't mention must still be answered, or the
        // tile waiting on it hangs on a skeleton forever.
        for (const path of chunk) if (!seen.has(path)) settle(path, null);
      } catch {
        for (const path of chunk) settle(path, null);
      }
    }
  }

  /**
   * Puts a picture in the bucket at both sizes, in one folder so the album's
   * row-level rules cover the pair without a second policy.
   *
   * The small copy is sent first and is allowed to fail: it is a preview, and
   * losing the photograph because its preview would not upload is the wrong
   * trade. A `null` thumb path simply means the full size is all there is.
   */
  private async upload(
    folder: string,
    prefix: string,
    image: PickedImage,
    upsert = false,
  ): Promise<{ path: string; thumbPath: string | null }> {
    const sb = requireSupabase();
    const id = uid(prefix);
    const path = `${folder}/${id}.${image.ext}`;
    const thumbPath = `${folder}/${id}.t.${image.ext}`;
    const contentType = image.ext === 'webp' ? 'image/webp' : 'image/jpeg';

    const thumb = await sb.storage
      .from(PHOTO_BUCKET)
      .upload(thumbPath, dataUrlToBlob(image.thumbDataUrl), { contentType, upsert })
      .catch(() => ({ error: new Error('thumbnail upload failed') }));

    const { error } = await sb.storage
      .from(PHOTO_BUCKET)
      .upload(path, dataUrlToBlob(image.dataUrl), { contentType, upsert });
    if (error) {
      if (!thumb.error) await sb.storage.from(PHOTO_BUCKET).remove([thumbPath]).catch(() => {});
      throw new ImageWriteError(`Upload failed: ${error.message}`, false);
    }
    return { path, thumbPath: thumb.error ? null : thumbPath };
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
      const { path, thumbPath } = await this.upload(albumId, 'cv', cover);
      await sb
        .from('albums')
        .update({ cover_url: path, cover_thumb_url: thumbPath })
        .eq('id', albumId);
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
    const { path, thumbPath } = await this.upload(albumId, 'ph', image);

    const { error } = await sb.from('photos').insert({
      album_id: albumId,
      author_id: this.userId,
      day: dayKey(),
      caption: caption?.trim() || null,
      image_path: path,
      thumb_path: thumbPath,
    });

    if (error) {
      // Clean up the orphaned uploads — the row they belonged to never landed.
      await sb.storage
        .from(PHOTO_BUCKET)
        .remove(thumbPath ? [path, thumbPath] : [path])
        .catch(() => {});
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
    const { path, thumbPath } = await this.upload(albumId, 'cv', image);
    const { error } = await sb
      .from('albums')
      .update({ cover_url: path, cover_thumb_url: thumbPath })
      .eq('id', albumId);
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

    /*
     * Avatars live under a per-user folder in the same bucket, and only ever
     * the small copy is stored: the largest an avatar is ever drawn is 72px,
     * so the full size would be several hundred kilobytes nobody ever sees.
     */
    const path = `avatars/${this.userId}/${uid('av')}.${image.ext}`;
    const { error: upErr } = await sb.storage
      .from(PHOTO_BUCKET)
      .upload(path, dataUrlToBlob(image.thumbDataUrl), {
        contentType: image.ext === 'webp' ? 'image/webp' : 'image/jpeg',
        upsert: true,
      });
    if (upErr) throw new ImageWriteError(`Upload failed: ${upErr.message}`, false);

    const { error } = await sb.from('profiles').update({ avatar_url: path }).eq('id', this.userId);
    if (error) throw new Error(error.message);
  }
}
