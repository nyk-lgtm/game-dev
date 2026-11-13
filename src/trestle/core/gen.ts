// Level generation from a seed: lay out banks, rock spires, hooks and the goal,
// then let the surveyor prove it can be done; its build sets par and the budget.
// A layout the surveyor can't do is redrawn from the next sub-seed.

import { Rng, mixSeed } from '../../shared/rng';
import { costOf, replayBuild, toActions } from './build';
import { COLS, pt, px, py, ringsOf, type Level, type Rock } from './level';
import { WON, runSim } from './sim';
import { survey } from './solve';

export interface GenInfo {
  /** Layouts drawn before one was proven (1 = first try). */
  tries: number;
  sims: number;
}

/** How hard the surveyor works on generated levels (see solve.ts). */
export const SURVEY_EFFORT = 2;

/** Difficulty 0..1 of the n-th level of the trail (after the tutorials). */
export const diffOf = (n: number) => Math.max(0, Math.min(1, n / 24));

const NAMES_A = ['Moss', 'Fern', 'Bramble', 'Willow', 'Acorn', 'Thistle', 'Hollow', 'Birch', 'Rowan', 'Clover', 'Sorrel', 'Mallow', 'Hazel', 'Alder', 'Bracken', 'Sedge'];
const NAMES_CROSS = ['Gap', 'Gully', 'Ford', 'Ravine', 'Crossing', 'Cut', 'Dell', 'Brook'];
const NAMES_REACH = ['Lookout', 'Ledge', 'Overhang', 'Perch', 'Beacon', 'Hook'];

/** Gusty weather on harder levels: + blows to the right. */
function windFor(rng: Rng, d: number): number | undefined {
  if (d < 0.3 || rng.next() >= 0.15 + 0.35 * d) return undefined;
  return Math.round((0.8 + 1.4 * d) * 10 * rng.pick([-1, 1])) / 10;
}

function layoutCross(rng: Rng, d: number, id: string): Level {
  const span = Math.max(4, Math.min(8, 4 + Math.round(d * 3.5 + rng.next() * 1.5)));
  const xL = 2 + rng.int(0, 8 - span);
  const xR = xL + span;
  const yL = rng.int(5, 7);
  const tilt = d > 0.2 && rng.next() < 0.35 ? rng.pick([-1, 1]) : 0;
  const yR = yL + tilt;
  const terrain: Rock[] = [
    { x0: -3, y0: yL, x1: xL, y1: 14, kind: 'bank' },
    { x0: xR, y0: yR, x1: 15, y1: 14, kind: 'bank' },
  ];
  const anchors = [pt(xL, yL), pt(xR, yR)];
  // Fewer pegs to lean on as the trail goes on.
  const pFace = Math.max(0.1, 0.7 - 0.6 * d);
  for (const [x, y] of [[xL, yL], [xR, yR]] as const)
    for (let k = 1; k <= 3; k++) if (y + k <= 10 && rng.next() < pFace / k) anchors.push(pt(x, y + k));
  // A rock spire in the middle of a long gap, or a flat-topped island the road can rest on.
  const tips: string[] = [];
  const twist = rng.next();
  if (span >= 6 && twist < 0.5 - 0.25 * d) {
    const c = xL + Math.floor(span / 2) + (span % 2 ? rng.int(0, 1) : 0);
    const top = Math.max(yL, yR) + rng.int(1, 3);
    terrain.push({ x0: c - 0.4, y0: top, x1: c + 0.4, y1: 14, kind: 'rock' });
    anchors.push(pt(c, top));
  } else if (span >= 7 && tilt === 0 && twist < 0.62 - 0.2 * d) {
    const c = xL + Math.floor(span / 2);
    terrain.push({ x0: c - 1, y0: yL, x1: c + 1, y1: 14, kind: 'bank' });
    anchors.push(pt(c - 1, yL), pt(c + 1, yL));
    tips.push('The road can rest on the island.');
  } else if (d >= 0.25 && twist > 0.78 - 0.2 * d) {
    // Something in the way: a log low over the gap (no tall truss on top), or a rock floor close under it.
    if (rng.next() < 0.5) {
      terrain.push({ x0: xL + 1, y0: Math.min(yL, yR) - 1.65, x1: xR - 1, y1: Math.min(yL, yR) - 1.05, kind: 'log' });
      tips.push('A log lies low over the gap.');
    } else {
      terrain.push({ x0: xL, y0: Math.max(yL, yR) + 2, x1: xR, y1: 14, kind: 'floor' });
      tips.push('Rock lies close under the road.');
    }
  }
  // Hooks on overhanging branches.
  if (rng.next() < 0.45 - 0.25 * d) {
    const n = rng.next() < 0.4 ? 2 : 1;
    const xs = n === 2 ? [xL + rng.int(0, 1), xR - rng.int(0, 1)] : [xL + Math.floor(span / 2) + rng.int(-1, 1)];
    for (const x of xs) anchors.push(pt(x, Math.min(yL, yR) - rng.int(3, 4)));
  }
  const cart = Math.round((2.3 + 1.6 * d + rng.next() * 0.3) * 10) / 10;
  const wind = windFor(rng, d);
  if (cart >= 3.8) tips.push('A heavy load of acorns.');
  if (wind) tips.push(`Gusts blow from the ${wind > 0 ? 'left' : 'right'}: brace sideways too.`);
  return {
    id,
    name: `${rng.pick(NAMES_A)} ${rng.pick(NAMES_CROSS)}`,
    terrain,
    anchors: [...new Set(anchors)],
    goal: { kind: 'cross', from: pt(xL, yL), to: pt(xR, yR), startX: xL - 1.1, startY: yL, goalX: xR + 0.7, cart },
    budget: 0,
    par: 0,
    parParts: 0,
    ...(wind ? { wind } : {}),
    ...(tips.length ? { tip: `Get the cart over to the flag. ${tips.join(' ')}` } : {}),
  };
}

