/**
 * Generated photography.
 *
 * The prototype has no network access to a photo host, and grey boxes would
 * gut a product whose whole point is the pictures. So demo photos are drawn:
 * each is a seeded, screen-printed scene rendered to an SVG data URI — warm,
 * grainy, slightly mis-registered, like a scanned disposable-camera frame.
 *
 * Deterministic in the seed, so an album looks identical across reloads while
 * costing nothing to store.
 */

const W = 900;
const H = 1200;

/** Small, fast, seeded PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;
const pick = <T,>(r: Rand, xs: T[]) => xs[Math.floor(r() * xs.length) % xs.length];
const between = (r: Rand, a: number, b: number) => a + r() * (b - a);

/* ------------------------------------------------------------------ */
/* Scene builders                                                      */
/* ------------------------------------------------------------------ */

type Scene = (r: Rand) => string;

/** Rolling silhouette band — reused for hills, dunes, treelines, waves. */
function ridge(y: number, amp: number, steps: number, r: Rand, fill: string, opacity = 1) {
  const pts: string[] = [`M -20 ${H + 20}`, `L -20 ${y}`];
  for (let i = 0; i <= steps; i++) {
    const x = (-20 + ((W + 40) * i) / steps).toFixed(1);
    const yy = (y + Math.sin(i * 0.9 + r() * 6) * amp - r() * amp * 0.5).toFixed(1);
    pts.push(`L ${x} ${yy}`);
  }
  pts.push(`L ${W + 20} ${H + 20} Z`);
  return `<path d="${pts.join(' ')}" fill="${fill}" opacity="${opacity}"/>`;
}

/** A standing human silhouette. The soul of most of these frames. */
function figure(x: number, groundY: number, h: number, fill: string, r: Rand) {
  const u = h / 8; // head-height unit
  const lean = between(r, -0.06, 0.06);
  const armOut = r() > 0.65;
  return `<g transform="translate(${x} ${groundY}) rotate(${lean * 12})" fill="${fill}">
    <circle cx="0" cy="${-h + u * 0.9}" r="${u * 0.82}"/>
    <path d="M ${-u * 0.95} ${-h + u * 2.1}
             q ${u * 0.95} ${-u * 0.55} ${u * 1.9} 0
             l ${u * 0.2} ${u * 3.1}
             q ${-u * 1.1} ${u * 0.45} ${-u * 2.3} 0 Z"/>
    ${
      armOut
        ? `<path d="M ${-u * 0.9} ${-h + u * 2.4} l ${-u * 1.5} ${-u * 1.1} l ${u * 0.5} ${-u * 0.4} l ${u * 1.5} ${u * 1.0} Z"/>`
        : `<path d="M ${-u * 0.95} ${-h + u * 2.4} l ${-u * 0.5} ${u * 2.6} l ${u * 0.55} ${u * 0.1} l ${u * 0.45} ${-u * 2.4} Z"/>`
    }
    <path d="M ${u * 0.95} ${-h + u * 2.4} l ${u * 0.5} ${u * 2.6} l ${-u * 0.55} ${u * 0.1} l ${-u * 0.45} ${-u * 2.4} Z"/>
    <path d="M ${-u * 0.8} ${-h + u * 5.1} l ${-u * 0.25} ${u * 2.9} l ${u * 0.72} 0 l ${u * 0.3} ${-u * 2.8} Z"/>
    <path d="M ${u * 0.55} ${-h + u * 5.1} l ${u * 0.35} ${u * 2.9} l ${-u * 0.72} 0 l ${-u * 0.28} ${-u * 2.8} Z"/>
  </g>`;
}

