/**
 * Renders every icon the app ships from one source of truth: the camera mark
 * drawn below.
 *
 *   node scripts/icons.mjs
 *
 * Writes the PWA icons under `public/icons/`, and the Android launcher icons
 * and splash under `android/app/src/main/res/`. It exists because those two
 * sets used to be drawn by hand at different times and drifted — the phone
 * icon and the browser tab icon were the same drawing with different flashes.
 *
 * Rendering goes through Playwright rather than an image library so the SVG is
 * rasterised by the same engine that will display it, antialiasing and all.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const ROOT = new URL('..', import.meta.url).pathname;

const INK = '#111111';
const YELLOW = '#FFD84D';
const LENS = '#FFFDF7';
const PINK = '#FF8FA3';

/**
 * The mark, on a 100×100 canvas with nothing behind it.
 *
 * The flash sits on the camera's left rather than above the lens: at 192px the
 * two overlap into what reads as a smudge on the glass.
 */
function mark() {
  return `
    <g fill="none" stroke="${INK}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round">
      <path d="M30 30 L36 21 H58 L64 30" />
      <rect x="12" y="30" width="76" height="50" rx="10" fill="${YELLOW}" />
      <circle cx="50" cy="55" r="15" fill="${LENS}" />
      <circle cx="50" cy="55" r="6.5" fill="${YELLOW}" />
      <rect x="19" y="36" width="10" height="7" rx="2.5" fill="${PINK}" />
    </g>`;
}

/** Full icon: rounded yellow tile with the mark on it. */
function tile({ round = false, inset = 0 } = {}) {
  const s = 100 - inset * 2;
  const shape = round
    ? `<circle cx="50" cy="50" r="50" fill="${YELLOW}"/>`
    : `<rect width="100" height="100" rx="22" fill="${YELLOW}"/>`;
  return svg(`
    ${shape}
    <g transform="translate(${inset} ${inset}) scale(${s / 100})">${mark()}</g>
  `);
}

/**
 * Adaptive-icon foreground: the mark alone, transparent behind it, held inside
 * the safe circle. Android crops this to whatever shape the launcher uses, so
 * anything outside the middle ~66% can be shaved off.
 */
function foreground() {
  return svg(`<g transform="translate(21 21) scale(0.58)">${mark()}</g>`);
}

/**
 * Splash: the mark alone. The cream behind it is a colour in the layer-list at
 * `drawable/splash.xml`, not part of this bitmap — a full-screen image would
 * either stretch or letterbox on some aspect ratio, and a flat colour never
 * does either.
 */
function splashMark() {
  return svg(`<g transform="translate(6 6) scale(0.88)">${mark()}</g>`);
}

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">${body}</svg>`;
}

/** Android density buckets, as multiples of the baseline mdpi size. */
const DENSITIES = [
  ['mdpi', 1],
  ['hdpi', 1.5],
  ['xhdpi', 2],
  ['xxhdpi', 3],
  ['xxxhdpi', 4],
];

const jobs = [];
const add = (path, size, markup, transparent = true) =>
  jobs.push({ path, size, markup, transparent });

/* PWA / browser ---------------------------------------------------------- */
add('public/icons/icon-192.png', 192, tile(), false);
add('public/icons/icon-512.png', 512, tile(), false);
add('public/icons/apple-touch-icon.png', 180, tile(), false);
// Maskable icons get cropped to a circle by some launchers, so the mark is
// pulled well inside the frame and the yellow runs edge to edge.
add('public/icons/icon-maskable-512.png', 512, tile({ inset: 19 }), false);

/* Android ---------------------------------------------------------------- */
for (const [bucket, scale] of DENSITIES) {
  const res = `android/app/src/main/res/mipmap-${bucket}`;
  add(`${res}/ic_launcher.png`, Math.round(48 * scale), tile(), false);
  add(`${res}/ic_launcher_round.png`, Math.round(48 * scale), tile({ round: true }), false);
  // Foreground layers are 108dp: 72dp of visible icon plus 18dp of bleed on
  // every side for the launcher's parallax and shape masking.
  add(`${res}/ic_launcher_foreground.png`, Math.round(108 * scale), foreground(), true);
  // The launch mark is 128dp across on every screen, so it holds one physical
  // size rather than shrinking on dense displays.
  add(
    `android/app/src/main/res/drawable-${bucket}/splash_mark.png`,
    Math.round(128 * scale),
    splashMark(),
    true,
  );
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();

for (const { path, size, markup, transparent } of jobs) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${markup}`,
  );
  const png = await page.screenshot({ omitBackground: transparent });
  const out = join(ROOT, path);
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, png);
  console.log(`${path}  ${size}×${size}`);
}

await browser.close();
console.log(`\n${jobs.length} icons written.`);
