// Level generation from a seed: lay out banks, rock, hooks and the goal for one
// of several level types, then let the surveyor prove it can be done; its build
// sets par and the budget, and how many of its shapes held gives a difficulty.
// A layout the surveyor can't do is redrawn from the next sub-seed.
//
// Types (crossings): plain (a mix), hooks (branches overhead: a hung road),
// arch (pegs only low on the cliff faces, nothing above), boat (a lane under the
// road must stay clear, so no low props), convoy (two carts in a row), island
// (a flat rock mid-gap), spire (a stone pillar). Lantern types: wall (brackets
// off a cliff, maybe two rings) and gap (a lantern over the middle of a gap).
// Wind (gusts across and updraughts that lift whatever only hangs) and low
// logs / rock floors are twists on top.

import { Rng, mixSeed } from '../../shared/rng';
import { costOf, replayBuild, toActions } from './build';
import { COLS, pt, px, py, ringsOf, type Level, type Rock } from './level';
import { WON, runSim } from './sim';
import { polish, survey } from './solve';

/** Local-search steps on live levels' par builds (bounds generation time). */
export const LIVE_POLISH = 300;

export interface GenInfo {
  /** Layouts drawn before one was proven (1 = first try). */
  tries: number;
  sims: number;
}

/** How hard the surveyor works on generated levels (see solve.ts). */
export const SURVEY_EFFORT = 2;

export const LEVEL_TYPES = ['plain', 'hooks', 'arch', 'boat', 'convoy', 'island', 'spire', 'wall', 'gap'] as const;
export type LevelType = (typeof LEVEL_TYPES)[number];
export const isLantern = (t: LevelType) => t === 'wall' || t === 'gap';

/** Difficulty 0..1 of the n-th generated level when made live (past the pool). */
export const diffOf = (n: number) => Math.max(0, Math.min(1, n / 24));

const NAMES_A = ['Moss', 'Fern', 'Bramble', 'Willow', 'Acorn', 'Thistle', 'Hollow', 'Birch', 'Rowan', 'Clover', 'Sorrel', 'Mallow', 'Hazel', 'Alder', 'Bracken', 'Sedge'];
const NAMES_CROSS = ['Gap', 'Gully', 'Ford', 'Ravine', 'Crossing', 'Cut', 'Dell', 'Brook'];
const NAMES_REACH = ['Lookout', 'Ledge', 'Overhang', 'Perch', 'Beacon', 'Hook'];
/** Dailies get their own words, so a daily never shares a name with a trail level. */
const NAMES_DAILY = ['Dawn', 'Dusk', 'Firefly', 'Moonlit', 'Misty', 'Starlit', 'Dewy', 'Owl', 'Cricket', 'Ember', 'Twilight', 'Hush'];

/** A trail name (a pair no other trail level of its kind uses for the first ~100 levels). */
export function trailName(k: number, lantern: boolean): string {
  const b = lantern ? NAMES_REACH : NAMES_CROSS;
  return `${NAMES_A[k % NAMES_A.length]} ${b[(Math.floor(k / NAMES_A.length) + k) % b.length]}`;
}
export function dailyName(seed: number, lantern: boolean): string {
  const r = new Rng(seed ^ 0x5a5a);
  return `${r.pick(NAMES_DAILY)} ${r.pick(lantern ? NAMES_REACH : NAMES_CROSS)}`;
}

/** Gusty weather on harder levels: + blows to the right. */
function windFor(rng: Rng, d: number, p = 0.15 + 0.35 * d): number | undefined {
  if (d < 0.25 || rng.next() >= p) return undefined;
  return Math.round((1.2 + 1.4 * d) * 10 * rng.pick([-1, 1])) / 10;
}

const windTip = (w: number, lantern: boolean) =>
  `Gusts from the ${w > 0 ? 'left' : 'right'} and updraughts${lantern ? ' swing the lantern' : ': anything only hung will lift, so brace it'}.`;

