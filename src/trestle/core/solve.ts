// The surveyor: a bot that proves a level can be done and sets its par.
// It builds a few textbook shapes (Warren trusses, a braced band over or under
// the road, rope-hung roads, cantilever arms to the ring), keeps those that
// pass a test run with nothing snapping, then strips them: members are tried
// out one by one (least stressed first) and twigs that only ever pull are
// swapped for twine, each change kept only if the run still passes.

import { MATS, PLANK, TWIG, TWINE, costOf, geomWhy, type Mat, type Member } from './build';
import { COLS, px, py, pt, type Level } from './level';
import { WON, runSim } from './sim';

export interface Survey {
  members: Member[];
  cost: number;
  parts: number;
  /** Test runs it took. */
  sims: number;
}

class Builder {
  ms: Member[] = [];
  private seen = new Set<number>();
  constructor(private l: Level) {}
  add(a: number, b: number, mat: Mat): boolean {
    if (a === b) return false;
    const k = a < b ? a * 4096 + b : b * 4096 + a;
    if (this.seen.has(k) || geomWhy(this.l, a, b, mat)) return false;
    this.seen.add(k);
    this.ms.push({ a: Math.min(a, b), b: Math.max(a, b), mat });
    return true;
  }
  chain(ps: number[], mat: Mat): void {
    for (let i = 0; i + 1 < ps.length; i++) this.add(ps[i], ps[i + 1], mat);
  }
  nodes(): Set<number> {
    const s = new Set<number>();
    for (const m of this.ms) s.add(m.a).add(m.b);
    return s;
  }
}

const dist = (a: number, b: number) => Math.sqrt((px(a) - px(b)) ** 2 + (py(a) - py(b)) ** 2);
const ok = (p: number) => p >= 0 && p < COLS * 12;

/** Links every spare anchor to band nodes in reach (twig), and high anchors to road nodes (twine). */
function link(l: Level, b: Builder, opts: { twig: boolean; twine: boolean }): void {
  const nodes = [...b.nodes()];
  for (const an of l.anchors) {
    for (const n of nodes) {
      if (l.anchors.includes(n)) continue;
      const d = dist(an, n);
      if (opts.twig && d <= MATS[TWIG].maxLen) b.add(an, n, TWIG);
      else if (opts.twine && py(an) < py(n) && d <= MATS[TWINE].maxLen) b.add(an, n, TWINE);
    }
  }
}

export function crossCandidates(l: Level): Member[][] {
  const g = l.goal;
  if (g.kind !== 'cross') return [];
  const x0 = px(g.from), y0 = py(g.from), x1 = px(g.to), y1 = py(g.to);
  const span = x1 - x0;
  // A tilted road climbs its one step on a 2-long plank in the middle (a 1-long step is too steep).
  const mid = x0 + Math.floor(span / 2);
  const yAt = (x: number) => (y0 === y1 || x < mid ? y0 : x > mid ? y1 : Math.min(y0, y1));
  const road = (step: number) => {
    let xs: number[] = [];
    for (let x = x0; x < x1; x += step) xs.push(x);
    xs.push(x1);
    if (y0 !== y1) xs = [...new Set([...xs.filter((x) => x !== mid), mid - 1, mid + 1])].sort((a, b) => a - b);
    return xs.map((x) => pt(x, yAt(x)));
  };
  const out: Member[][] = [];
  // Warren trusses on a road of 2-long planks (any 1-long piece is braced from its neighbours).
  for (const side of [1, -1])
    for (const k of [1, 2]) {
      const b = new Builder(l);
      const deck = road(2);
      b.chain(deck, PLANK);
      const chord: number[] = [];
      const at: number[] = [];
      for (let i = 0; i + 1 < deck.length; i++) {
        const xa = px(deck[i]), xb = px(deck[i + 1]);
        if (xb - xa !== 2) {
          at.push(-1);
          continue;
        }
        const ya = py(deck[i]), yb = py(deck[i + 1]);
        const c = pt(xa + 1, (side > 0 ? Math.max(ya, yb) : Math.min(ya, yb)) + side * k);
        at.push(c);
        chord.push(c);
        b.add(deck[i], c, TWIG);
        b.add(deck[i + 1], c, TWIG);
      }
      b.chain(chord, TWIG);
      at.forEach((c, i) => {
        if (c >= 0) return;
        if (i > 0 && at[i - 1] >= 0) b.add(at[i - 1], deck[i + 1], TWIG);
        if (i + 1 < at.length && at[i + 1] >= 0) b.add(at[i + 1], deck[i], TWIG);
      });
      link(l, b, { twig: true, twine: false });
      out.push(b.ms);
    }
  // A braced band (posts and both diagonals) over or under a road of 1-long planks.
  for (const side of [1, -1])
    for (const k of [1, 2]) {
      const b = new Builder(l);
      const deck = road(1);
      b.chain(deck, PLANK);
      const chord = deck.map((d, i) => {
        if (i === 0 || i === deck.length - 1) {
          const c = d + side * k * COLS;
          return l.anchors.includes(c) ? c : d;
        }
        return d + side * k * COLS;
      });
      b.chain(chord, TWIG);
      for (let i = 0; i < deck.length; i++) {
        b.add(deck[i], chord[i], TWIG);
        if (i + 1 < deck.length) {
          b.add(deck[i], chord[i + 1], TWIG);
          b.add(chord[i], deck[i + 1], TWIG);
        }
      }
      link(l, b, { twig: true, twine: false });
      out.push(b.ms);
    }
  // Road on posts and struts from rock below, or hung from hooks above.
  for (const step of [1, 2]) {
    const b = new Builder(l);
    b.chain(road(step), PLANK);
    link(l, b, { twig: true, twine: true });
    out.push(b.ms);
  }
  return out;
}

