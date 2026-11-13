// Puzzle generator. Lays out lamps and walls, then walks each beam and drops
// mirrors, splitters, filters and crystals into fresh tiles (never onto light
// already laid, so earlier beams don't change). The crystals take the colour
// that reaches them. Decoy sockets join the piece sockets, and dark crystals sit
// where a wrong turn would send light. Then: while the exact solver finds a second
// answer, a dark crystal goes where only that answer shines (or a decoy goes, or a
// piece is given); while the deduction model gets stuck, a piece is given.

import { Rng, mixSeed } from '../../shared/rng';
import { BACK, CRYSTAL, DC, DR, FLOOR, LAMP, NTYPES, SLASH, SOCKET, WALL, trace, typeOf, type Lamp, type Puzzle } from './board';
import { Ctx, deduce, solveAll } from './solve';

/** Bump when the same seed would build a different puzzle (saves record it). */
export const RULES_VERSION = 2;
/** Solver work allowed per attempt (one-look checks); harder layouts are skipped. */
const CHECK_LIMIT = 4000;

export type Size = 'small' | 'medium' | 'large';

export interface SizeDef {
  name: string;
  n: number;
  lamps: [number, number];
  pieces: [number, number];
  /** Extra empty sockets. */
  decoys: number;
  walls: [number, number];
  /** Dark crystals placed up front (more may be added to make the answer unique). */
  dark: number;
  /** Chance one lamp is white (needs filters to split). */
  white: number;
  filters: boolean;
  splitters: number;
  /** Deepest look-ahead a player should need. */
  maxDepth: number;
  /** At least this many lit crystals. */
  targets: number;
  /** Most pieces handed out as givens. */
  givens: number;
  /** Needs a crystal of a mixed colour. */
  mixed: boolean;
  /** Needs at least one depth-2 step (a look ahead). */
  deep: boolean;
  /** Some crystal's most direct route must be a trap (the answer takes a detour). */
  trap: boolean;
  /** Needs a filter in the tray. */
  filter: boolean;
}

export const SIZES: Record<Size, SizeDef> = {
  small: { name: 'Small', n: 6, lamps: [2, 2], pieces: [3, 4], decoys: 2, walls: [1, 3], dark: 1, white: 0, filters: false, splitters: 0.2, maxDepth: 1, targets: 2, givens: 0, mixed: false, deep: false, trap: true, filter: false },
  medium: { name: 'Medium', n: 7, lamps: [2, 3], pieces: [4, 6], decoys: 3, walls: [2, 4], dark: 2, white: 1, filters: true, splitters: 0.3, maxDepth: 2, targets: 3, givens: 1, mixed: true, deep: false, trap: false, filter: true },
  large: { name: 'Large', n: 8, lamps: [3, 3], pieces: [6, 8], decoys: 4, walls: [3, 5], dark: 2, white: 0.5, filters: true, splitters: 0.35, maxDepth: 2, targets: 3, givens: 1, mixed: true, deep: true, trap: false, filter: false },
};

const popcount = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);

interface Draft {
  n: number;
  kind: number[];
  target: number[];
  lamps: Lamp[];
  piece: Map<number, number>;
}

