/**
 * Two things the browser can check that a phone had to tell us about:
 * that every bottom-nav button actually navigates, and that the email
 * sign-in screen renders and validates.
 *
 *   node scripts/navcheck.mjs
 *
 * The nav half exists because the bar was once dead on a real device while
 * looking perfectly fine here — the cause was Android insets, not the web
 * code, but nothing in the suite was pressing the buttons at all.
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5173';
const results = [];
const check = (name, pass, note = '') => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? `  — ${note}` : ''}`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

/* ---- The bottom nav ---- */

await page.goto(`${BASE}/?sample=1`, { waitUntil: 'networkidle' });
await page.getByRole('button', { name: /Try the demo/ }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: 'Start' }).click();
await page.locator('.field__input').first().fill('Yarin');
await page.getByRole('button', { name: 'Continue' }).click();
await page.waitForTimeout(400);
await page.getByRole('button', { name: /Skip for now/ }).click();
await page.waitForTimeout(900);

check('the nav is on the home screen', (await page.locator('.nav').count()) === 1);

// Nothing may sit on top of the bar: an overlay here would look correct and
// swallow every tap.
const covered = await page.evaluate(() => {
  const bad = [];
  for (const el of document.querySelectorAll('.nav__item, .nav__shutter')) {
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!top || !top.closest('.nav')) bad.push(el.className);
  }
  return bad;
});
check('every nav button is the topmost thing at its centre', covered.length === 0, covered.join(', '));

const tap = async (locator, label) => {
  const before = new URL(page.url()).pathname;
  await locator.click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(600);
  const after = new URL(page.url()).pathname;
  check(`tapping ${label} navigates`, before !== after, `${before} → ${after}`);
};

await tap(page.locator('.nav__item').last(), 'You');
await tap(page.locator('.nav__item').first(), 'Home');
// The shutter has its own class, so `.nav__item` is only the four tabs:
// Home, Today, Calendar, You.
await tap(page.locator('.nav__item').nth(1), 'Today');
await tap(page.locator('.nav__item').nth(2), 'Calendar');

// The shutter goes last: choosing a photo is a focused task, so Upload drops
// the nav on purpose and there would be nothing left to tap afterwards.
await tap(page.locator('.nav__shutter'), 'the shutter');
check(
  'the upload picker hides the nav',
  (await page.locator('.nav').count()) === 0,
);
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// The bar must survive a navigation without being torn down and rebuilt,
// which is what made it re-animate on every tap.
const stayed = await page.evaluate(() => {
  const nav = document.querySelector('.nav');
  if (!nav) return false;
  nav.dataset.marked = 'yes';
  return true;
});
await page.locator('.nav__item').last().click();
await page.waitForTimeout(600);
const survived = await page.evaluate(
  () => document.querySelector('.nav')?.dataset.marked === 'yes',
);
check('the nav is not rebuilt on navigation', stayed && survived);

/* ---- Email sign-in ---- */

const ctx2 = await browser.newContext({ viewport: { width: 402, height: 874 } });
const p2 = await ctx2.newPage();
p2.on('pageerror', (e) => errors.push(e.message));
await p2.goto(BASE, { waitUntil: 'networkidle' });

check(
  'the front door offers email first',
  (await p2.getByRole('button', { name: /Continue with email/ }).count()) === 1,
);

await p2.getByRole('button', { name: /Continue with email/ }).click();
await p2.waitForTimeout(400);
check('the email screen opens', (await p2.locator('.field__input').count()) >= 2);

await p2.getByRole('button', { name: /I need an account/ }).click();
await p2.waitForTimeout(300);
check(
  'creating an account also asks for a name',
  (await p2.locator('.field__input').count()) === 3,
);

// A bad address must be refused locally, without a request.
await p2.locator('.field__input').nth(0).fill('Yarin');
await p2.locator('.field__input').nth(1).fill('nope');
await p2.locator('.field__input').nth(2).fill('secret123');
await p2.getByRole('button', { name: /Create account/ }).click();
await p2.waitForTimeout(400);
check(
  'a malformed address is refused',
  (await p2.locator('.field__error').count()) > 0,
  (await p2.locator('.field__error').first().textContent())?.trim(),
);

await p2.locator('.field__input').nth(1).fill('someone@example.com');
await p2.locator('.field__input').nth(2).fill('123');
await p2.getByRole('button', { name: /Create account/ }).click();
await p2.waitForTimeout(400);
check(
  'a short password is refused',
  ((await p2.locator('.field__error').first().textContent()) ?? '').includes('six'),
);

await p2.getByRole('button', { name: /^Back$/ }).click();
await p2.waitForTimeout(400);
check('back returns to the front door', (await p2.getByRole('button', { name: /Try the demo/ }).count()) === 1);

check('no console or page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exit(1);
