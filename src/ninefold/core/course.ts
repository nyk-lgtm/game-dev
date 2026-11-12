// Ninefold courses: nine mini-golf holes grown from a seed. Each hole is a
// corridor of grid cells (a self-avoiding walk from tee to cup, widened here and
// there); its walls are the cells' outer edges, so the cup is always reachable.
// Obstacles go in cells along the way, never in the tee or cup cell.

import { Rng, mixSeed } from '../../shared/rng';

export const COLS = 6;
export const ROWS = 9;
export const CELL = 16;
export const BALL_R = 1.4;
export const CUP_R = 2.4;
export const HOLES = 9;

export interface Seg {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}
export interface Post {
  x: number;
  y: number;
  r: number;
  /** Bumpers spring the ball back faster; posts are dead stone. */
  bumper: boolean;
}
export interface Zone {
  kind: 'sand' | 'water' | 'slope';
  x: number;
  y: number;
  w: number;
  h: number;
  /** Slope direction (unit vector), for slopes. */
  dx: number;
  dy: number;
}
export interface Hole {
  n: number;
  par: number;
  /** Fairway cells, index = row * COLS + col. */
  cells: boolean[];
  /** The main route, tee cell first. */
  path: number[];
  tee: { x: number; y: number };
  cup: { x: number; y: number };
  walls: Seg[];
  posts: Post[];
  zones: Zone[];
}

const cx = (c: number) => (c % COLS) * CELL + CELL / 2;
const cy = (c: number) => Math.floor(c / COLS) * CELL + CELL / 2;
const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
] as const;

function neighbor(c: number, d: number): number {
  const x = (c % COLS) + DIRS[d][0];
  const y = Math.floor(c / COLS) + DIRS[d][1];
  return x < 0 || y < 0 || x >= COLS || y >= ROWS ? -1 : y * COLS + x;
}
const dirBetween = (a: number, b: number) => [0, 1, 2, 3].find((d) => neighbor(a, d) === b)!;

/** A self-avoiding walk that never touches itself except at consecutive cells. */
function walk(rng: Rng, len: number): number[] | null {
  const start = (ROWS - 1) * COLS + rng.int(0, COLS - 1);
  const path = [start];
  const on = new Set(path);
  let dir = 0;
  while (path.length < len) {
    const cur = path[path.length - 1];
    // Prefer going on; turn sometimes; up more than down.
    const opts: [number, number][] = [];
    for (let d = 0; d < 4; d++) {
      const n = neighbor(cur, d);
      if (n < 0 || on.has(n)) continue;
      // Must not touch any earlier cell but cur.
      let ok = true;
      for (let e = 0; e < 4; e++) {
        const m = neighbor(n, e);
        if (m >= 0 && m !== cur && on.has(m)) ok = false;
      }
      if (!ok) continue;
      let w = d === dir ? 3 : 1.6;
      if (d === 2) w *= 0.35;
      if (d === 0) w *= 1.3;
      opts.push([d, w]);
    }
    if (!opts.length) return null;
    let r = rng.next() * opts.reduce((a, o) => a + o[1], 0);
    let pick = opts[0][0];
    for (const [d, w] of opts) {
      if ((r -= w) <= 0) {
        pick = d;
        break;
      }
    }
    dir = pick;
    const n = neighbor(cur, pick);
    path.push(n);
    on.add(n);
  }
  return path;
}

/** Outer edges of the fairway, merged into long straight walls. */
function buildWalls(cells: boolean[]): Seg[] {
  const h: Seg[] = [];
  const v: Seg[] = [];
  for (let c = 0; c < cells.length; c++) {
    if (!cells[c]) continue;
    const x0 = (c % COLS) * CELL, y0 = Math.floor(c / COLS) * CELL;
    for (let d = 0; d < 4; d++) {
      const n = neighbor(c, d);
      if (n >= 0 && cells[n]) continue;
      if (d === 0) h.push({ ax: x0, ay: y0, bx: x0 + CELL, by: y0 });
      if (d === 2) h.push({ ax: x0, ay: y0 + CELL, bx: x0 + CELL, by: y0 + CELL });
      if (d === 3) v.push({ ax: x0, ay: y0, bx: x0, by: y0 + CELL });
      if (d === 1) v.push({ ax: x0 + CELL, ay: y0, bx: x0 + CELL, by: y0 + CELL });
    }
  }
  const merge = (segs: Seg[], horiz: boolean): Seg[] => {
    segs.sort((a, b) => (horiz ? a.ay - b.ay || a.ax - b.ax : a.ax - b.ax || a.ay - b.ay));
    const out: Seg[] = [];
    for (const s of segs) {
      const last = out[out.length - 1];
      if (last && (horiz ? last.ay === s.ay && last.bx === s.ax : last.ax === s.ax && last.by === s.ay)) {
        last.bx = s.bx;
        last.by = s.by;
      } else out.push({ ...s });
    }
    return out;
  };
  return [...merge(h, true), ...merge(v, false)];
}

const turnsOf = (path: number[]) => {
  let t = 0;
  for (let i = 2; i < path.length; i++) if (dirBetween(path[i - 2], path[i - 1]) !== dirBetween(path[i - 1], path[i])) t++;
  return t;
};