function build(rng: Rng, cfg: SizeDef): Draft | null {
  const n = cfg.n;
  const N = n * n;
  const kind = new Array<number>(N).fill(FLOOR);
  const target = new Array<number>(N).fill(-1);
  const rc = (c: number): [number, number] => [Math.floor(c / n), c % n];
  const step = (c: number, d: number): number => {
    const [r, q] = rc(c);
    const r2 = r + DR[d];
    const q2 = q + DC[d];
    return r2 < 0 || r2 >= n || q2 < 0 || q2 >= n ? -1 : r2 * n + q2;
  };

  // Lamps on the rim (not corners), facing in.
  const nl = rng.int(cfg.lamps[0], cfg.lamps[1]);
  const colors = rng.shuffle([1, 2, 4]).slice(0, nl);
  if (rng.next() < cfg.white) colors[0] = 7;
  const lamps: Lamp[] = [];
  for (let k = 0; k < nl; k++) {
    for (let tries = 0; tries < 40; tries++) {
      const side = rng.int(0, 3);
      const t = rng.int(1, n - 2);
      const cell = side === 0 ? t : side === 1 ? t * n + n - 1 : side === 2 ? (n - 1) * n + t : t * n;
      const dir = (side + 2) & 3;
      const front = step(cell, dir);
      if (kind[cell] !== FLOOR || kind[front] !== FLOOR) continue;
      // Not right beside another lamp, and not shining straight into one.
      if (lamps.some((l) => Math.abs(rc(l.cell)[0] - rc(cell)[0]) + Math.abs(rc(l.cell)[1] - rc(cell)[1]) < 2)) continue;
      kind[cell] = LAMP;
      lamps.push({ cell, dir, mask: colors[k] });
      break;
    }
  }
  if (lamps.length < nl) return null;
  const ahead = new Set(lamps.map((l) => step(l.cell, l.dir)));
  const nw = rng.int(cfg.walls[0], cfg.walls[1]);
  for (let k = 0, tries = 0; k < nw && tries < 50; tries++) {
    const c = rng.int(0, N - 1);
    if (kind[c] !== FLOOR || ahead.has(c)) continue;
    kind[c] = WALL;
    k++;
  }

  // Walk the beams.
  const piece = new Map<number, number>();
  const lit = new Uint8Array(N);
  const seen = new Uint8Array(N * 4);
  let budget = rng.int(cfg.pieces[0], cfg.pieces[1]);
  const open = (c: number) => c >= 0 && kind[c] === FLOOR && !piece.has(c);
  /** Does a beam leaving c in direction d run straight into a crystal (over open, unpieced floor)? */
  const toCrystal = (c: number, d: number): number => {
    for (let x = step(c, d), len = 1; x >= 0; x = step(x, d), len++) {
      if (kind[x] === CRYSTAL) return len;
      if (!open(x)) return 0;
    }
    return 0;
  };
  const room = (c: number, d: number): number => {
    let len = 0;
    for (let x = step(c, d); x >= 0 && open(x) && !lit[x]; x = step(x, d)) len++;
    return len;
  };
  const beams: [number, number, number][] = lamps.map((l) => [step(l.cell, l.dir), l.dir, l.mask]);
  let guard = 0;
  while (beams.length && guard++ < 50) {
    let [c, d, m] = beams.shift()!;
    let len = 0;
    while (c >= 0) {
      if (seen[c * 4 + d] & m) break;
      seen[c * 4 + d] |= m;
      if (kind[c] === WALL || kind[c] === LAMP || kind[c] === CRYSTAL) break;
      len++;
      const code = piece.get(c);
      if (code !== undefined) {
        const outs: [number, number][] = [];
        if (code <= 4) {
          if (code >= 3) outs.push([d, m]);
          outs.push([code % 2 === 1 ? SLASH[d] : BACK[d], m]);
        } else if (m & (1 << (code - 5))) outs.push([d, m & (1 << (code - 5))]);
        lit[c] = 1;
        if (!outs.length) break;
        for (const o of outs.slice(1)) beams.push([step(c, o[0]), o[0], o[1]]);
        [d, m] = outs[0];
        c = step(c, d);
        len = 0;
        continue;
      }
      const fresh = !lit[c];
      const next = step(c, d);
      const blocked = next < 0 || kind[next] === WALL || kind[next] === LAMP;
      // A crystal straight ahead: usually let the beam reach it (colours mix there).
      const keep = toCrystal(c, d) > 0 && rng.next() < 0.8;
      if (fresh && budget > 0 && len >= 1 && !keep) {
        // A turn: toward a crystal if one is in sight, never straight into a wall.
        const opts = [1, 2].filter((k) => room(c, k === 1 ? SLASH[d] : BACK[d]) >= 1 || toCrystal(c, k === 1 ? SLASH[d] : BACK[d]));
        const aim = opts.filter((k) => toCrystal(c, k === 1 ? SLASH[d] : BACK[d]));
        const pTurn = blocked ? 0.65 : aim.length ? 0.7 : 0.34;
        if (opts.length && rng.next() < pTurn) {
          const k = aim.length && rng.next() < 0.75 ? rng.pick(aim) : rng.pick(opts);
          const split = budget > 0 && rng.next() < cfg.splitters && !blocked;
          const code2 = split ? k + 2 : k;
          piece.set(c, code2);
          budget--;
          // Re-enter the cell: the piece acts on this beam.
          seen[c * 4 + d] &= ~m;
          len--;
          continue;
        }
        if (cfg.filters && popcount(m) >= 2 && rng.next() < 0.35) {
          const bits = [1, 2, 4].filter((b) => m & b);
          const b = rng.pick(bits);
          piece.set(c, 5 + [1, 2, 4].indexOf(b));
          budget--;
          seen[c * 4 + d] &= ~m;
          len--;
          continue;
        }
      }
      if (fresh && !keep && len >= 2 && (blocked ? rng.next() < 0.7 : rng.next() < 0.12 + 0.035 * len)) {
        kind[c] = CRYSTAL;
        break;
      }
      lit[c] = 1;
      c = next;
    }
  }
  return { n, kind, target, lamps, piece };
}

/** The most turns any lit crystal's light needs: for each crystal the fewest pieces that bend
 *  the light on its way in the answer, then the largest of those (2+ = a detour). */