const sunset: Scene = (r) => {
  const horizon = between(r, 660, 760);
  const sunY = horizon - between(r, 40, 150);
  const sunR = between(r, 78, 108);
  const sky = pick(r, [
    ['#ffd9a0', '#f7a072', '#e2647a', '#7b4a73'],
    ['#ffe2b0', '#ffab6b', '#ec6a5c', '#6d4370'],
    ['#ffcf8f', '#f5896f', '#c9557f', '#5c3f6b'],
  ]);
  const figs = Math.floor(between(r, 3, 7));
  let people = '';
  for (let i = 0; i < figs; i++) {
    people += figure(
      between(r, 90, W - 90),
      horizon + between(r, 46, 120),
      between(r, 150, 215),
      '#2a1c2b',
      r,
    );
  }
  return `
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${sky[3]}"/>
      <stop offset="42%" stop-color="${sky[2]}"/>
      <stop offset="76%" stop-color="${sky[1]}"/>
      <stop offset="100%" stop-color="${sky[0]}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="50%">
      <stop offset="0%" stop-color="#fff4c9" stop-opacity="0.95"/>
      <stop offset="100%" stop-color="#fff4c9" stop-opacity="0"/>
    </radialGradient>
    <rect width="${W}" height="${horizon}" fill="url(#sky)"/>
    <circle cx="${W * 0.52}" cy="${sunY}" r="${sunR * 3.4}" fill="url(#glow)"/>
    <circle cx="${W * 0.52}" cy="${sunY}" r="${sunR}" fill="#fff0bd"/>
    <rect y="${horizon}" width="${W}" height="${H - horizon}" fill="${sky[1]}"/>
    <rect y="${horizon}" width="${W}" height="${H - horizon}" fill="#8d4a63" opacity="0.45"/>
    ${Array.from({ length: 16 }, (_, i) => {
      const y = horizon + 14 + i * i * 3.4;
      if (y > H) return '';
      return `<rect x="${between(r, -40, 200)}" y="${y}" width="${between(r, 200, 760)}" height="${between(r, 3, 9)}" rx="4" fill="#ffe9bd" opacity="${(0.5 - i * 0.026).toFixed(2)}"/>`;
    }).join('')}
    ${people}`;
};

const cityStreet: Scene = (r) => {
  const warm = pick(r, ['#e8c98f', '#e5b98b', '#dfc79c']);
  const wall = pick(r, ['#c98b62', '#cf9a6d', '#b87f5e', '#d6a878']);
  let buildings = '';
  let x = -40;
  while (x < W + 40) {
    const w = between(r, 130, 230);
    const top = between(r, 60, 300);
    const shade = r() > 0.5 ? wall : '#a86c52';
    buildings += `<rect x="${x}" y="${top}" width="${w}" height="${H}" fill="${shade}"/>`;
    // shuttered windows
    for (let ry = top + 70; ry < 900; ry += between(r, 120, 160)) {
      for (let cx = x + 24; cx < x + w - 44; cx += 62) {
        buildings += `<rect x="${cx}" y="${ry}" width="34" height="58" rx="4" fill="#3f2b30" opacity="${between(r, 0.5, 0.85).toFixed(2)}"/>`;
      }
    }
    x += w - 2;
  }
  let awnings = '';
  for (let i = 0; i < 3; i++) {
    const ax = between(r, 20, W - 220);
    const ay = between(r, 620, 780);
    awnings += `<path d="M ${ax} ${ay} l 190 0 l -22 66 l -146 0 Z" fill="${pick(r, ['#c4523f', '#3f6b57', '#2f5470'])}" opacity="0.92"/>`;
  }
  return `
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#8fc6d8"/>
      <stop offset="100%" stop-color="${warm}"/>
    </linearGradient>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    ${buildings}
    ${awnings}
    <rect y="960" width="${W}" height="${H - 960}" fill="#9d8a76"/>
    <rect y="960" width="${W}" height="14" fill="#6f5f51"/>
    ${figure(between(r, 200, 700), between(r, 1080, 1160), between(r, 210, 270), '#3a2a2c', r)}
    ${r() > 0.5 ? figure(between(r, 120, 780), between(r, 1020, 1100), between(r, 170, 210), '#3a2a2c', r) : ''}`;
};

const mountains: Scene = (r) => {
  const pal = pick(r, [
    ['#cfe4ea', '#8fb5c4', '#5c7f96', '#38536b'],
    ['#f2ddc4', '#c9a98f', '#8d7a72', '#4f4750'],
  ]);
  return `
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${pal[0]}"/>
      <stop offset="100%" stop-color="#f6e6cd"/>
    </linearGradient>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    <circle cx="${between(r, 200, 700)}" cy="${between(r, 160, 300)}" r="${between(r, 50, 80)}" fill="#fff6da"/>
    <path d="M -20 720 L 180 400 L 330 620 L 470 330 L 700 700 L 920 520 L 920 ${H} L -20 ${H} Z" fill="${pal[2]}"/>
    <path d="M 470 330 L 540 420 L 500 435 L 455 405 Z" fill="#fdf6e6"/>
    <path d="M 180 400 L 232 470 L 196 480 L 158 452 Z" fill="#fdf6e6"/>
    <path d="M -20 830 L 220 640 L 430 810 L 640 660 L 920 840 L 920 ${H} L -20 ${H} Z" fill="${pal[3]}"/>
    ${ridge(980, 26, 9, r, '#2f3b3c')}
    ${Array.from({ length: 22 }, () => {
      const tx = between(r, -10, W + 10);
      const ty = between(r, 985, 1080);
      const th = between(r, 60, 130);
      return `<path d="M ${tx} ${ty} l ${th * 0.26} ${th} l ${-th * 0.52} 0 Z" fill="#25302f"/>`;
    }).join('')}
    <rect y="1120" width="${W}" height="${H - 1120}" fill="#1e2726"/>`;
};

