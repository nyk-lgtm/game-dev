// Why a build fails, in words a player can act on: is it joined up, which pegs
// can swing (a missing diagonal, found by an infinitesimal rigidity check),
// did it fall under its own weight, which piece was too weak, or did the cart
// just roll off the road. Pure; used by the page after a run (and on its own
// for the "not joined yet" note while building).

import { MATS, PLANK, TWINE, type Member } from './build';
import { px, py, ringsOf, type Level } from './level';
import { HZ, WON, type RunResult } from './sim';

export interface Joined {
  /** Crossing: planks run unbroken from bank to bank. */
  road: boolean;
  /** Reach: every ring has a peg tied (through pieces) to an anchor. */
  rings: boolean;
  /** Members in groups that touch no anchor at all. */
  loose: number;
}

function groups(l: Level, ms: readonly Member[], only?: (m: Member) => boolean): Map<number, number> {
  const parent = new Map<number, number>();
  const find = (p: number): number => {
    let r = p;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    return r;
  };
  const add = (p: number) => !parent.has(p) && parent.set(p, p);
  for (const a of l.anchors) add(a);
  for (const m of ms) {
    if (only && !only(m)) continue;
    add(m.a);
    add(m.b);
    const ra = find(m.a);
    const rb = find(m.b);
    if (ra !== rb) parent.set(ra, rb);
  }
  const out = new Map<number, number>();
  for (const p of parent.keys()) out.set(p, find(p));
  return out;
}

export function joined(l: Level, ms: readonly Member[]): Joined {
  const all = groups(l, ms);
  const anchored = new Set(l.anchors.map((a) => all.get(a)!));
  const loose = ms.filter((m) => !anchored.has(all.get(m.a)!)).length;
  const g = l.goal;
  let road = true;
  if (g.kind === 'cross') {
    const planks = groups(l, ms, (m) => m.mat === PLANK);
    road = planks.get(g.from) === planks.get(g.to);
  }
  const rings = ringsOf(l).every((r) => all.has(r) && anchored.has(all.get(r)!));
  return { road, rings, loose };
}

/** Pegs that can move without stretching any piece (rigidity matrix null space). */
export function wobbly(l: Level, ms: readonly Member[]): Set<number> {
  const anchors = new Set(l.anchors);
  const free: number[] = [];
  const col = new Map<number, number>();
  for (const m of ms)
    for (const p of [m.a, m.b])
      if (!anchors.has(p) && !col.has(p)) {
        col.set(p, free.length);
        free.push(p);
      }
  const n = free.length * 2;
  if (!n) return new Set();
  const rows: number[][] = [];
  for (const m of ms) {
    const dx = px(m.a) - px(m.b);
    const dy = py(m.a) - py(m.b);
    const r = new Array(n).fill(0);
    const ia = col.get(m.a);
    const ib = col.get(m.b);
    if (ia !== undefined) (r[2 * ia] = dx), (r[2 * ia + 1] = dy);
    if (ib !== undefined) (r[2 * ib] = -dx), (r[2 * ib + 1] = -dy);
    rows.push(r);
  }
  // Row-reduce; free columns span the motions.
  const pivots: number[] = [];
  let rank = 0;
  for (let c = 0; c < n && rank < rows.length; c++) {
    let best = rank;
    for (let r = rank + 1; r < rows.length; r++) if (Math.abs(rows[r][c]) > Math.abs(rows[best][c])) best = r;
    if (Math.abs(rows[best][c]) < 1e-9) continue;
    [rows[rank], rows[best]] = [rows[best], rows[rank]];
    const pv = rows[rank][c];
    for (let k = c; k < n; k++) rows[rank][k] /= pv;
    for (let r = 0; r < rows.length; r++) {
      if (r === rank || Math.abs(rows[r][c]) < 1e-12) continue;
      const f = rows[r][c];
      for (let k = c; k < n; k++) rows[r][k] -= f * rows[rank][k];
    }
    pivots.push(c);
    rank++;
  }
  const isPivot = new Set(pivots);
  const moving = new Set<number>();
  for (let fc = 0; fc < n; fc++) {
    if (isPivot.has(fc)) continue;
    // Basis motion: this free coordinate 1, pivots follow.
    moving.add(free[fc >> 1]);
    pivots.forEach((pc, r) => {
      if (Math.abs(rows[r][fc]) > 1e-7) moving.add(free[pc >> 1]);
    });
  }
  return moving;
}

export type Cause = 'unjoined' | 'weight' | 'wobbly' | 'weak' | 'offroad' | 'sag' | 'won';

export interface Verdict2 {
  cause: Cause;
  text: string;
  /** The first piece to snap, if any. */
  piece: number;
  wobbly: Set<number>;
}

const article = (w: string) => (/^[aeiou]/i.test(w) ? 'an' : 'a');

/** Explains a run's result. */
export function explain(l: Level, ms: readonly Member[], r: Pick<RunResult, 'outcome' | 'firstBreak' | 'firstBreakAt' | 'minF' | 'breaks'>, force?: Float64Array): Verdict2 {
  const wob = wobbly(l, ms);
  const piece = r.firstBreak;
  if (WON.has(r.outcome)) return { cause: 'won', text: '', piece, wobbly: new Set() };
  const j = joined(l, ms);
  if (l.goal.kind === 'cross' && !j.road)
    return { cause: 'unjoined', text: 'Road not joined: the cart only rolls on planks, so lay them bank to bank with no gap.', piece, wobbly: wob };
  if (!j.rings) return { cause: 'unjoined', text: 'A ring isn’t joined to the rock: build out from an anchor to each ring.', piece, wobbly: wob };
  const name = piece >= 0 ? MATS[ms[piece].mat].name.toLowerCase() : '';
  const pulled = piece >= 0 && (force ? force[piece] >= 0 : r.minF[piece] > -1);
  if (piece >= 0 && r.firstBreakAt < HZ * 0.3)
    return {
      cause: 'weight',
      text: `Fell under its own weight: ${article(name)} ${name} (red) snapped at once. ${wob.size ? 'Ringed pegs swing: add diagonals.' : 'Make the triangles deeper.'}`,
      piece,
      wobbly: wob,
    };
  if (wob.size && (piece < 0 || r.breaks > 2))
    return { cause: 'wobbly', text: 'Wobbly shape: the ringed pegs can swing. Add diagonals so every piece is in a triangle.', piece, wobbly: wob };
  if (piece >= 0) {
    const m = ms[piece];
    const holds = MATS[m.mat].strength;
    const what =
      m.mat === TWINE
        ? `Too weak: the twine (red) holds ${holds} and was pulled harder. Share the pull or use a twig.`
        : `Too weak: ${article(name)} ${name} (red) was ${pulled ? 'pulled' : 'pushed'} past its ${holds}. Brace it, or make the triangle deeper.`;
    return { cause: 'weak', text: what, piece, wobbly: wob };
  }
  if (l.goal.kind === 'cross')
    return {
      cause: 'offroad',
      text: r.outcome === 'stalled' ? 'Cart stuck: a step in the road is too steep or it dips below the bank.' : 'Off the road: nothing snapped, but the road tipped or sagged away under the cart.',
      piece,
      wobbly: wob,
    };
  return { cause: 'sag', text: 'Sagged: nothing snapped, but the arm bends too far. Brace it deeper.', piece, wobbly: wob };
}
