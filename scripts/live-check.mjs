/**
 * Live-mode end-to-end check.
 *
 * Signs in for real against the Supabase project, then drives the actual app:
 * create an album, upload a photo to the storage bucket, read it back through
 * a signed URL, and hit the daily limit. This is everything the Google flow
 * leads to — the provider only decides how you get a session; every path after
 * that is identical.
 *
 * Run this on a machine that can actually reach your Supabase project — the
 * cloud dev container this was written in blocks *.supabase.co at the network
 * policy, so it has never been executed against a live project. Treat it as
 * unproven until it goes green somewhere.
 *
 * Not part of `npm run smoke`, which is demo-only and needs no network.
 *
 * Set up a throwaway account first (Supabase → Authentication → Users → Add
 * user, with "auto confirm" ticked), then:
 *
 *   npm run dev
 *   TEST_EMAIL=you@example.com TEST_PASSWORD=... \
 *   SUPABASE_URL=https://<ref>.supabase.co \
 *   SUPABASE_ANON_KEY=sb_publishable_... \
 *   node scripts/live-check.mjs
 *
 * Email sign-in is only how this script gets a session; the app itself uses
 * Google. Everything after the token is identical either way, which is what
 * makes this a fair test of the live path.
 */

import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const EMAIL = process.env.TEST_EMAIL;
const PASSWORD = process.env.TEST_PASSWORD;
const SHOTS = process.env.SHOTS ?? null;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });

if (!EMAIL || !PASSWORD) {
  console.error('Set TEST_EMAIL and TEST_PASSWORD.');
  process.exit(1);
}

const results = [];
const fails = [];
const check = (name, pass, detail = '') => {
  results.push(name);
  if (!pass) fails.push(name);
  console.log(`${pass ? '  ok  ' : ' FAIL '} ${name}${detail ? `  — ${detail}` : ''}`);
};

const PNG_PATH = path.join(process.env.TMPDIR ?? '/tmp', 'opd-live.png');
fs.writeFileSync(
  PNG_PATH,
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAAWklEQVR4nO3QMQEAAAjDMMC/56EB' +
      'HLQS6JJK7bMDXhkyzJAxw4YMG2bIsGGGDBs2zJBhwwwZNsyQYcMMGTbMkGHDDBk2zJBhwwwZNsyQ' +
      'YcMMGTbMkGHDDBk2zJDhwwsPUAABsp3ZKgAAAABJRU5ErkJggg==',
    'base64',
  ),
);

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const shot = async (name) => {
  if (!SHOTS) return;
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
};

/* Get a real session the same way any sign-in does — a token from the auth
   endpoint — then plant it where supabase-js looks. That is precisely the
   state the app wakes up in after an OAuth redirect completes: the provider
   only decides how the token is obtained. */
const PROJECT = process.env.SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY;
const ref = new URL(PROJECT).hostname.split('.')[0];

const authRes = await fetch(`${PROJECT}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
const session = await authRes.json();

check('the auth endpoint issues a real session', Boolean(session.access_token),
  session.access_token ? `user ${session.user?.id}` : JSON.stringify(session).slice(0, 160));

if (!session.access_token) {
  await browser.close();
  process.exit(1);
}

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.evaluate(
  (args) => {
    localStorage.setItem(`sb-${args.ref}-auth-token`, JSON.stringify(args.session));
  },
  { ref, session },
);

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await shot('01-signed-in');

const onHome = await page.locator('.home__greeting').count();
check('the app boots into live mode signed in', onHome > 0, onHome ? 'home screen' : 'still on welcome');

if (onHome === 0) {
  console.log('\nPage text:', (await page.locator('body').innerText()).slice(0, 300));
  console.log('ERRORS:', errors.slice(0, 5).join(' | '));
  await browser.close();
  process.exit(1);
}

const greeting = await page.locator('.home__greeting').innerText();
check('the name comes from the account', /Test Yarin/i.test(greeting), greeting);
check('a fresh account starts empty', (await page.locator('.albumcard').count()) === 0);

/* ---- Create an album for real ---- */
await page.getByRole('button', { name: 'Create an album' }).first().click();
await page.waitForTimeout(500);
await page.locator('.field__input').first().fill('Live Test');
await page.getByRole('button', { name: /^Create album$/ }).click();
await page.waitForTimeout(2500);
await shot('02-created');

const code = (await page.locator('.ticket__code').textContent().catch(() => ''))?.trim() ?? '';
check('creating an album works against the database', /^[A-Z0-9]{4}-[A-Z0-9]{2}$/.test(code), code || 'no code shown');

if (!code) {
  console.log('\nPage text:', (await page.locator('body').innerText()).slice(0, 400));
  console.log('ERRORS:', errors.slice(0, 5).join(' | '));
}

await page.getByRole('button', { name: /Go to album/ }).click();
await page.waitForTimeout(1500);
check('the new album opens', await page.getByText("Add today's photo").isVisible().catch(() => false));

/* ---- Upload a real photo to the bucket ---- */
await page.locator('.nav__shutter').click();
await page.waitForTimeout(800);
await page.locator('input[type=file]').first().setInputFiles(PNG_PATH);
await page.waitForTimeout(1200);
await page.locator('textarea').fill('live check');
await shot('03-preview');
await page.getByRole('button', { name: /^Post photo$/ }).click();
await page.waitForTimeout(4000);
await shot('04-posted');

check('posting uploads and saves', await page.getByText('Photo posted').isVisible().catch(() => false));

/* ---- The photo must come back through a signed URL ---- */
await page.getByRole('button', { name: /See today/ }).click();
await page.waitForTimeout(3000);
await shot('05-today');

const imageOk = await page.evaluate(async () => {
  const img = document.querySelector('.gridcell img, .mounted img, .frame img');
  if (!img) return { found: false };
  if (!img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; });
  return {
    found: true,
    signed: img.src.includes('/storage/v1/'),
    rendered: img.naturalWidth > 0,
    src: img.src.slice(0, 90),
  };
});
check('the photo renders from storage', imageOk.found && imageOk.rendered,
  imageOk.found ? `${imageOk.rendered ? 'rendered' : 'BROKEN'} ${imageOk.src}` : 'no image element');
check('it came through a signed bucket URL', Boolean(imageOk.signed), imageOk.src ?? '');

/* ---- The daily limit, enforced by the real database ---- */
const albumUrl = page.url().replace(/\/today.*$/, '/upload');
await page.goto(albumUrl, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await shot('06-daily-limit');
check('a second post the same day is refused',
  await page.getByText("You've already posted today").isVisible().catch(() => false));

/* ---- Survives a reload, from the server not the browser ---- */
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await shot('07-reloaded');
check('the album is there after a reload', (await page.locator('.albumcard').count()) === 1);

check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n${results.length - fails.length}/${results.length} live checks passed`);
if (fails.length) {
  console.error('Failed: ' + fails.join(', '));
  process.exit(1);
}