const nightLights: Scene = (r) => {
  const hue = pick(r, ['#2b2350', '#22304f', '#331f3d']);
  let lights = '';
  for (let i = 0; i < 120; i++) {
    const lx = between(r, 0, W);
    const ly = between(r, 480, H);
    const s = between(r, 3, 11);
    lights += `<circle cx="${lx}" cy="${ly}" r="${s}" fill="${pick(r, ['#ffd98a', '#ffb27a', '#fff0c2', '#ff9a9a'])}" opacity="${between(r, 0.45, 1).toFixed(2)}"/>`;
  }
  let towers = '';
  let x = -30;
  while (x < W + 30) {
    const w = between(r, 90, 170);
    const top = between(r, 420, 780);
    towers += `<rect x="${x}" y="${top}" width="${w}" height="${H}" fill="#1a1730" opacity="0.86"/>`;
    x += w + between(r, -18, 16);
  }
  return `
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#120f24"/>
      <stop offset="55%" stop-color="${hue}"/>
      <stop offset="100%" stop-color="#7a4160"/>
    </linearGradient>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    ${Array.from(
      { length: 60 },
      () =>
        `<circle cx="${between(r, 0, W)}" cy="${between(r, 0, 520)}" r="${between(r, 1, 3)}" fill="#fff8e0" opacity="${between(r, 0.3, 0.9).toFixed(2)}"/>`,
    ).join('')}
    ${towers}
    ${lights}
    <rect y="1090" width="${W}" height="${H - 1090}" fill="#0f0c1c"/>`;
};

const tableTop: Scene = (r) => {
  const cloth = pick(r, ['#d8c3a0', '#c9b191', '#e0cdae', '#bfa88c']);
  const cup = pick(r, ['#f4f0e6', '#e8dccb', '#f7e6d2']);
  const cx = between(r, 330, 570);
  const cy = between(r, 560, 680);
  return `
    <rect width="${W}" height="${H}" fill="${cloth}"/>
    <rect width="${W}" height="${H}" fill="#8a6f52" opacity="0.18"/>
    ${Array.from(
      { length: 7 },
      (_, i) =>
        `<rect x="${-40 + i * 150}" y="-40" width="26" height="${H + 80}" fill="#000" opacity="0.05"/>`,
    ).join('')}
    <ellipse cx="${cx + 26}" cy="${cy + 30}" rx="188" ry="176" fill="#5a452f" opacity="0.3"/>
    <circle cx="${cx}" cy="${cy}" r="184" fill="${cup}"/>
    <circle cx="${cx}" cy="${cy}" r="140" fill="#6b4630"/>
    <circle cx="${cx}" cy="${cy}" r="140" fill="#3a2418" opacity="0.45"/>
    <ellipse cx="${cx - 44}" cy="${cy - 48}" rx="46" ry="30" fill="#fff" opacity="0.14"/>
    <path d="M ${cx + 180} ${cy - 34} a 62 62 0 1 1 0 74" fill="none" stroke="${cup}" stroke-width="30"/>
    <g transform="translate(${between(r, 60, 180)} ${between(r, 850, 980)}) rotate(${between(r, -14, 10)})">
      <rect width="300" height="210" rx="10" fill="#f2ead9"/>
      <rect x="18" y="24" width="240" height="12" rx="6" fill="#b9ae98"/>
      <rect x="18" y="56" width="200" height="12" rx="6" fill="#b9ae98"/>
      <rect x="18" y="88" width="228" height="12" rx="6" fill="#cfc5b0"/>
    </g>
    <g transform="translate(${between(r, 620, 760)} ${between(r, 220, 330)}) rotate(${between(r, -20, 18)})">
      <path d="M 0 120 q 10 -110 60 -120 q -6 96 -60 120 Z" fill="#4f7a4a"/>
      <path d="M 0 120 q -14 -104 -66 -114 q 12 92 66 114 Z" fill="#3f6a3d"/>
      <rect x="-16" y="118" width="32" height="120" rx="8" fill="#8a6b4a"/>
    </g>`;
};

