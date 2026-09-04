/**
 * End-to-end smoke test.
 *
 * Walks the real flows in a real browser against a running dev server:
 *   onboarding → create → join → upload → the daily limit → persistence,
 * plus desktop / small-phone layout and reduced-motion.
 *
 *   npm run dev            # in one terminal
 *   npm run smoke          # in another
 *
 * Pass --shots=<dir> to also write a screenshot of every screen it visits.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const shotArg = process.argv.find((a) => a.startsWith('--shots='));
const SHOTS = shotArg ? shotArg.slice('--shots='.length) : null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const failures = [];

function check(name, pass, detail = '') {
  results.push({ name, pass, detail });
  if (!pass) failures.push(name);
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
}

// A tiny real PNG, so the picker and the downscaler run for real.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAWklEQVR4nO3QMQEAAAjDMMC/56EB' +
    'HLQS6JJK7bMDXhkyzJAxw4YMG2bIsGGGDBs2zJBhwwwZNsyQYcMMGTbMkGHDDBk2zJBhwwwZNsyQ' +
    'YcMMGTbMkGHDDBk2zJDhwwsPUAABsp3ZKgAAAABJRU5ErkJggg==',
  'base64',
);
const PNG_PATH = path.join(process.env.TMPDIR ?? '/tmp', 'opd-smoke.png');
fs.writeFileSync(PNG_PATH, PNG);

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});

const shot = async (page, name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(650);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

/** Runs onboarding and lands on the home screen with the demo world seeded. */
async function onboard(page, name = 'Yarin') {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'Start' }).click();
  await page.locator('.field__input').first().fill(name);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: /Skip for now/ }).click();
  await page.waitForTimeout(800);
}

/** How many photos the signed-in user has in an album today, read from storage. */
const myPhotosToday = (page, albumName) =>
  page.evaluate((albumName) => {
    const d = JSON.parse(localStorage.getItem('opd.data.v1'));
    const album = Object.values(d.albums).find((a) => a.name === albumName);
    const n = new Date();
    const key = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    return Object.values(d.photos).filter(
      (p) => p.albumId === album.id && p.authorId === d.currentUserId && p.day === key,
    ).length;
  }, albumName);

/* ------------------------------------------------------------------ */
/* 1. Core flows                                                       */
/* ------------------------------------------------------------------ */