function layoutReach(rng: Rng, d: number, id: string): Level {
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
  if (d >= 0.35 && rng.next() < 0.45 && reach >= 4) {
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
  const wind = windFor(rng, d);
  const tips: string[] = [];
  if (rings.length > 1) tips.push('Two lanterns: put a peg on each ring.');
  if (wind) tips.push(`Gusts blow from the ${(wind > 0) !== flip ? 'left' : 'right'}: the lanterns will swing.`);
  return {
    id,
    name: `${rng.pick(NAMES_A)} ${rng.pick(NAMES_REACH)}`,
    terrain: terrain.map((r) => (flip ? { ...r, x0: COLS - 1 - r.x1, x1: COLS - 1 - r.x0 } : r)),
    anchors: [...new Set(anchors.map(fx))],
    goal: { kind: 'reach', rings: rings.map(fx), weight },
    budget: 0,
    par: 0,
    parParts: 0,
    ...(wind ? { wind: flip ? -wind : wind } : {}),
    ...(tips.length ? { tip: `Hold the lantern${rings.length > 1 ? 's' : ''} up at the ring${rings.length > 1 ? 's' : ''}. ${tips.join(' ')}` } : {}),
  };
}

/** Sets par and budget from a proven build. */
export function priceLevel(l: Level, d: number, info?: GenInfo): Level | null {
  for (const r of ringsOf(l)) {
    // No freebies: nothing may hang a lantern straight off one anchor.
    if (l.anchors.some((a) => px(a) === px(r) && py(a) < py(r))) return null;
  }
  const s = survey(l, SURVEY_EFFORT);
  if (info) info.sims += s?.sims ?? 0;
  if (!s || s.parts < 3) return null;
  // Round-trip through actions, so the proof is exactly what a player could build.
  const a = toActions(l, s.members);
  const b = replayBuild(l, a).members;
  if (b.length !== s.members.length || !WON.has(runSim(l, b).outcome)) return null;
  const cost = costOf(b);
  const slack = 1.4 - 0.25 * d;
  return { ...l, par: cost, parParts: b.length, budget: Math.ceil((cost * slack) / 10) * 10, ref: a };
}

/** The t-th layout drawn for a seed (later tries ease off a little). */
export function layout(seed: number, d: number, t = 0, kind?: 'cross' | 'reach'): { level: Level; d: number } {
  const rng = new Rng(mixSeed(seed, t));
  // The kind comes from the seed itself, so redrawn layouts keep it.
  const reach = kind ? kind === 'reach' : new Rng(seed).next() < 0.3;
  rng.next();
  const easy = Math.max(0, d - 0.1 * Math.floor(t / 8));
  return { level: reach ? layoutReach(rng, easy, `s${seed}`) : layoutCross(rng, easy, `s${seed}`), d: easy };
}

export function makeLevel(seed: number, d: number, info?: GenInfo, kind?: 'cross' | 'reach'): Level {
  for (let t = 0; t < 40; t++) {
    const { level: raw, d: easy } = layout(seed, d, t, kind);
    const l = priceLevel(raw, easy, info);
    if (info) info.tries = t + 1;
    if (l) return l;
  }
  throw new Error(`no level for seed ${seed}`);
}

/** The n-th generated level of the trail (n ≥ 1), the same for everyone. */
export const trailSeed = (n: number) => mixSeed(0x7e57, n);
