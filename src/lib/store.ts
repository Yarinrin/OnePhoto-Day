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

export interface ImageStore {
  put(id: string, dataUrl: string): Promise<void>;
  get(id: string): Promise<string | null>;
  remove(id: string): Promise<void>;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/** Last-resort mirror so images still resolve if IndexedDB is unavailable. */
const memoryImages = new Map<string, string>();

export const imageStore: ImageStore = {
  async put(id, dataUrl) {
    memoryImages.set(id, dataUrl);
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(DB_STORE, 'readwrite');
        tx.objectStore(DB_STORE).put(dataUrl, id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.warn('[opd] image kept in memory only', err);
    }
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
};