{
  const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await shot(page, '01-brand');
  check('onboarding shows the brand', await page.locator('.ob__tagline').isVisible());

  await onboard(page);
  await shot(page, '02-home');
  check('home lists the seeded albums', (await page.locator('.albumcard').count()) >= 4);

  // --- create ---
  await page.getByRole('button', { name: 'Create an album' }).first().click();
  await page.locator('.field__input').first().fill('Roadtrip 26');
  await page.locator('.swatch').nth(2).click();
  await page.getByRole('button', { name: /^Create album$/ }).click();
  await page.waitForTimeout(500);
  await shot(page, '03-created');
  const code = (await page.locator('.ticket__code').textContent())?.trim() ?? '';
  check('create yields an invite code', /^[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(code), code);

  await page.getByRole('button', { name: /Go to album/ }).click();
  await page.waitForTimeout(600);
  check('new album opens', await page.getByText("Add today's photo").isVisible());

  // --- join ---
  await page.goto(`${BASE}/join`, { waitUntil: 'networkidle' });
  await page.locator('.codeinput__hidden').fill('ZZZZ99');
  await page.getByRole('button', { name: /^Join album$/ }).click();
  await page.waitForTimeout(400);
  await shot(page, '04-join-bad-code');
  check('bad code is rejected', await page.getByText(/couldn't find an album/i).isVisible());

  await page.locator('.codeinput__hidden').fill('BAND77');
  await page.waitForTimeout(400);
  await shot(page, '05-join-preview');
  check('valid code previews the album', await page.getByText('Band Life').first().isVisible());

  await page.getByRole('button', { name: /^Join Band Life$/ }).click();
  await page.waitForTimeout(600);
  await shot(page, '06-joined');
  check("joining shows You're in", await page.getByText("You're in!").isVisible());

  // Joining twice must fail.
  await page.goto(`${BASE}/join`, { waitUntil: 'networkidle' });
  await page.locator('.codeinput__hidden').fill('BAND77');
  await page.waitForTimeout(400);
  check('re-joining is refused', await page.getByText(/already in Band Life/i).isVisible());

  // --- upload ---
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /Open The Boys/ }).first().click();
  await page.waitForTimeout(500);
  const before = await myPhotosToday(page, 'The Boys');

  await page.locator('.nav__shutter').click();
  await page.waitForTimeout(500);
  await page.locator('input[type=file]').first().setInputFiles(PNG_PATH);
  await page.waitForTimeout(800);
  await shot(page, '07-upload-preview');
  await page.locator('textarea').fill('found this street');
  await page.getByRole('button', { name: /^Post photo$/ }).click();
  await page.waitForTimeout(800);
  await shot(page, '08-posted');
  check('posting confirms', await page.getByText('Photo posted').isVisible());

  const after = await myPhotosToday(page, 'The Boys');
  check('the photo is stored', before === 0 && after === 1, `${before} → ${after}`);

  // --- the daily limit ---
  const albumId = await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem('opd.data.v1'));
    return Object.values(d.albums).find((a) => a.name === 'The Boys').id;
  });
  await page.goto(`${BASE}/album/${albumId}/upload`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await shot(page, '09-daily-limit');
  check(
    'a second post the same day is blocked',
    await page.getByText("You've already posted today").isVisible(),
  );

  // --- persistence ---
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  check('the photo survives a reload', (await myPhotosToday(page, 'The Boys')) === 1);

  // --- the rest of the screens ---
  await page.goto(`${BASE}/album/${albumId}/today`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await shot(page, '10-today');
  check('today shows waiting members', (await page.locator('.waiting').count()) > 0);

  await page.goto(`${BASE}/album/${albumId}/calendar`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await shot(page, '11-calendar');
  check('calendar marks days with photos', (await page.locator('.cal__cell--has').count()) > 0);

  await page.goto(`${BASE}/album/${albumId}/timeline`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await shot(page, '12-timeline');
  check('timeline stacks days', (await page.locator('.day').count()) > 1);

  await page.goto(`${BASE}/album/${albumId}/members`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await shot(page, '13-members');
  check('members list every member', (await page.locator('.member').count()) === 6);

  await page.goto(`${BASE}/album/${albumId}/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await shot(page, '14-settings');
  check('settings expose the invite code', await page.locator('.coderow__code').isVisible());

  await page.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await shot(page, '15-profile');
  check('profile lists albums', (await page.locator('.chip').count()) > 4);

  await page.goto(`${BASE}/album/does-not-exist`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  check('a missing album is handled', await page.getByText(/can't find that album/i).isVisible());

  check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 2. Layout + motion preferences                                      */
/* ------------------------------------------------------------------ */

for (const [label, opts] of [
  ['desktop 1440', { viewport: { width: 1440, height: 900 } }],
  ['phone 320', { viewport: { width: 320, height: 568 } }],
]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await onboard(page);
  if (SHOTS) await shot(page, `16-${label.replace(/\s+/g, '-')}`);
  const overflows = await page.evaluate(() => {
    const phone = document.querySelector('.phone');
    return (
      document.documentElement.scrollWidth > window.innerWidth ||
      phone.scrollWidth > phone.clientWidth
    );
  });
  check(`${label}: no horizontal overflow`, !overflows);
  await ctx.close();
}

{
  const ctx = await browser.newContext({
    viewport: { width: 402, height: 874 },
    reducedMotion: 'reduce',
  });
  const page = await ctx.newPage();
  await onboard(page);
  // With motion reduced, nothing should be sitting mid-fade.
  const settled = await page.evaluate(() =>
    [...document.querySelectorAll('.albumcard, .prompt, .nav')].every(
      (el) => getComputedStyle(el).opacity === '1',
    ),
  );
  check('reduced motion: content is not mid-animation', settled);
  await ctx.close();
}

/* ------------------------------------------------------------------ */
/* 3. The rule, at the reducer                                         */
/* ------------------------------------------------------------------ */

{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const r = await page.evaluate(async () => {
    const { reducer, newPhoto } = await import('/src/state/reducer.ts');
    const { emptyData } = await import('/src/lib/types.ts');

    let s = emptyData();
    s.currentUserId = 'me';
    s.people = { me: { id: 'me', name: 'Yarin', accent: 'pink' } };
    s.albums = {
      a1: {
        id: 'a1', name: 'A', accent: 'blue', inviteCode: 'AAAA-11',
        ownerId: 'me', createdAt: new Date().toISOString(), memberIds: ['me'],
      },
    };
    const img = { kind: 'generated', scene: 'sunset', seed: 1 };

    s = reducer(s, { type: 'postPhoto', photo: newPhoto('a1', 'me', img) });
    const first = Object.keys(s.photos).length;
    s = reducer(s, { type: 'postPhoto', photo: newPhoto('a1', 'me', img) });
    const second = Object.keys(s.photos).length;
    s = reducer(s, { type: 'postPhoto', photo: newPhoto('a1', 'stranger', img) });
    const stranger = Object.keys(s.photos).length;

    s.albums.a2 = { ...s.albums.a1, id: 'a2', name: 'B' };
    s = reducer(s, { type: 'postPhoto', photo: newPhoto('a2', 'me', img) });
    return { first, second, stranger, otherAlbum: Object.keys(s.photos).length };
  });

  check('reducer: the first photo of the day is accepted', r.first === 1);
  check('reducer: a second photo the same day is rejected', r.second === 1);
  check('reducer: non-members cannot post', r.stranger === 1);
  check('reducer: a different album is a separate frame', r.otherAlbum === 2);
  await ctx.close();
}

await browser.close();

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (failures.length) {
  console.error(`Failed: ${failures.join(', ')}`);
  process.exit(1);
}