export function detour(p: Puzzle): number {
  const ans = turnsTo(p, false);
  let worst = 0;
  p.target.forEach((t, c) => t > 0 && ans[c] < Infinity && (worst = Math.max(worst, ans[c])));
  return worst;
}

/** True when some crystal's light takes more turns in the answer than its most direct route over
 *  the rings would (from a lamp sharing a colour with it): the obvious path is a trap. */
export function trapped(p: Puzzle): boolean {
  const ans = turnsTo(p, false);
  return p.target.some((t, c) => {
    if (t <= 0) return false;
    const direct = Math.min(...p.lamps.filter((l) => l.mask & t).map((l) => turnsTo({ ...p, lamps: [l] }, true)[c]));
    return ans[c] > direct;
  });
}

/** Fewest bends on the way into each cell: with the answer's pieces, or (any) with every ring free to bend. */
function turnsTo(p: Puzzle, any: boolean): number[] {
  const n = p.n;
  const N = n * n;
  const at = new Map(p.sockets.map((c, i) => [c, any ? -1 : p.solution[i]]));
  const cost = new Array<number>(N * 4).fill(Infinity);
  const best = new Array<number>(N).fill(Infinity);
  // 0-1 BFS over (cell, direction of travel).
  const dq: [number, number, number][] = [];
  const go = (c: number, d: number, k: number, front: boolean) => {
    const r = Math.floor(c / n) + DR[d];
    const q = (c % n) + DC[d];
    if (r < 0 || r >= n || q < 0 || q >= n) return;
    const x = r * n + q;
    if (k >= cost[x * 4 + d]) return;
    cost[x * 4 + d] = k;
    if (front) dq.unshift([x, d, k]);
    else dq.push([x, d, k]);
  };
  for (const l of p.lamps) go(l.cell, l.dir, 0, true);
  while (dq.length) {
    const [c, d, k] = dq.shift()!;
    if (k > cost[c * 4 + d]) continue;
    const kind = p.kind[c];
    if (kind === WALL || kind === LAMP) continue;
    if (kind === CRYSTAL) {
      best[c] = Math.min(best[c], k);
      continue;
    }
    const code = at.get(c) ?? 0;
    if (code === 0 || code >= 3 || code < 0) go(c, d, k, true);
    if (code === 1 || code === 3 || code < 0) go(c, SLASH[d], k + 1, false);
    if (code === 2 || code === 4 || code < 0) go(c, BACK[d], k + 1, false);
  }
  return best;
}

/** Builds the puzzle for a seed and size. */
export function generate(seed: number, size: Size): Puzzle {
  const cfg = SIZES[size];
  for (let attempt = 0; ; attempt++) {
    const p = tryBuild(seed, size, cfg, attempt);
    if (p) return p;
  }
}

/** Generation attempts used by the last `generate` call, and why attempts failed (for the stats tool). */
export let lastAttempts = 0;
export const rejects: Record<string, number> = {};
const reject = (why: string): null => {
  rejects[why] = (rejects[why] ?? 0) + 1;
  return null;
};

