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
// The diagnostics trail is pushed to Supabase best-effort. This sandbox
// blocks that host by egress policy, so the browser logs a tunnel failure
// that says nothing about the app. Anything else still counts.
const environmental = (m) =>
  /ERR_TUNNEL_CONNECTION_FAILED|ERR_PROXY_CONNECTION_FAILED|Failed to fetch/.test(m);

const results = [];
const check = (name, pass, note = '') => {
  results.push({ name, pass });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} ${name}${note ? `  — ${note}` : ''}`);
};

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => !environmental(e.message) && errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !environmental(m.text())) errors.push(m.text());
});

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
p2.on('pageerror', (e) => !environmental(e.message) && errors.push(e.message));
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

await p2.getByRole('button', { name: /Back to the start/ }).click();
await p2.waitForTimeout(400);
check('the back arrow returns to the front door', (await p2.getByRole('button', { name: /Try the demo/ }).count()) === 1);

/* ---- The nav must not leak onto screens that have no shell ---- */

{
  // Reaching the front door with a nav already declared is the case that
  // broke: the bar from the previous session stayed on the sign-in page.
  const ctx3 = await browser.newContext({ viewport: { width: 402, height: 874 } });
  const p3 = await ctx3.newPage();
  await p3.goto(`${BASE}/?sample=1`, { waitUntil: 'networkidle' });
  check('no nav on the front door', (await p3.locator('.nav').count()) === 0);

  await p3.getByRole('button', { name: /Try the demo/ }).click();
  await p3.waitForTimeout(500);
  check('no nav during onboarding', (await p3.locator('.nav').count()) === 0);

  await p3.getByRole('button', { name: 'Start' }).click();
  await p3.locator('.field__input').first().fill('Tom');
  await p3.getByRole('button', { name: 'Continue' }).click();
  await p3.waitForTimeout(400);
  await p3.getByRole('button', { name: /Skip for now/ }).click();
  await p3.waitForTimeout(800);
  check('the nav appears once inside', (await p3.locator('.nav').count()) === 1);

  // Start over: back to the front door, and the bar must go with it.
  await p3.goto(`${BASE}/profile`, { waitUntil: 'networkidle' });
  await p3.waitForTimeout(500);
  await p3.getByRole('button', { name: /Start over/ }).click();
  await p3.waitForTimeout(400);
  await p3.getByRole('button', { name: 'Clear everything', exact: true }).click();
  await p3.waitForTimeout(1000);
  check(
    'starting over returns to the front door',
    (await p3.getByRole('button', { name: /Try the demo/ }).count()) === 1,
  );
  check('…and takes the nav with it', (await p3.locator('.nav').count()) === 0);
  await ctx3.close();
}

/* ---- Diagnostics: the app has to be able to say what happened ---- */

{
  const ctx5 = await browser.newContext({ viewport: { width: 402, height: 874 } });
  const p5 = await ctx5.newPage();
  await p5.goto(BASE, { waitUntil: 'networkidle' });

  await p5.getByRole('button', { name: /^Diagnostics$/ }).click();
  await p5.waitForTimeout(400);
  check('diagnostics opens from the front door', await p5.locator('.diag').isVisible());

  const facts = (await p5.locator('.diag__facts').textContent()) ?? '';
  check('it reports whether the app is native', /native/.test(facts), facts.replace(/\s+/g, ' ').trim());

  const rows = await p5.locator('.diag__row').count();
  check('the boot step is already recorded', rows > 0, `${rows} entries`);

  const logged = await p5.evaluate(() => localStorage.getItem('opd.trail') ?? '');
  check('boot records what the build thinks it is', /"event":"boot"/.test(logged));
  check(
    'no secret is written into the trail',
    !/access_token=[A-Za-z0-9._-]{10,}|[?&]code=[A-Za-z0-9._-]{10,}/.test(logged),
  );

  await p5.getByRole('button', { name: /^Close$/ }).click();
  await p5.waitForTimeout(300);
  check('diagnostics closes again', (await p5.locator('.diag').count()) === 0);
  await ctx5.close();
}

/* ---- Reading a sign-in result out of a deep link ---- */

{
  const ctx4 = await browser.newContext();
  const p4 = await ctx4.newPage();
  await p4.goto(BASE, { waitUntil: 'networkidle' });
  const r = await p4.evaluate(async () => {
    const { parseAuthRedirect } = await import('/src/lib/native.ts');
    const S = 'com.yarinrin.onephotoday://auth';
    return {
      pkce: parseAuthRedirect(`${S}?code=abc123`),
      // The shape that used to be dropped on the floor.
      implicit: parseAuthRedirect(`${S}#access_token=tok&refresh_token=ref&token_type=bearer`),
      errQuery: parseAuthRedirect(`${S}?error=access_denied`),
      errFragment: parseAuthRedirect(`${S}#error_description=User%20said%20no`),
      plain: parseAuthRedirect(S),
      junk: parseAuthRedirect('not a url at all'),
    };
  });
  check('a PKCE link yields its code', r.pkce.code === 'abc123');
  check(
    'an implicit link yields its tokens',
    r.implicit.accessToken === 'tok' && r.implicit.refreshToken === 'ref',
    JSON.stringify(r.implicit),
  );
  check('an error in the query is read', r.errQuery.error === 'access_denied');
  check('an error in the fragment is read', r.errFragment.error === 'User said no');
  check('a bare link is not a sign-in', !r.plain.code && !r.plain.accessToken && !r.plain.error);
  check('unparseable input is survived', Object.keys(r.junk).length === 0);
  await ctx4.close();
}

check('no console or page errors', errors.length === 0, errors.slice(0, 2).join(' | '));

await browser.close();

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exit(1);