function layoutCross(rng: Rng, d: number, id: string, type: LevelType): Level {
  const minSpan = type === 'island' ? 7 : type === 'spire' ? 6 : 4;
  const span = Math.max(minSpan, Math.min(8, 4 + Math.round(d * 3.5 + rng.next() * 1.5)));
  const xL = (type === 'convoy' ? 3 : 2) + rng.int(0, Math.max(0, 8 - span - (type === 'convoy' ? 1 : 0)));
  const xR = Math.min(10, xL + span);
  const yL = rng.int(5, 7);
  const tilt = type !== 'island' && type !== 'boat' && d > 0.2 && rng.next() < 0.3 ? 1 : 0;
  const yR = yL + tilt;
  const yLow = Math.max(yL, yR);
  const terrain: Rock[] = [
    { x0: -3, y0: yL, x1: xL, y1: 14, kind: 'bank' },
    { x0: xR, y0: yR, x1: 15, y1: 14, kind: 'bank' },
  ];
  const anchors = [pt(xL, yL), pt(xR, yR)];
  const tips: string[] = [];
  // Pegs on the cliff faces: fewer as the trail goes on; arches get only low ones.
  const pFace = Math.max(0.1, 0.7 - 0.6 * d);
  for (const [x, y] of [[xL, yL], [xR, yR]] as const) {
    if (type === 'arch') {
      anchors.push(pt(x, y + rng.int(2, 3)));
      continue;
    }
    for (let k = 1; k <= 3; k++) if (y + k <= 10 && rng.next() < pFace / k) anchors.push(pt(x, y + k));
  }
  if (type === 'spire' || (type === 'plain' && span >= 6 && rng.next() < 0.3)) {
    const c = xL + Math.floor(span / 2) + (span % 2 ? rng.int(0, 1) : 0);
    const top = yLow + rng.int(1, 3);
    terrain.push({ x0: c - 0.4, y0: top, x1: c + 0.4, y1: 14, kind: 'rock' });
    anchors.push(pt(c, top));
  }
  if (type === 'island') {
    // Islands vary: 2 or 3 wide, off centre, and sometimes a step low (posts can stand on it, the road can't).
    const wide = rng.next() < 0.4 ? 3 : 2;
    const c = xL + 2 + rng.int(0, Math.max(0, span - wide - 4));
    const low = d > 0.2 && rng.next() < 0.45;
    const top = yL + (low ? 1 : 0);
    terrain.push({ x0: c, y0: top, x1: c + wide, y1: 14, kind: 'bank' });
    anchors.push(pt(c, top), pt(c + wide, top));
    tips.push(low ? 'The island sits a step low: prop the road from it.' : 'The road can rest on the island.');
  }
  if (type === 'boat') {
    terrain.push({ x0: xL + 1, y0: yLow + 1, x1: xR - 1, y1: 14, kind: 'clear' });
    tips.push('A boat passes under: keep its lane clear.');
  }
  // Hooks on overhanging branches: always for hooks levels, sometimes on plain ones, never on arches or boats.
  if (type === 'hooks' || (type === 'plain' && rng.next() < 0.35 - 0.25 * d)) {
    const n = type === 'hooks' && rng.next() < 0.5 ? 2 : 1;
    const xs = n === 2 ? [xL + rng.int(0, 1), xR - rng.int(0, 1)] : [xL + Math.floor(span / 2) + rng.int(-1, 1)];
    for (const x of xs) anchors.push(pt(x, Math.min(yL, yR) - rng.int(3, 4)));
  }
  if ((type === 'plain' || type === 'arch') && d >= 0.25 && rng.next() < 0.3) {
    if (type === 'plain' && rng.next() < 0.5) {
      terrain.push({ x0: xL + 1, y0: Math.min(yL, yR) - 1.65, x1: xR - 1, y1: Math.min(yL, yR) - 1.05, kind: 'log' });
      tips.push('A log lies low over the gap.');
    } else {
      terrain.push({ x0: xL, y0: yLow + 2, x1: xR, y1: 14, kind: 'floor' });
      tips.push('Rock lies close under the road.');
    }
  }
  const convoy = type === 'convoy';
  const cart = Math.round((2.3 + 1.6 * d + rng.next() * 0.3) * (convoy ? 0.75 : 1) * 10) / 10;
  const wind = windFor(rng, d, type === 'hooks' ? 0.5 : undefined);
  if (convoy) tips.push('Two carts in a row.');
  else if (cart >= 3.8) tips.push('A heavy load of acorns.');
  if (wind) tips.push(windTip(wind, false));
  return {
    id,
    name: '',
    terrain,
    anchors: [...new Set(anchors)],
    goal: { kind: 'cross', from: pt(xL, yL), to: pt(xR, yR), startX: xL - 1.1, startY: yL, goalX: xR + 0.7, cart, ...(convoy ? { carts: 2 } : {}) },
    budget: 0,
    par: 0,
    parParts: 0,
    ...(wind ? { wind } : {}),
    tip: `Get the cart${convoy ? 's' : ''} over to the flag.${tips.length ? ` ${tips.join(' ')}` : ''}`,
  };
}