const openRoad: Scene = (r) => {
  const dune = pick(r, ['#e0a96d', '#d99a63', '#e8bb84']);
  return `
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#7cc0d8"/>
      <stop offset="70%" stop-color="#f3d8a8"/>
      <stop offset="100%" stop-color="#f7e3bd"/>
    </linearGradient>
    <rect width="${W}" height="${H}" fill="url(#sky)"/>
    ${Array.from({ length: 5 }, () => {
      const cx = between(r, 0, W);
      const cy = between(r, 120, 380);
      const s = between(r, 0.7, 1.5);
      return `<g transform="translate(${cx} ${cy}) scale(${s})" fill="#fffaf0" opacity="0.9">
        <ellipse cx="0" cy="0" rx="94" ry="42"/><ellipse cx="-62" cy="14" rx="60" ry="30"/><ellipse cx="66" cy="12" rx="66" ry="32"/></g>`;
    }).join('')}
    ${ridge(700, 34, 7, r, dune)}
    <rect y="760" width="${W}" height="${H - 760}" fill="#c89a6a"/>
    <path d="M ${W * 0.5 - 40} 760 L ${W * 0.5 + 40} 760 L ${W + 260} ${H} L ${-260} ${H} Z" fill="#4d4741"/>
    ${Array.from({ length: 8 }, (_, i) => {
      const t = i / 8;
      const y = 780 + t * t * 440;
      const w = 8 + t * 46;
      const h = 26 + t * 90;
      return `<rect x="${W / 2 - w / 2}" y="${y}" width="${w}" height="${h}" fill="#f5e7c8"/>`;
    }).join('')}
    ${Array.from({ length: 4 }, (_, i) => {
      const cx = i < 2 ? between(r, 60, 240) : between(r, 660, 850);
      const cy = between(r, 800, 1000);
      const s = between(r, 0.8, 1.5);
      return `<g transform="translate(${cx} ${cy}) scale(${s})" fill="#3f6244">
        <rect x="-16" y="-190" width="32" height="200" rx="16"/>
        <rect x="-84" y="-150" width="30" height="96" rx="15"/><rect x="-84" y="-160" width="84" height="30" rx="15"/>
        <rect x="56" y="-176" width="30" height="120" rx="15"/><rect x="6" y="-186" width="80" height="30" rx="15"/></g>`;
    }).join('')}`;
};