function tryBuild(seed: number, size: Size, cfg: SizeDef, attempt: number): Puzzle | null {
  lastAttempts = attempt + 1;
  // Hash each part in turn: mixSeed(a, b) alone collides along a + b.
  const rng = new Rng(mixSeed(mixSeed(mixSeed(seed >>> 0, 0x676c6d), cfg.n), attempt));
  const d = build(rng, cfg);
  if (!d) return reject('lamps');
  const { n, kind, target, lamps, piece } = d;
  const N = n * n;
  if (piece.size < cfg.pieces[0]) return reject('pieces');
  // Piece tiles become sockets.
  for (const c of piece.keys()) kind[c] = SOCKET;
  const sockets0 = [...piece.keys()];
  const givenAt = new Map<number, number>();
  const draft = (): Puzzle => {
    const sockets = kind.flatMap((k, c) => (k === SOCKET ? [c] : []));
    const stock = new Array<number>(NTYPES).fill(0);
    for (const code of piece.values()) stock[typeOf(code)]++;
    return {
      seed,
      size,
      n,
      kind: [...kind],
      target: [...target],
      lamps,
      sockets,
      given: sockets.map((c) => givenAt.get(c) ?? -1),
      stock,
      solution: sockets.map((c) => piece.get(c) ?? 0),
    };
  };
  let p = draft();
  const light = trace(p, p.solution);
  // Every piece must be lit and do something; crystals take what reaches them.
  if (sockets0.some((c) => !light.lit[c])) return reject('unlit');
  for (let c = 0; c < N; c++) if (kind[c] === CRYSTAL) target[c] = light.got[c];
  if (target.some((t, c) => kind[c] === CRYSTAL && t <= 0)) return reject('dimcrystal');
  const lit = target.filter((t) => t > 0).length;
  if (lit < cfg.targets) return reject('targets');
  if (cfg.mixed && !target.some((t) => t > 0 && popcount(t) >= 2)) return reject('mixed');
  if (cfg.filter && ![...piece.values()].some((c) => c >= 5)) return reject('filter');
  // No crystal may glow before any piece is down.
  const bare = trace(p, p.sockets.map(() => 0));
  if (target.some((t, c) => t > 0 && bare.got[c] === t)) return reject('prelit');
  // Every lamp must help light some crystal.
  for (const l of lamps) {
    const solo = trace({ ...p, lamps: [l] }, p.solution);
    if (!target.some((t, c) => t > 0 && solo.got[c])) return reject('lampuse');
  }

  // Decoy sockets: on the beams (a socket the light must pass) or beside them.
  const floorLit = [...Array(N).keys()].filter((c) => kind[c] === FLOOR && light.lit[c]);
  const nearLit = [...Array(N).keys()].filter((c) => {
    if (kind[c] !== FLOOR || light.lit[c]) return false;
    const r = Math.floor(c / n);
    const q = c % n;
    return [0, 1, 2, 3].some((d) => {
      const r2 = r + DR[d];
      const q2 = q + DC[d];
      return r2 >= 0 && r2 < n && q2 >= 0 && q2 < n && light.lit[r2 * n + q2] && kind[r2 * n + q2] !== LAMP;
    });
  });
  for (let k = 0; k < cfg.decoys; k++) {
    const pool = rng.next() < 0.65 && floorLit.length ? floorLit : nearLit;
    const c = pool.length ? pool.splice(rng.int(0, pool.length - 1), 1)[0] : -1;
    if (c >= 0 && kind[c] === FLOOR) kind[c] = SOCKET;
  }
  // Dark crystals where a turn at a socket would send light.
  const darkSpots = new Set<number>();
  for (const c of kind.flatMap((k, c) => (k === SOCKET ? [c] : [])))
    for (let d = 0; d < 4; d++)
      for (let x = c, len = 0; ; len++) {
        const r = Math.floor(x / n) + DR[d];
        const q = (x % n) + DC[d];
        if (r < 0 || r >= n || q < 0 || q >= n) break;
        x = r * n + q;
        if (kind[x] !== FLOOR) break;
        if (!light.lit[x] && len >= 1) darkSpots.add(x);
      }
  const spots = [...darkSpots];
  for (let k = 0; k < cfg.dark && spots.length; k++) {
    const c = spots.splice(rng.int(0, spots.length - 1), 1)[0];
    kind[c] = CRYSTAL;
    target[c] = 0;
  }

  // Unique: add a dark crystal (or drop a decoy, or give a piece) until one answer is left.
  p = draft();
  let givens = 0;
  for (let round = 0; ; round++) {
    if (round > 14) return reject('rounds');
    const sc = new Ctx(p);
    sc.limit = CHECK_LIMIT;
    const sols = solveAll(p, 2, sc);
    if (sc.aborted || sols.length === 0) return reject('solver');
    if (sols.length === 1) break;
    const alt = sols.find((s) => s.some((x, i) => x !== p.solution[i]))!;
    const altLight = trace(p, alt);
    const cands = [...Array(N).keys()].filter((c) => kind[c] === FLOOR && altLight.lit[c] && !light.lit[c]);
    if (cands.length) {
      const c = rng.pick(cands);
      kind[c] = CRYSTAL;
      target[c] = 0;
    } else {
      const decoy = p.sockets.findIndex((_, i) => alt[i] > 0 && p.solution[i] === 0);
      if (decoy >= 0) kind[p.sockets[decoy]] = FLOOR;
      else {
        const i = p.sockets.findIndex((_, i) => alt[i] !== p.solution[i] && p.solution[i] > 0);
        if (i < 0 || ++givens > cfg.givens) return reject('givensU');
        givenAt.set(p.sockets[i], p.solution[i]);
      }
    }
    p = draft();
  }

  // Deducible within the size's depth; a stuck spot gets a given piece.
  const ctx = new Ctx(p);
  for (;;) {
    ctx.limit = ctx.checks + CHECK_LIMIT;
    const dd = deduce(p, cfg.maxDepth, undefined, ctx);
    if (ctx.aborted) return reject('deduceLimit');
    if (dd.solved) {
      if (cfg.deep && dd.depth < 2) return reject('shallow');
      break;
    }
    const i = p.sockets.findIndex((_, i) => p.solution[i] > 0 && p.given[i] < 0 && dd.dom[i] !== 1 << p.solution[i]);
    if (i < 0 || ++givens > cfg.givens) return reject('givensD');
    p.given[i] = p.solution[i];
  }
  if (cfg.trap && !trapped(p)) return reject('direct');
  return p;
}
