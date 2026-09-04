/* Small shared helpers: ids, invite codes, dates, image processing. */

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function uid(prefix = ''): string {
  let out = '';
  for (let i = 0; i < 10; i++) out += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return prefix ? `${prefix}_${out}` : out;
}

/** Invite codes read aloud well: no 0/O/1/I/5/S ambiguity. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXYZ23467892346789';

export function makeInviteCode(): string {
  const draw = (n: number) =>
    Array.from({ length: n }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
  return `${draw(4)}-${draw(2)}`;
}

export const normalizeCode = (raw: string) => raw.toUpperCase().replace(/[^A-Z0-9]/g, '');

/* ---------------------------------------------------------------- */
/* Dates — everything is local-calendar `YYYY-MM-DD`                   */
/* ---------------------------------------------------------------- */

export function dayKey(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDay(key: string, delta: number): string {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + delta);
  return dayKey(d);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const monthName = (i: number) => MONTHS[i];

/** "September 4" — the way a photo album labels a page. */
export function formatDay(key: string): string {
  const d = dateFromKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function formatDayLong(key: string): string {
  const d = dateFromKey(key);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Relative label used on album cards: TODAY / YESTERDAY / 3 DAYS AGO. */
export function relativeDayLabel(key: string, today = dayKey()): string {
  if (key === today) return 'TODAY';
  if (key === shiftDay(today, -1)) return 'YESTERDAY';
  const diff = Math.round(
    (dateFromKey(today).getTime() - dateFromKey(key).getTime()) / 86_400_000,
  );
  if (diff < 0) return 'TODAY';
  if (diff < 7) return `${diff} DAYS AGO`;
  if (diff < 14) return 'LAST WEEK';
  if (diff < 60) return `${Math.round(diff / 7)} WEEKS AGO`;
  return formatDay(key).toUpperCase();
}

/** "6h 12m" until the next local midnight, when everyone's frame reopens. */
export function timeUntilTomorrow(now = new Date()): string {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((midnight.getTime() - now.getTime()) / 60000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${m}m`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/* ---------------------------------------------------------------- */
/* Images                                                             */
/* ---------------------------------------------------------------- */

/**
 * Read a picked file, downscale it and re-encode as JPEG so a few hundred
 * photos stay comfortably inside browser storage.
 */
export function fileToDataUrl(file: File, maxEdge = 1400, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error("That file isn't an image."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("We couldn't read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("We couldn't open that image."));
      img.onload = () => {
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Your browser blocked image processing.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch {
          reject(new Error("We couldn't process that image."));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Avatar initials. Single names get one letter — two crammed into a 22px
 * circle turns to mush at the sizes these are used.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Stable hash so a name always maps to the same accent. */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