export function makeHole(seed: number, n: number): Hole {
  const rng = new Rng(mixSeed(seed, n + 1));
  const [lo, hi] = n < 3 ? [5, 8] : n < 6 ? [7, 11] : [9, 14];
  let path: number[] | null = null;
  for (let tries = 0; !path; tries++) path = walk(rng, tries > 200 ? 4 : rng.int(lo, hi));
  const cells = Array<boolean>(COLS * ROWS).fill(false);
  path.forEach((c) => (cells[c] = true));
  const index = new Map(path.map((c, i) => [c, i]));
  // Widen: side pockets whose fairway neighbours are all close along the route (no shortcuts).
  const extra: number[] = [];
  const widen = n < 3 ? 1 : rng.int(1, 3);
  for (let k = 0; k < widen * 4 && extra.length < widen; k++) {
    const base = path[rng.int(1, path.length - 2)];
    const c = neighbor(base, rng.int(0, 3));
    if (c < 0 || cells[c]) continue;
    const touch: number[] = [];
    for (let d = 0; d < 4; d++) {
      const m = neighbor(c, d);
      if (m >= 0 && cells[m]) touch.push(index.get(m) ?? -99);
    }
    if (touch.includes(-99) || Math.max(...touch) - Math.min(...touch) > 2) continue;
    if (touch.includes(0) || touch.includes(path.length - 1)) continue;
    cells[c] = true;
    extra.push(c);
  }

  const first = path[0], last = path[path.length - 1];
  const tee = { x: cx(first), y: cy(first) + 3 };
  const cup = { x: cx(last) + rng.int(-3, 3), y: cy(last) + rng.int(-3, 3) };
  const posts: Post[] = [];
  const zones: Zone[] = [];
  const used = new Set<number>([first, last]);

  // Obstacles: more and nastier on later holes.
  const pool: string[] = ['post', 'bumper', 'sand'];
  if (n >= 2) pool.push('slope');
  if (n >= 3) pool.push('water');
  if (n >= 5) pool.push('slope', 'water', 'bumper');
  const count = Math.min(path.length - 2, 1 + Math.floor(n / 2) + rng.int(0, 1));
  const mids = rng.shuffle(path.slice(1, -1));
  for (const c of mids) {
    if (posts.length + zones.length >= count) break;
    if (used.has(c)) continue;
    const i = index.get(c)!;
    const din = dirBetween(path[i - 1], c), dout = dirBetween(c, path[i + 1]);
    const straight = din === dout;
    const kind = rng.pick(pool);
    const x0 = (c % COLS) * CELL, y0 = Math.floor(c / COLS) * CELL;
    const along = DIRS[din];
    if (kind === 'post' && straight) {
      // One in the middle (two lanes), or two staggered.
      posts.push({ x: cx(c), y: cy(c), r: 1.8, bumper: false });
    } else if (kind === 'bumper') {
      // On a bend, in the outer corner, so you can bank off it; on a straight, off to one side.
      if (!straight) {
        const ox = DIRS[din][0] + DIRS[(dout + 2) % 4][0], oy = DIRS[din][1] + DIRS[(dout + 2) % 4][1];
        posts.push({ x: cx(c) + ox * 4.5, y: cy(c) + oy * 4.5, r: 2.4, bumper: true });
      } else {
        const side = rng.next() < 0.5 ? -1 : 1;
        posts.push({ x: cx(c) + along[1] * 4 * side, y: cy(c) + along[0] * 4 * side, r: 2.2, bumper: true });
      }
    } else if (kind === 'sand') {
      const w = rng.int(7, 11), h = rng.int(6, 10);
      zones.push({ kind: 'sand', x: x0 + rng.int(1, CELL - 1 - w), y: y0 + rng.int(1, CELL - 1 - h), w, h, dx: 0, dy: 0 });
    } else if (kind === 'water' && straight) {
      // A pond along one side of a straight run, leaving a lane open.
      const side = rng.next() < 0.5 ? 0 : 1;
      if (along[0] === 0) zones.push({ kind: 'water', x: x0 + (side ? CELL - 8 : 0), y: y0 + 2, w: 8, h: CELL - 4, dx: 0, dy: 0 });
      else zones.push({ kind: 'water', x: x0 + 2, y: y0 + (side ? CELL - 8 : 0), w: CELL - 4, h: 8, dx: 0, dy: 0 });
    } else if (kind === 'slope' && straight) {
      // A sideways tilt across the run.
      const s = rng.next() < 0.5 ? -1 : 1;
      zones.push({ kind: 'slope', x: x0, y: y0, w: CELL, h: CELL, dx: along[1] * s, dy: along[0] * s });
    } else continue;
    used.add(c);
  }
  // Side pockets: sometimes a pond or sand trap waits in them.
  for (const c of extra) {
    if (rng.next() < (n >= 3 ? 0.6 : 0.3)) {
      const kind = n >= 3 && rng.next() < 0.5 ? 'water' : 'sand';
      zones.push({ kind, x: (c % COLS) * CELL + 2, y: Math.floor(c / COLS) * CELL + 2, w: CELL - 4, h: CELL - 4, dx: 0, dy: 0 });
    }
  }

  const turns = turnsOf(path);
  const hazards = zones.filter((z) => z.kind !== 'sand').length;
  const par = Math.max(2, Math.min(5, 2 + Math.floor((turns + (path.length > 8 ? 1 : 0) + (hazards > 1 ? 1 : 0)) / 2)));
  return { n, par, cells, path, tee, cup, walls: buildWalls(cells), posts, zones };
}

export const makeCourse = (seed: number): Hole[] => [...Array(HOLES).keys()].map((n) => makeHole(seed, n));