/** Shore and sea, looking out — the summer frame. */
const water: Scene = (r) => {
  const sea = pick(r, [
    ['#8fd8e2', '#3f9fb8', '#1f6f8c'],
    ['#a2e0d5', '#43a89e', '#227079'],
    ['#9ad2ea', '#3d92bd', '#1d5f8e'],
  ]);
  const sand = pick(r, ['#eed9b2', '#e8cfa4', '#f2e2c2']);
  const horizon = between(r, 380, 470);
  const shore = between(r, 880, 960);

  // Two swimmers, large enough to read as people at thumbnail size.
  let swimmers = '';
  for (let i = 0; i < 2; i++) {
    const sx = between(r, 170, W - 170);
    const sy = between(r, horizon + 150, shore - 120);
    // Head and shoulders only, ringed by a splash. Anything more — a raised
    // arm, say — turns into a smudge at thumbnail size.
    const s = 0.85 + (sy - horizon) / 900;
    swimmers += `<g transform="translate(${sx} ${sy}) scale(${s})">
      <ellipse cx="0" cy="22" rx="70" ry="16" fill="#ffffff" opacity="0.55"/>
      <ellipse cx="0" cy="20" rx="46" ry="10" fill="#ffffff" opacity="0.7"/>
      <circle cx="0" cy="-4" r="22" fill="#2f2529"/>
      <path d="M -36 12 q 36 -24 72 0 l -6 14 q -30 11 -60 0 Z" fill="#2f2529"/>
    </g>`;
  }

  let parasols = '';
  for (let i = 0; i < 2; i++) {
    const px = between(r, 90, W - 90);
    const py = shore + between(r, 60, 210);
    const col = pick(r, ['#e2614f', '#f2b03c', '#5c9ec4']);
    parasols += `<g transform="translate(${px} ${py})">
      <rect x="-4" y="-108" width="8" height="112" rx="4" fill="#8a6b4a"/>
      <path d="M -84 -102 q 84 -74 168 0 Z" fill="${col}"/>
      <path d="M -84 -102 q 42 -37 84 0 Z" fill="#fdf6e6" opacity="0.65"/>
    </g>`;
  }

  return `
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#bfe6f2"/>
      <stop offset="100%" stop-color="#f2e8cf"/>
    </linearGradient>
    <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${sea[2]}"/>
      <stop offset="45%" stop-color="${sea[1]}"/>
      <stop offset="100%" stop-color="${sea[0]}"/>
    </linearGradient>
    <rect width="${W}" height="${horizon}" fill="url(#sky)"/>
    <circle cx="${between(r, 120, 760)}" cy="${between(r, 90, 240)}" r="${between(r, 46, 72)}" fill="#fff6d8"/>
    <rect y="${horizon}" width="${W}" height="${shore - horizon}" fill="url(#wg)"/>
    ${Array.from({ length: 26 }, () => {
      const y = between(r, horizon + 12, shore - 20);
      return `<rect x="${between(r, -60, W)}" y="${y}" width="${between(r, 110, 420)}" height="${between(r, 4, 11)}" rx="6" fill="#eafaff" opacity="${between(r, 0.18, 0.5).toFixed(2)}"/>`;
    }).join('')}
    ${swimmers}
    <path d="M -20 ${shore} q 225 ${between(r, -34, 12)} 460 ${between(r, -8, 22)} t 480 ${between(r, -18, 14)} L ${W + 20} ${H} L -20 ${H} Z" fill="#f7f3e6"/>
    <path d="M -20 ${shore + 26} q 225 ${between(r, -24, 16)} 460 ${between(r, -4, 24)} t 480 ${between(r, -14, 16)} L ${W + 20} ${H} L -20 ${H} Z" fill="${sand}"/>
    ${parasols}
    ${Array.from(
      { length: 30 },
      () =>
        `<circle cx="${between(r, 0, W)}" cy="${between(r, shore + 20, H)}" r="${between(r, 2, 6)}" fill="#c9ab7e" opacity="${between(r, 0.2, 0.5).toFixed(2)}"/>`,
    ).join('')}`;
};

const stage: Scene = (r) => {
  const beam = pick(r, ['#ff7aa8', '#ffb24d', '#7ad0ff', '#c48bff']);
  let beams = '';
  for (let i = 0; i < 5; i++) {
    const ox = between(r, 100, 800);
    beams += `<path d="M ${ox} -40 L ${ox + between(r, -420, 420)} ${H} L ${ox + between(r, -520, 520)} ${H} Z" fill="${pick(r, [beam, '#ffffff', '#ff5f8d'])}" opacity="${between(r, 0.07, 0.2).toFixed(2)}"/>`;
  }
  let crowd = '';
  for (let i = 0; i < 26; i++) {
    const cx = between(r, -20, W + 20);
    const cy = between(r, 1050, 1230);
    const s = between(r, 0.5, 0.95);
    crowd += `<g transform="translate(${cx} ${cy}) scale(${s})" fill="#0d0a12">
      <circle cx="0" cy="-96" r="42"/><path d="M -54 -48 q 54 -30 108 0 l 14 160 l -136 0 Z"/></g>`;
  }
  return `
    <radialGradient id="hall" cx="50%" cy="34%">
      <stop offset="0%" stop-color="#4a2f56"/>
      <stop offset="100%" stop-color="#140d1c"/>
    </radialGradient>
    <rect width="${W}" height="${H}" fill="url(#hall)"/>
    ${beams}
    <ellipse cx="${W / 2}" cy="640" rx="260" ry="180" fill="${beam}" opacity="0.28"/>
    ${figure(W / 2 + between(r, -70, 70), 880, 330, '#0a0710', r)}
    <rect x="${W / 2 - 200}" y="880" width="400" height="18" rx="9" fill="#0a0710"/>
    ${crowd}`;
};

