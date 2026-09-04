/**
 * Persistence layer.
 *
 * Two concerns, deliberately separated so a real backend can slot in later:
 *   - `dataStore`  — the JSON world (people, albums, photos) in localStorage.
 *   - `imageStore` — binary-ish payloads (uploads, avatars) in IndexedDB.
 *
 * Every method is async and side-effect free from the app's point of view, so
 * replacing either implementation with `fetch` calls touches nothing else.
 */

import { emptyData, type AppData, DATA_VERSION } from './types';

const DATA_KEY = 'opd.data.v1';
const DB_NAME = 'opd-images';
const DB_STORE = 'images';

/* ------------------------------------------------------------------ */
/* JSON data                                                           */
/* ------------------------------------------------------------------ */

export interface DataStore {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
  clear(): Promise<void>;
}

export const dataStore: DataStore = {
  async load() {
    try {
      const raw = localStorage.getItem(DATA_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as AppData;
      if (parsed?.version !== DATA_VERSION) return null;
      // Defensive: a half-written world is worse than a fresh one.
      if (!parsed.people || !parsed.albums || !parsed.photos) return null;
      return { ...emptyData(), ...parsed };
    } catch {
      return null;
    }
  },

  async save(data) {
    try {
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
    } catch (err) {
      console.warn('[opd] could not persist app data', err);
    }
  },

  async clear() {
    localStorage.removeItem(DATA_KEY);
  },
};

/* ------------------------------------------------------------------ */
/* Images                                                              */
/* ------------------------------------------------------------------ */

/** Raised when an image could not be written. Callers must surface this. */
export class ImageWriteError extends Error {
  /** True when the device is out of room, as opposed to a transient fault. */
  outOfSpace: boolean;

  constructor(message: string, outOfSpace: boolean) {
    super(message);
    this.name = 'ImageWriteError';
    this.outOfSpace = outOfSpace;
  }
}

export interface ImageStore {
  /**
   * Writes an image, or throws `ImageWriteError`. Resolves to `false` when the
   * image is only held in memory for this session — the caller should warn
   * that it won't survive a reload.
   */
  put(id: string, dataUrl: string): Promise<boolean>;
  get(id: string): Promise<string | null>;
  remove(id: string): Promise<void>;
  /** Every stored id, for reconciling against what the app still references. */
  keys(): Promise<string[]>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    // `indexedDB` can be absent or throw on access under strict privacy modes.
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, 1);
    } catch (err) {
      reject(err);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('image store blocked by another tab'));
  });

  // Don't cache a failure: a transient fault would otherwise disable the
  // image store for the rest of the session.
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

/** Last-resort mirror so images still resolve if IndexedDB is unavailable. */
const memoryImages = new Map<string, string>();

const isQuotaError = (err: unknown) =>
  err instanceof DOMException &&
  (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED');

export const imageStore: ImageStore = {
  async put(id, dataUrl) {
    let db: IDBDatabase;
    try {
      db = await openDb();
    } catch (err) {
      // No IndexedDB at all (private browsing, blocked site data). We can still
      // show the image this session, but the caller has to say it won't last.
      console.warn('[opd] image store unavailable; keeping in memory', err);
      memoryImages.set(id, dataUrl);
      return false;
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(dataUrl, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch (err) {
      // Losing a photo silently is the worst thing this app could do, so a
      // failed write is an error the user hears about — never a memory
      // fallback that quietly disappears on the next reload.
      if (isQuotaError(err)) {
        throw new ImageWriteError(
          "This device is out of storage, so the photo couldn't be saved.",
          true,
        );
      }
      throw new ImageWriteError("The photo couldn't be saved. Try again?", false);
    }

    memoryImages.set(id, dataUrl);
    return true;
  },

  async get(id) {
    if (memoryImages.has(id)) return memoryImages.get(id)!;
    try {
      const db = await openDb();
      const value = await new Promise<string | undefined>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).get(id);
        req.onsuccess = () => resolve(req.result as string | undefined);
        req.onerror = () => reject(req.error);
      });
      if (value) memoryImages.set(id, value);
      return value ?? null;
    } catch {
      return null;
    }
  },

  async remove(id) {
    memoryImages.delete(id);
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      /* nothing worth surfacing to the user */
    }
  },

  async keys() {
    try {
      const db = await openDb();
      return await new Promise<string[]>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readonly');
        const req = tx.objectStore(DB_STORE).getAllKeys();
        req.onsuccess = () => resolve(req.result.map(String));
        req.onerror = () => reject(req.error);
      });
    } catch {
      return [];
    }
  },
};

/**
 * Deletes stored images the app no longer references — photos removed with an
 * album, replaced covers and avatars, and drafts abandoned before posting.
 *
 * Only safe to run when nothing is mid-flow, because a picked-but-unposted
 * image is written before its record exists and would look like an orphan.
 * The app calls this once on load, which is the one moment that's guaranteed.
 */
export async function collectOrphanedImages(referenced: Set<string>): Promise<number> {
  const stored = await imageStore.keys();
  const orphans = stored.filter((id) => !referenced.has(id));
  await Promise.all(orphans.map((id) => imageStore.remove(id)));
  return orphans.length;
}