/** A lantern over the middle of a gap between two banks. */
function layoutGap(rng: Rng, d: number, id: string): Level {
  // Gentle ones early: a short gap, the ring level with the bank tops or just below.
  const span = Math.max(3, Math.min(8, 3 + Math.round(d * 4 + rng.next() * 1.5)));
  const xL = 2 + rng.int(0, 8 - span);
  const xR = xL + span;
  const yL = rng.int(5, 7);
  const yR = yL + (rng.next() < 0.4 ? rng.pick([-1, 1]) : 0);
  const terrain: Rock[] = [
    { x0: -3, y0: yL, x1: xL, y1: 14, kind: 'bank' },
    { x0: xR, y0: yR, x1: 15, y1: 14, kind: 'bank' },
  ];
  const anchors = [pt(xL, yL), pt(xR, yR)];
  for (const [x, y] of [[xL, yL], [xR, yR]] as const) for (let k = 1; k <= 3; k++) if (rng.next() < 0.55 - 0.35 * d) anchors.push(pt(x, y + k));
  const rx = xL + Math.floor(span / 2) + (span % 2 ? rng.int(0, 1) : 0);
  const ry = Math.min(yL, yR) + (d < 0.3 ? rng.int(0, 1) : rng.int(-2, 1));
  const weight = Math.round((1.0 + 1.2 * d + rng.next() * 0.3) * 10) / 10;
  const wind = windFor(rng, d);
  return {
    id,
    name: '',
    terrain,
    anchors: [...new Set(anchors)],
    goal: { kind: 'reach', rings: [pt(rx, ry)], weight },
    budget: 0,
    par: 0,
    parParts: 0,
    ...(wind ? { wind } : {}),
    tip: `Hang the lantern over the middle of the gap, from one bank or both.${wind ? ` ${windTip(wind, true)}` : ''}`,
  };
}

/** Lanterns on brackets off a cliff. */
function layoutWall(rng: Rng, d: number, id: string): Level {
  const xw = rng.int(1, 3);
  const top = rng.int(2, 6);
  const terrain: Rock[] = [{ x0: -3, y0: top, x1: xw, y1: 14, kind: 'wall' }];
  // The top of the cliff and one peg at least two below it, plus a few more.
  const face = [top, rng.int(top + 2, Math.min(10, top + 4))];
  for (let y = top + 1; y <= 10; y++) if (!face.includes(y) && rng.next() < 0.3 - 0.2 * d) face.push(y);
  const anchors = face.map((y) => pt(xw, y));
  const reach = Math.min(11 - xw, 3 + Math.round(d * 2.5 + rng.next() * 1.5));
  const rx = xw + reach;
  const ry = Math.max(1, Math.min(9, rng.int(top - 1, top + 4)));
  const rings = [pt(rx, ry)];
  // Two lanterns further along the trail: a second ring part way out, at another height.
  if (d >= 0.3 && rng.next() < 0.5 && reach >= 4) {
    const x2 = xw + rng.int(2, reach - 2);
    const y2 = Math.max(1, Math.min(9, ry + rng.pick([-2, -1, 1, 2])));
    rings.push(pt(x2, y2));
  }
  if (rng.next() < 0.35 - 0.15 * d) {
    const c = rng.int(xw + 2, Math.max(xw + 2, rx - 1));
    const st = rng.int(Math.max(ry + 2, 6), 9);
    terrain.push({ x0: c - 0.4, y0: st, x1: c + 0.4, y1: 14, kind: 'rock' });
    anchors.push(pt(c, st));
  }
  if (rng.next() < 0.3 - 0.15 * d) anchors.push(pt(rng.int(xw + 1, rx + 1), Math.max(0, ry - rng.int(3, 4))));
  const flip = rng.next() < 0.5;
  const fx = (p: number) => (flip ? pt(COLS - 1 - px(p), py(p)) : p);
  const weight = Math.round((1.2 + 1.0 * d + rng.next() * 0.3) * (rings.length > 1 ? 0.8 : 1) * 10) / 10;
  const w0 = windFor(rng, d);
  const wind = w0 && flip ? -w0 : w0;
  const tips: string[] = [];
  if (rings.length > 1) tips.push('Two lanterns: put a peg on each ring.');
  if (wind) tips.push(windTip(wind, true));
  return {
    id,
    name: '',
    terrain: terrain.map((r) => (flip ? { ...r, x0: COLS - 1 - r.x1, x1: COLS - 1 - r.x0 } : r)),
    anchors: [...new Set(anchors.map(fx))],
    goal: { kind: 'reach', rings: rings.map(fx), weight },
    budget: 0,
    par: 0,
    parParts: 0,
    ...(wind ? { wind } : {}),
    tip: `Hold the lantern${rings.length > 1 ? 's' : ''} up at the ring${rings.length > 1 ? 's' : ''}.${tips.length ? ` ${tips.join(' ')}` : ''}`,
  };
}