const forest: Scene = (r) => {
  const light = pick(r, ['#dfe9b8', '#cfe4a8', '#e6ecc0']);
  let trunks = '';
  for (let i = 0; i < 12; i++) {
    const tx = between(r, -30, W + 30);
    const w = between(r, 26, 76);
    trunks += `<rect x="${tx}" y="${between(r, -80, 60)}" width="${w}" height="${H}" fill="#3d4a2c" opacity="${between(r, 0.55, 0.95).toFixed(2)}"/>`;
  }
  return `
    <linearGradient id="fg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${light}"/>
      <stop offset="60%" stop-color="#7d9455"/>
      <stop offset="100%" stop-color="#41522f"/>
    </linearGradient>
    <rect width="${W}" height="${H}" fill="url(#fg)"/>
    ${Array.from({ length: 6 }, () => {
      const bx = between(r, -100, W);
      return `<path d="M ${bx} -60 L ${bx + 260} ${H} L ${bx + 400} ${H} L ${bx + 130} -60 Z" fill="#f7f2c8" opacity="${between(r, 0.08, 0.2).toFixed(2)}"/>`;
    }).join('')}
    ${trunks}
    <rect y="1080" width="${W}" height="${H - 1080}" fill="#33421f"/>
    ${Array.from(
      { length: 40 },
      () =>
        `<circle cx="${between(r, 0, W)}" cy="${between(r, 200, H)}" r="${between(r, 3, 9)}" fill="#fdf8c9" opacity="${between(r, 0.2, 0.6).toFixed(2)}"/>`,
    ).join('')}`;
};

const snow: Scene = (r) => `
    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#b8cfe0"/>
      <stop offset="60%" stop-color="#e4eef4"/>
      <stop offset="100%" stop-color="#f6f2ea"/>
    </linearGradient>
    <rect width="${W}" height="${H}" fill="url(#sg)"/>
    <path d="M -20 640 L 200 340 L 400 600 L 560 400 L 920 700 L 920 ${H} L -20 ${H} Z" fill="#9fb3c6"/>
    ${ridge(820, 22, 8, r, '#f2f6f8')}
    ${Array.from({ length: 16 }, () => {
      const tx = between(r, -20, W + 20);
      const ty = between(r, 840, 1120);
      const th = between(r, 70, 170);
      return `<g><path d="M ${tx} ${ty} l ${th * 0.3} ${th} l ${-th * 0.6} 0 Z" fill="#2f4437"/>
        <path d="M ${tx} ${ty + th * 0.16} l ${th * 0.19} ${th * 0.3} l ${-th * 0.38} 0 Z" fill="#f4f8fa" opacity="0.75"/></g>`;
    }).join('')}
    ${Array.from(
      { length: 90 },
      () =>
        `<circle cx="${between(r, 0, W)}" cy="${between(r, 0, H)}" r="${between(r, 2, 8)}" fill="#fff" opacity="${between(r, 0.4, 1).toFixed(2)}"/>`,
    ).join('')}
    ${figure(between(r, 250, 650), between(r, 1080, 1160), between(r, 190, 240), '#c2493f', r)}`;

const SCENES: Record<string, Scene> = {
  sunset,
  cityStreet,
  mountains,
  nightLights,
  tableTop,
  openRoad,
  water,
  stage,
  forest,
  snow,
};

export const SCENE_KEYS = Object.keys(SCENES);

/* ------------------------------------------------------------------ */
/* Render                                                              */
/* ------------------------------------------------------------------ */

const cache = new Map<string, string>();

/**
 * Render a scene to an SVG data URI. Grain, halation and a vignette are
 * applied over every scene so the whole library shares one film stock.
 */
export function renderScene(sceneKey: string, seed: number): string {
  const key = `${sceneKey}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const build = SCENES[sceneKey] ?? sunset;
  const r = rng(seed || 1);
  const body = build(r);
  const grainSeed = seed % 97;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="${grainSeed}" result="n"/>
      <feColorMatrix in="n" type="saturate" values="0"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.16"/></feComponentTransfer>
    </filter>
    <radialGradient id="vig" cx="50%" cy="46%" r="76%">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#2a1a10" stop-opacity="0.42"/>
    </radialGradient>
  </defs>
  ${body}
  <rect width="${W}" height="${H}" fill="#ffb877" opacity="0.07"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <rect width="${W}" height="${H}" filter="url(#grain)" opacity="0.55"/>
</svg>`;

  const uri = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.replace(/\s{2,}/g, ' '))}`;
  cache.set(key, uri);
  return uri;
}
