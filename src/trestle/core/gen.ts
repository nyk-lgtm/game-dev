// Level generation from a seed: lay out banks, rock spires, hooks and the goal,
// then let the surveyor prove it can be done; its build sets par and the budget.
// A layout the surveyor can't do is redrawn from the next sub-seed.

import { Rng, mixSeed } from '../../shared/rng';
import { costOf, replayBuild, toActions } from './build';
import { COLS, pt, px, py, type Level, type Rock } from './level';
import { WON, runSim } from './sim';
import { survey } from './solve';

export interface GenInfo {
  /** Layouts drawn before one was proven (1 = first try). */
  tries: number;
  sims: number;
}

/** Difficulty 0..1 of the n-th level of the trail (after the tutorials). */
export const diffOf = (n: number) => Math.max(0, Math.min(1, n / 24));

const NAMES_A = ['Moss', 'Fern', 'Bramble', 'Willow', 'Acorn', 'Thistle', 'Hollow', 'Birch', 'Rowan', 'Clover', 'Sorrel', 'Mallow', 'Hazel', 'Alder', 'Bracken', 'Sedge'];
const NAMES_CROSS = ['Gap', 'Gully', 'Ford', 'Ravine', 'Crossing', 'Cut', 'Dell', 'Brook'];
const NAMES_REACH = ['Lookout', 'Ledge', 'Overhang', 'Perch', 'Beacon', 'Hook'];

function layoutCross(rng: Rng, d: number, id: string): Level {
  const span = Math.min(8, 4 + rng.int(0, 2) + Math.round(d * 3 * rng.next() + d * 1.5));
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
  const pFace = 0.65 - 0.35 * d;
  for (const [x, y] of [[xL, yL], [xR, yR]] as const)
    for (let k = 1; k <= 3; k++) if (y + k <= 10 && rng.next() < pFace / k) anchors.push(pt(x, y + k));
  // A rock spire in the middle of a long gap.
  if (span >= 6 && rng.next() < 0.55) {
    const c = xL + Math.floor(span / 2) + (span % 2 ? rng.int(0, 1) : 0);
    const top = Math.max(yL, yR) + rng.int(1, 3);
    terrain.push({ x0: c - 0.4, y0: top, x1: c + 0.4, y1: 14, kind: 'rock' });
    anchors.push(pt(c, top));
  }
  // Hooks on overhanging branches.
  if (rng.next() < 0.45 - 0.15 * d) {
    const n = rng.next() < 0.4 ? 2 : 1;
    const xs = n === 2 ? [xL + rng.int(0, 1), xR - rng.int(0, 1)] : [xL + Math.floor(span / 2) + rng.int(-1, 1)];
    for (const x of xs) anchors.push(pt(x, Math.min(yL, yR) - rng.int(3, 4)));
  }
  return {
    id,
    name: `${rng.pick(NAMES_A)} ${rng.pick(NAMES_CROSS)}`,
    terrain,
    anchors: [...new Set(anchors)],
    goal: { kind: 'cross', from: pt(xL, yL), to: pt(xR, yR), startX: xL - 1.1, startY: yL, goalX: xR + 0.7, cart: Math.round((2.3 + 1.2 * d + rng.next() * 0.4) * 10) / 10 },
    budget: 0,
    par: 0,
    parParts: 0,
  };
}

function layoutReach(rng: Rng, d: number, id: string): Level {
  const xw = rng.int(1, 3);
  const top = rng.int(2, 6);
  const terrain: Rock[] = [{ x0: -3, y0: top, x1: xw, y1: 14, kind: 'wall' }];
  // The top of the cliff and one peg at least two below it, plus a few more.
  const face = [top, rng.int(top + 2, Math.min(10, top + 4))];
  for (let y = top + 1; y <= 10; y++) if (!face.includes(y) && rng.next() < 0.3 - 0.15 * d) face.push(y);
  const anchors = face.map((y) => pt(xw, y));
  const reach = Math.min(11 - xw, 3 + Math.round(d * 2.5 + rng.next() * 1.5));
  const rx = xw + reach;
  const ry = Math.max(1, Math.min(9, rng.int(top - 1, top + 4)));
  if (rng.next() < 0.35) {
    const c = rng.int(xw + 2, Math.max(xw + 2, rx - 1));
    const st = rng.int(Math.max(ry + 2, 6), 9);
    terrain.push({ x0: c - 0.4, y0: st, x1: c + 0.4, y1: 14, kind: 'rock' });
    anchors.push(pt(c, st));
  }
  if (rng.next() < 0.3 - 0.1 * d) anchors.push(pt(rng.int(xw + 1, rx + 1), Math.max(0, ry - rng.int(3, 4))));
  const flip = rng.next() < 0.5;
  const fx = (p: number) => (flip ? pt(COLS - 1 - px(p), py(p)) : p);
  return {
    id,
    name: `${rng.pick(NAMES_A)} ${rng.pick(NAMES_REACH)}`,
    terrain: terrain.map((r) => (flip ? { ...r, x0: COLS - 1 - r.x1, x1: COLS - 1 - r.x0 } : r)),
    anchors: [...new Set(anchors.map(fx))],
    goal: { kind: 'reach', ring: fx(pt(rx, ry)), weight: Math.round((1.2 + 1.0 * d + rng.next() * 0.3) * 10) / 10 },
    budget: 0,
    par: 0,
    parParts: 0,
  };
}

/** Sets par and budget from a proven build. */
export function priceLevel(l: Level, d: number, info?: GenInfo): Level | null {
  if (l.goal.kind === 'reach') {
    // No freebies: nothing may hang the lantern straight off one anchor.
    const r = l.goal.ring;
    if (l.anchors.some((a) => px(a) === px(r) && py(a) < py(r))) return null;
  }
  const s = survey(l);
  if (info) info.sims += s?.sims ?? 0;
  if (!s || s.parts < 3) return null;
  // Round-trip through actions, so the proof is exactly what a player could build.
  const a = toActions(l, s.members);
  const b = replayBuild(l, a).members;
  if (b.length !== s.members.length || !WON.has(runSim(l, b).outcome)) return null;
  const cost = costOf(b);
  const slack = 1.45 - 0.2 * d;
  return { ...l, par: cost, parParts: b.length, budget: Math.ceil((cost * slack) / 10) * 10, ref: a };
}

/** The t-th layout drawn for a seed (later tries ease off a little). */
export function layout(seed: number, d: number, t = 0): { level: Level; d: number } {
  const rng = new Rng(mixSeed(seed, t));
  const reach = rng.next() < 0.3;
  const easy = Math.max(0, d - 0.1 * Math.floor(t / 8));
  return { level: reach ? layoutReach(rng, easy, `s${seed}`) : layoutCross(rng, easy, `s${seed}`), d: easy };
}

export function makeLevel(seed: number, d: number, info?: GenInfo): Level {
  for (let t = 0; t < 40; t++) {
    const { level: raw, d: easy } = layout(seed, d, t);
    const l = priceLevel(raw, easy, info);
    if (info) info.tries = t + 1;
    if (l) return l;
  }
  throw new Error(`no level for seed ${seed}`);
}

/** The n-th generated level of the trail (n ≥ 1), the same for everyone. */
export const trailSeed = (n: number) => mixSeed(0x7e57, n);
