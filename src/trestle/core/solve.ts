// The surveyor: a bot that proves a level can be done and sets its par.
// It builds textbook shapes (Warren trusses and braced bands over or under the
// road, roads on struts from the rock or hung from hooks, cantilever arms and
// cord Vs to the rings), each on roads of 1- or 2-long planks in both
// alignments, keeps those that pass a test run with nothing snapping, then
// strips the cheapest: members go one by one (least stressed first, then by
// cost, then in shuffled orders), twigs that only ever pull become twine, a few
// removed members are put back and it strips again (a small local search), and
// a road peg held by nothing but its two planks is merged into one plank.

import { Rng } from '../../shared/rng';
import { MATS, PLANK, TWIG, TWINE, costOf, geomWhy, lenOf, looseOf, type Mat, type Member } from './build';
import { COLS, ROWS, px, py, pt, type Level } from './level';
import { WON, runSim } from './sim';

export interface Survey {
  members: Member[];
  cost: number;
  parts: number;
  /** Test runs it took. */
  sims: number;
  /** Share of its textbook shapes that held (1 = anything obvious works). */
  ease: number;
}

class Builder {
  ms: Member[] = [];
  private seen = new Set<number>();
  constructor(private l: Level) {}
  add(a: number, b: number, mat: Mat): boolean {
    if (a === b || a < 0 || b < 0 || a >= COLS * ROWS || b >= COLS * ROWS) return false;
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

const ok = (p: number) => p >= 0 && p < COLS * ROWS;

/** Links spare anchors to nodes in reach: twigs within twig length, twine from above. */
function link(l: Level, b: Builder, opts: { twig: boolean; twine: boolean }): void {
  const nodes = [...b.nodes()];
  for (const an of l.anchors) {
    for (const n of nodes) {
      if (l.anchors.includes(n)) continue;
      const d = lenOf(an, n);
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
  /** Road pegs: every `step`, starting with a 1-long plank when `shift`. */
  const road = (step: number, shift = false) => {
    let xs: number[] = [x0];
    for (let x = x0 + (shift ? 1 : step); x < x1; x += step) xs.push(x);
    xs.push(x1);
    if (y0 !== y1) xs = [...new Set([...xs.filter((x) => x !== mid), mid - 1, mid + 1])].sort((a, b) => a - b);
    return xs.map((x) => pt(x, yAt(x)));
  };
  const roads = [road(2), road(2, true), road(1)];
  const out: Member[][] = [];
  // Warren trusses: a chord peg over or under the middle of each 2-long plank.
  for (const deck of roads.slice(0, 2))
    for (const side of [1, -1])
      for (const k of [1, 2]) {
        const b = new Builder(l);
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
        link(l, b, { twig: true, twine: true });
        out.push(b.ms);
      }
  // A braced band (posts and both diagonals) over or under a road of 1-long planks.
  for (const side of [1, -1])
    for (const k of [1, 2]) {
      const b = new Builder(l);
      const deck = roads[2];
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
      link(l, b, { twig: true, twine: true });
      out.push(b.ms);
    }
  // Roads on struts from the rock below, or hung from hooks above.
  for (const deck of roads) {
    const b = new Builder(l);
    b.chain(deck, PLANK);
    link(l, b, { twig: true, twine: true });
    out.push(b.ms);
    // The same with a small triangle under each road peg.
    const t = new Builder(l);
    t.chain(deck, PLANK);
    for (let i = 1; i + 1 < deck.length; i++) {
      const c = deck[i] + COLS;
      t.add(deck[i - 1], c, TWIG);
      t.add(deck[i], c, TWIG);
      t.add(deck[i + 1], c, TWIG);
    }
    link(l, t, { twig: true, twine: true });
    out.push(t.ms);
  }
  return out.filter((c) => c.length);
}

/** Shapes holding one ring. */
function ringShapes(l: Level, R: number): Member[][] {
  const rx = px(R), ry = py(R);
  const out: Member[][] = [];
  // Two cords from two anchors (a V that the lantern pulls tight), or a cord and a strut.
  for (const a of l.anchors)
    for (const c of l.anchors) {
      if (a >= c) continue;
      for (const [ma, mc] of [[TWINE, TWINE], [TWIG, TWINE], [TWINE, TWIG], [TWIG, TWIG]] as const) {
        const b = new Builder(l);
        if (b.add(a, R, ma) && b.add(c, R, mc)) out.push(b.ms);
      }
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
      // A Warren arm: pegs alternate between the rails a column apart, chords two apart (fewer, longer pieces).
      const zig: number[] = [];
      for (let j = 0; j <= n; j++) zig.push(j === n ? R : j % 2 ? lower[j] : upper[j]);
      const w = new Builder(l);
      w.chain(zig, TWIG);
      w.add(c, zig[1], TWIG);
      for (let j = 0; j + 2 <= n; j++) w.add(zig[j], zig[j + 2], TWIG) || w.add(zig[j], zig[j + 2], TWINE);
      if (w.ms.some((m) => m.a === R || m.b === R)) out.push(w.ms);
    }
  // Cable-stayed arms: a strut rail from a lower anchor out to the ring (pegs every one or two columns),
  // held up by cords from every anchor above it that reaches.
  for (const c of l.anchors)
    for (const step of [1, 2]) {
      if (px(c) === rx) continue;
      const n = Math.abs(rx - px(c));
      const sx = rx > px(c) ? 1 : -1;
      const rail: number[] = [c];
      for (let j = step; j < n; j += step) rail.push(pt(px(c) + sx * j, Math.round(py(c) + ((ry - py(c)) * j) / n)));
      rail.push(R);
      const b = new Builder(l);
      for (let i = 0; i + 1 < rail.length; i++) b.add(rail[i], rail[i + 1], TWIG) || b.add(rail[i], rail[i + 1], PLANK);
      for (const a of l.anchors) for (const p of rail.slice(1)) if (py(a) < py(p)) b.add(a, p, TWINE);
      if (b.ms.some((m) => m.a === R || m.b === R)) out.push(b.ms);
    }
  return out;
}

export function reachCandidates(l: Level): Member[][] {
  const g = l.goal;
  if (g.kind !== 'reach') return [];
  if (g.rings.length === 1) return ringShapes(l, g.rings[0]);
  // Several rings: the cheapest shapes that hold each ring alone, put together.
  const per = g.rings.map((r) => {
    const solo: Level = { ...l, goal: { ...g, rings: [r] } };
    return ringShapes(solo, r)
      .sort((a, b) => costOf(a) - costOf(b))
      .filter((c) => passes(solo, c))
      .slice(0, 3);
  });
  let combos: Member[][] = [[]];
  for (const list of per) combos = combos.flatMap((c) => list.map((x) => merge(c, x)));
  // Or hang the next ring off the first one's arm: its pegs act as anchors for the second ring's shapes.
  if (g.rings.length === 2)
    for (const [i, j] of [[0, 1], [1, 0]])
      for (const sa of per[i].slice(0, 2)) {
        const held = new Set<number>(l.anchors);
        for (const m of sa) held.add(m.a).add(m.b);
        const virt: Level = { ...l, anchors: [...held], goal: { ...g, rings: [g.rings[j]] } };
        for (const sb of ringShapes(virt, g.rings[j]).sort((a, b) => costOf(a) - costOf(b)).slice(0, 8)) combos.push(merge(sa, sb));
      }
  return combos;
}

function merge(a: Member[], b: Member[]): Member[] {
  const seen = new Set(a.map((m) => `${m.a}:${m.b}`));
  return [...a, ...b.filter((m) => !seen.has(`${m.a}:${m.b}`))];
}

const passes = (l: Level, ms: readonly Member[]) => WON.has(runSim(l, ms, true).outcome);
const better = (a: Member[], b: Member[] | null) => !b || costOf(a) < costOf(b) || (costOf(a) === costOf(b) && a.length < b.length);

type Order = 'stress' | 'cost' | 'shuffle';
/** Test runs used, and the most allowed (a bound on generation time). */
interface Count {
  sims: number;
  cap: number;
}

/** One stripping pass: tries each removable member out once, in the given order. */
function stripOnce(l: Level, start: Member[], order: Order, rng: Rng, n: Count): Member[] {
  let ms = start;
  const keep = (m: Member) => l.goal.kind === 'cross' && m.mat === PLANK;
  const r = runSim(l, ms, true);
  n.sims++;
  let list = ms.map((m, i) => ({ m, p: r.peak[i], c: lenOf(m.a, m.b) * MATS[m.mat].cost })).filter((o) => !keep(o.m));
  if (order === 'stress') list.sort((a, b) => a.p - b.p);
  else if (order === 'cost') list.sort((a, b) => b.c - a.c || a.p - b.p);
  else rng.shuffle(list);
  // Members that carry next to nothing usually all go at once.
  const idle = new Set(list.filter((o) => o.p < 0.05).map((o) => o.m));
  if (idle.size > 1) {
    const next = ms.filter((x) => !idle.has(x));
    n.sims++;
    if (passes(l, next)) {
      ms = next;
      list = list.filter((o) => !idle.has(o.m));
    }
  }
  for (const { m } of list) {
    if (n.sims >= n.cap) break;
    const next = ms.filter((x) => x !== m);
    n.sims++;
    if (passes(l, next)) ms = next;
  }
  return ms;
}

/** Twigs that never pushed become twine; lone road pegs merge into one plank. */
function tidy(l: Level, start: Member[], n: Count): Member[] {
  let ms = start;
  const r = runSim(l, ms, true);
  n.sims++;
  const twigs = ms.filter((m, i) => m.mat === TWIG && r.minF[i] > -1);
  for (const m of twigs) {
    if (n.sims >= n.cap) break;
    const next = ms.map((x) => (x === m ? { ...x, mat: TWINE as Mat } : x));
    n.sims++;
    if (passes(l, next)) ms = next;
  }
  // A road peg held only by two planks in a line: one plank instead.
  for (let tries = 0; tries < 6; tries++) {
    const deg = new Map<number, Member[]>();
    for (const m of ms) for (const p of [m.a, m.b]) deg.set(p, [...(deg.get(p) ?? []), m]);
    let done = true;
    for (const [p, list] of deg) {
      if (list.length !== 2 || l.anchors.includes(p) || !list.every((m) => m.mat === PLANK)) continue;
      const [u, v] = list.map((m) => (m.a === p ? m.b : m.a));
      if ((px(u) - px(p)) * (py(v) - py(p)) !== (py(u) - py(p)) * (px(v) - px(p))) continue;
      if (geomWhy(l, u, v, PLANK)) continue;
      const next = [...ms.filter((m) => !list.includes(m)), { a: Math.min(u, v), b: Math.max(u, v), mat: PLANK as Mat }];
      n.sims++;
      if (passes(l, next)) {
        ms = next;
        done = false;
        break;
      }
    }
    if (done) break;
  }
  return ms;
}

/** Finds a cheap clean build for a level, or null if none of its shapes holds. */
export function survey(l: Level, effort = 1, cap = 160 + 120 * effort): Survey | null {
  const n: Count = { sims: 0, cap };
  const rng = new Rng(0x5eed);
  const cands = l.goal.kind === 'cross' ? crossCandidates(l) : reachCandidates(l);
  const good: Member[][] = [];
  for (const c of cands) {
    n.sims++;
    if (passes(l, c)) good.push(c);
  }
  if (!good.length) return null;
  good.sort((a, b) => costOf(a) - costOf(b));
  let best: Member[] | null = null;
  const tried = new Set<string>();
  const sig = (ms: Member[]) => ms.map((m) => `${m.a}:${m.b}:${m.mat}`).sort().join(',');
  for (const c of good.slice(0, 2 + effort)) {
    const orders: Order[] = effort > 1 ? ['stress', 'cost', 'shuffle'] : ['stress', 'cost'];
    for (const o of orders) {
      if (n.sims >= cap) break;
      const s = tidy(l, stripOnce(l, c, o, rng, n), n);
      if (tried.has(sig(s))) continue;
      tried.add(sig(s));
      if (better(s, best)) best = s;
    }
  }
  // Local search: put back a few members of the richest shape near the best and strip again.
  const pool = good.reduce((a, b) => merge(a, b), [] as Member[]);
  for (let k = 0; k < 3 * effort && n.sims < cap; k++) {
    const have = new Set(best!.map((m) => `${m.a}:${m.b}`));
    const spare = pool.filter((m) => !have.has(`${m.a}:${m.b}`));
    if (!spare.length) break;
    const add = rng.shuffle([...spare]).slice(0, 2 + (k % 3));
    const start = [...best!, ...add];
    n.sims++;
    if (!passes(l, start)) continue;
    const s = tidy(l, stripOnce(l, start, k % 2 ? 'shuffle' : 'cost', rng, n), n);
    if (better(s, best)) best = s;
  }
  return { members: best!, cost: costOf(best!), parts: best!.length, sims: n.sims, ease: good.length / Math.max(1, cands.length) };
}

/**
 * Polishes a passing build by a seeded local search (the offline pool uses it,
 * so par is near what a clever player finds): each step removes one or two
 * pieces, maybe swaps a twig for twine (or back), maybe adds a piece or two
 * between pegs or out to a grid point in reach; a step is kept when the build
 * still passes cleanly and costs no more (a little more early on, to get out of
 * corners). Pieces with a free end are dropped at the end.
 */
export function polish(l: Level, start: Member[], iters: number, seed = 1): Member[] {
  const rng = new Rng(seed);
  const cross = l.goal.kind === 'cross';
  const rings = l.goal.kind === 'reach' ? l.goal.rings : [];
  let cur = start;
  let best = start;
  const score = (ms: Member[]) => costOf(ms) + ms.length * 0.5;
  const keyOf = (m: Member) => (m.a < m.b ? m.a * 4096 + m.b : m.b * 4096 + m.a);
  for (let it = 0; it < iters; it++) {
    const slack = it < (iters * 2) / 3 ? 14 * (1 - (1.5 * it) / iters) : 0;
    let next: (Member | null)[] = [...cur];
    // Remove one or two (never the road planks of a crossing).
    const removable = cur.map((_, i) => i).filter((i) => !(cross && cur[i].mat === PLANK));
    const k = rng.next() < 0.6 ? 1 : 2;
    for (let r = 0; r < k && removable.length; r++) next[removable.splice(Math.floor(rng.next() * removable.length), 1)[0]] = null;
    let ms = next.filter((m): m is Member => m !== null);
    if (rng.next() < 0.3 && ms.length) {
      const i = Math.floor(rng.next() * ms.length);
      const m = ms[i];
      if (m.mat === TWIG && lenOf(m.a, m.b) <= MATS[TWINE].maxLen) ms[i] = { ...m, mat: TWINE };
      else if (m.mat === TWINE && lenOf(m.a, m.b) <= MATS[TWIG].maxLen) ms[i] = { ...m, mat: TWIG };
    }
    // Add a piece between two pegs (anchors, rings, member ends), or a new peg braced to two of them.
    const ps = new Set<number>([...l.anchors, ...rings]);
    for (const m of ms) ps.add(m.a).add(m.b);
    const list = [...ps];
    const add = (a: number, b: number): boolean => {
      if (b < 0 || b >= COLS * ROWS || a === b || Math.abs(px(b) - px(a)) > 4) return false;
      const len = lenOf(a, b);
      const mat: Mat = len > MATS[TWIG].maxLen + 1e-9 || rng.next() < 0.35 ? TWINE : TWIG;
      if (geomWhy(l, a, b, mat)) return false;
      const kb = keyOf({ a, b, mat });
      if (ms.some((m) => keyOf(m) === kb)) return false;
      ms = [...ms, { a: Math.min(a, b), b: Math.max(a, b), mat }];
      return true;
    };
    const roll = rng.next();
    if (roll < 0.35) add(list[Math.floor(rng.next() * list.length)], list[Math.floor(rng.next() * list.length)]);
    else if (roll < 0.85) {
      const a = list[Math.floor(rng.next() * list.length)];
      const g = pt(px(a) + rng.int(-2, 2), py(a) + rng.int(-2, 2));
      if (g >= 0 && g < COLS * ROWS && !ps.has(g) && Math.abs(px(g) - px(a)) <= 2) {
        const near = list.filter((q) => q !== a && lenOf(q, g) <= MATS[TWINE].maxLen);
        if (near.length && add(a, g)) add(near[Math.floor(rng.next() * near.length)], g);
      }
    }
    if (score(ms) > score(cur) + slack) continue;
    if (!passes(l, ms)) continue;
    cur = ms;
    if (score(cur) < score(best)) best = cur;
  }
  // No free ends in a par build (they'd do nothing anyway).
  const lo = looseOf(l, best, rings);
  return best.filter((_, i) => !lo[i]);
}