export function reachCandidates(l: Level): Member[][] {
  const g = l.goal;
  if (g.kind !== 'reach') return [];
  const R = g.ring;
  const rx = px(R), ry = py(R);
  const out: Member[][] = [];
  // Two cords from two anchors (a V that the lantern pulls tight).
  for (const a of l.anchors)
    for (const c of l.anchors) {
      if (a >= c) continue;
      const b = new Builder(l);
      if (b.add(a, R, TWINE) && b.add(c, R, TWINE)) out.push(b.ms);
    }
  // Cantilever arms: two rails from a pair of anchors in one column, meeting at the ring.
  for (const a of l.anchors)
    for (const c of l.anchors) {
      if (px(a) !== px(c) || py(a) >= py(c) || px(a) === rx) continue;
      const n = Math.abs(rx - px(a));
      const sx = rx > px(a) ? 1 : -1;
      const upper: number[] = [];
      const lower: number[] = [];
      for (let j = 0; j <= n; j++) {
        const x = px(a) + sx * j;
        const yu = Math.round(py(a) + ((ry - py(a)) * j) / n);
        const yl = Math.round(py(c) + ((ry - py(c)) * j) / n);
        upper.push(pt(x, yu));
        // The rails stay apart until the ring, or the tip would swing on one pin.
        lower.push(pt(x, j < n ? Math.max(yu + 1, yl) : yl));
      }
      if (!upper.every(ok) || !lower.every(ok)) continue;
      // Fully braced, braced with links to other anchors, and a light zigzag (no posts).
      for (const style of ['braced', 'linked', 'zigzag'] as const) {
        const b = new Builder(l);
        b.chain(upper, TWIG);
        b.chain(lower, TWIG);
        for (let j = 0; j <= n; j++) {
          if (style !== 'zigzag') b.add(upper[j], lower[j], TWIG);
          if (j < n) {
            if (style !== 'zigzag' || j % 2 === 0) b.add(upper[j], lower[j + 1], TWIG);
            if (style !== 'zigzag' || j % 2 === 1) b.add(lower[j], upper[j + 1], TWIG);
          }
        }
        if (style === 'linked') link(l, b, { twig: true, twine: true });
        else if (!b.ms.some((m) => m.a === R || m.b === R)) continue;
        out.push(b.ms);
      }
    }
  return out;
}

const passes = (l: Level, ms: readonly Member[]) => WON.has(runSim(l, ms, true).outcome);

/** Strips a passing build: drop members (least stressed first), then swap pulling twigs for twine. */
function strip(l: Level, start: Member[], budget: { sims: number }): Member[] {
  let ms = start;
  const roadKeep = (m: Member) => l.goal.kind === 'cross' && m.mat === PLANK;
  for (let pass = 0; pass < 2; pass++) {
    const r = runSim(l, ms, true);
    budget.sims++;
    let order = ms.map((m, i) => ({ m, p: r.peak[i] })).filter((o) => !roadKeep(o.m)).sort((a, b) => a.p - b.p);
    let changed = false;
    // Members that carry next to nothing usually all go at once.
    const idle = new Set(order.filter((o) => o.p < 0.05).map((o) => o.m));
    if (idle.size > 1) {
      const next = ms.filter((x) => !idle.has(x));
      budget.sims++;
      if (passes(l, next)) {
        ms = next;
        order = order.filter((o) => !idle.has(o.m));
        changed = true;
      }
    }
    for (const { m } of order) {
      const next = ms.filter((x) => x !== m);
      budget.sims++;
      if (passes(l, next)) (ms = next), (changed = true);
    }
    // Dangling ends left behind (a member whose far peg holds nothing else) go too.
    if (!changed) break;
  }
  const r = runSim(l, ms, true);
  budget.sims++;
  const twigs = ms.map((m, i) => ({ m, f: r.minF[i] })).filter((o) => o.m.mat === TWIG && o.f > -1 && dist(o.m.a, o.m.b) <= MATS[TWINE].maxLen);
  for (const { m } of twigs) {
    const next = ms.map((x) => (x === m ? { ...x, mat: TWINE as Mat } : x));
    budget.sims++;
    if (passes(l, next)) ms = next;
  }
  return ms;
}

/** Finds a cheap clean build for a level, or null if none of its shapes holds. */
export function survey(l: Level, keep = 2): Survey | null {
  const budget = { sims: 0 };
  const cands = l.goal.kind === 'cross' ? crossCandidates(l) : reachCandidates(l);
  const good: Member[][] = [];
  for (const c of cands) {
    if (!c.length) continue;
    budget.sims++;
    if (passes(l, c)) good.push(c);
  }
  if (!good.length) return null;
  good.sort((a, b) => costOf(a) - costOf(b));
  let best: Member[] | null = null;
  for (const c of good.slice(0, keep)) {
    const s = strip(l, c, budget);
    if (!best || costOf(s) < costOf(best) || (costOf(s) === costOf(best) && s.length < best.length)) best = s;
  }
  return { members: best!, cost: costOf(best!), parts: best!.length, sims: budget.sims };
}