/** Sets par, budget and difficulty from a proven build. */
export function priceLevel(l: Level, d: number, info?: GenInfo): Level | null {
  for (const r of ringsOf(l)) {
    // No freebies: nothing may hang a lantern straight off one anchor.
    if (l.anchors.some((a) => px(a) === px(r) && py(a) < py(r))) return null;
  }
  const s = survey(l, SURVEY_EFFORT);
  if (info) info.sims += s?.sims ?? 0;
  if (!s) return null;
  // A short polish (the offline pool polishes far longer).
  const ms = polish(l, s.members, LIVE_POLISH, 3);
  if (ms.length < 3) return null;
  // Round-trip through actions, so the proof is exactly what a player could build.
  const a = toActions(l, ms);
  const b = replayBuild(l, a).members;
  if (b.length !== ms.length || !WON.has(runSim(l, b).outcome)) return null;
  const cost = costOf(b);
  const slack = 1.4 - 0.25 * d;
  return { ...l, par: cost, parParts: b.length, budget: Math.ceil((cost * slack) / 10) * 10, ref: a, diff: difficulty(s.ease, b.length) };
}

/**
 * How hard a level is, 0..1: mostly how few of the surveyor's textbook shapes
 * hold at all (an obvious build that works makes a level easy), plus how many
 * parts even the lean answer needs.
 */
export const difficulty = (ease: number, parts: number) => Math.round((0.65 * (1 - ease) + 0.35 * Math.min(1, Math.max(0, parts - 2) / 14)) * 1000) / 1000;

/** The type a seed picks when none is asked for (the daily, bug-report seeds). */
export function typeOf(seed: number, d: number): LevelType {
  const r = new Rng(seed).next();
  if (r < 0.15) return 'wall';
  if (r < 0.25) return 'gap';
  if (d < 0.25) return r < 0.6 ? 'plain' : r < 0.8 ? 'hooks' : 'spire';
  return LEVEL_TYPES[Math.floor(((r - 0.25) / 0.75) * 7)];
}

/** The t-th layout drawn for a seed (later tries ease off a little). */
export function layout(seed: number, d: number, t = 0, type: LevelType = typeOf(seed, d)): { level: Level; d: number } {
  const rng = new Rng(mixSeed(seed, t));
  rng.next();
  const easy = Math.max(0, d - 0.1 * Math.floor(t / 8));
  const id = `s${seed}`;
  const level = type === 'wall' ? layoutWall(rng, easy, id) : type === 'gap' ? layoutGap(rng, easy, id) : layoutCross(rng, easy, id, type);
  return { level: { ...level, type, name: `${rng.pick(NAMES_A)} ${rng.pick(isLantern(type) ? NAMES_REACH : NAMES_CROSS)}` }, d: easy };
}

export function makeLevel(seed: number, d: number, info?: GenInfo, type?: LevelType): Level {
  for (let t = 0; t < 40; t++) {
    const { level: raw, d: easy } = layout(seed, d, t, type);
    const l = priceLevel(raw, easy, info);
    if (info) info.tries = t + 1;
    if (l) return l;
  }
  throw new Error(`no level for seed ${seed}`);
}

/** The n-th generated level of the trail (n ≥ 1), the same for everyone. */
export const trailSeed = (n: number) => mixSeed(0x7e57, n);
