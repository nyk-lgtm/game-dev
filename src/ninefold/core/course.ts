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
/** A windmill: a bar turning at `w` rad/s all the time; its angle is a0 + w·t on the hole's clock. */
export interface Mill {
  x: number;
  y: number;
  arm: number;
  a0: number;
  w: number;
  /** The run's direction through the mill (radians): the bar lies along it when the way is open. */
  lane: number;
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
  mills: Mill[];
  /** Angled rails across the outer corner of bends: corner point, then the two ends of the rail. */
  wedges: number[][];
  /** Free-standing rails inside the fairway (a split route's divider); also in `walls`. */
  rails: Seg[];
  shape: Shape;
  /** Par before rounding (the fitted stroke estimate), and what it's fitted on: obstacles on the route, turns. */
  rawPar: number;
  inWay: number;
  turns: number;
}
/** corridor: a winding lane; green: it opens into a two-wide green at the cup; split: two lanes round a divider. */
export type Shape = 'corridor' | 'green' | 'split';

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
/** Holes keep to a band of BAND columns, so they stay tall and narrow and fill a portrait screen. */
const BAND = 4;

function walk(rng: Rng, len: number, band: number): number[] | null {
  const start = (ROWS - 1) * COLS + band + rng.int(0, BAND - 1);
  const path = [start];
  const on = new Set(path);
  let dir = 0;
  while (path.length < len) {
    const cur = path[path.length - 1];
    // Prefer going on; turn sometimes; up more than down.
    const opts: [number, number][] = [];
    for (let d = 0; d < 4; d++) {
      const n = neighbor(cur, d);
      if (n < 0 || on.has(n) || n % COLS < band || n % COLS >= band + BAND) continue;
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
  const band = rng.int(0, COLS - BAND);
  for (let tries = 0; !path; tries++) path = walk(rng, tries > 200 ? 4 : rng.int(lo, hi), band);
  const cells = Array<boolean>(COLS * ROWS).fill(false);
  path.forEach((c) => (cells[c] = true));
  const index = new Map(path.map((c, i) => [c, i]));
  const inBand = (c: number) => c >= 0 && c % COLS >= band && c % COLS < band + BAND;
  /** A fairway cell beside the route may only touch route cells in [lo, hi] (no shortcuts). */
  const fits = (c: number, lo: number, hi: number, ok: Set<number>) =>
    inBand(c) &&
    !cells[c] &&
    [0, 1, 2, 3].every((d) => {
      const m = neighbor(c, d);
      if (m < 0 || !cells[m] || ok.has(m)) return true;
      const k = index.get(m);
      return k !== undefined && k >= lo && k <= hi;
    });
  // Shape: most holes wind down a lane; some open into a wide green, some split round a divider rail.
  let shape: Shape = 'corridor';
  const rails: Seg[] = [];
  const shapeUsed = new Set<number>();
  const L = path.length;
  const roll = rng.next();
  const side = rng.next() < 0.5 ? 1 : 3;
  if (n >= 2 && roll < 0.3 && L >= 4) {
    // Green: the last two or three cells of a straight finish get a twin beside them.
    const d = dirBetween(path[L - 2], path[L - 1]);
    const runs = dirBetween(path[L - 3], path[L - 2]) === d ? [[L - 3, L - 2, L - 1], [L - 2, L - 1]] : [[L - 2, L - 1]];
    for (const run of runs) {
      for (const s2 of [side, (side + 2) % 4]) {
        const twins = run.map((j) => neighbor(path[j], (d + s2) % 4));
        const set = new Set(twins);
        if (twins.every((c) => fits(c, run[0], L - 1, set))) {
          twins.forEach((c) => (cells[c] = true));
          shape = 'green';
          break;
        }
      }
      if (shape === 'green') break;
    }
  } else if (n >= 3 && roll < 0.65 && L >= 6) {
    // Split: three straight cells get twins beside them, and a rail down the middle one makes two lanes.
    const opts: number[] = [];
    for (let i = 2; i < L - 2; i++) {
      const d = dirBetween(path[i - 1], path[i]);
      if (dirBetween(path[i], path[i + 1]) === d) opts.push(i);
    }
    for (const i of rng.shuffle(opts)) {
      const d = dirBetween(path[i - 1], path[i]);
      const s2 = [side, (side + 2) % 4].find((q) => {
        const twins = [i - 1, i, i + 1].map((j) => neighbor(path[j], (d + q) % 4));
        const set = new Set(twins);
        return twins.every((c) => fits(c, i - 1, i + 1, set));
      });
      if (s2 === undefined) continue;
      const twins = [i - 1, i, i + 1].map((j) => neighbor(path[j], (d + s2) % 4));
      twins.forEach((c) => (cells[c] = true));
      const a = path[i], b = twins[1];
      const mx = (cx(a) + cx(b)) / 2, my = (cy(a) + cy(b)) / 2;
      const hl = CELL / 2 + 2;
      rails.push({ ax: mx - DIRS[d][0] * hl, ay: my - DIRS[d][1] * hl, bx: mx + DIRS[d][0] * hl, by: my + DIRS[d][1] * hl });
      shapeUsed.add(a).add(b);
      shape = 'split';
      break;
    }
  }
  // Widen: side pockets whose fairway neighbours are all close along the route (no shortcuts).
  const extra: number[] = [];
  const widen = n < 3 ? 1 : rng.int(1, 3);
  for (let k = 0; k < widen * 4 && extra.length < widen; k++) {
    const base = path[rng.int(1, path.length - 2)];
    const c = neighbor(base, rng.int(0, 3));
    if (c < 0 || cells[c] || c % COLS < band || c % COLS >= band + BAND) continue;
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
  if (shape === 'green') {
    // Out in the open green, not tucked down the lane it arrives by.
    const d = dirBetween(path[L - 2], last);
    const twin = [1, 3].map((q) => neighbor(last, (d + q) % 4)).find((c) => c >= 0 && cells[c] && !index.has(c))!;
    cup.x = (cx(last) + cx(twin)) / 2 + rng.int(-4, 4);
    cup.y = (cy(last) + cy(twin)) / 2 + rng.int(-4, 4);
  }
  const posts: Post[] = [];
  const zones: Zone[] = [];
  const used = new Set<number>([first, last, ...shapeUsed]);
  if (shape === 'split' && rng.next() < 0.6) {
    // One lane has a sand trap (never wider than half the lane), so the choice matters.
    const c = [...shapeUsed][rng.int(0, 1)];
    const x0 = (c % COLS) * CELL, y0 = Math.floor(c / COLS) * CELL;
    const w = rng.int(5, 7), h = rng.int(5, 7);
    zones.push({ kind: 'sand', x: x0 + rng.int(2, CELL - 2 - w), y: y0 + rng.int(2, CELL - 2 - h), w, h, dx: 0, dy: 0 });
  }

  // Obstacles: more and nastier on later holes.
  const pool: string[] = ['post', 'bumper', 'sand'];
  if (n >= 2) pool.push('slope');
  if (n >= 3) pool.push('water');
  if (n >= 3) pool.push('mill');
  if (n >= 5) pool.push('slope', 'water', 'bumper', 'mill');
  const mills: Mill[] = [];
  const kindAt = new Map<number, string>();
  const near = (i: number, k: string) => [path[i - 1], path[i + 1]].some((c) => kindAt.get(c) === k);
  const count = Math.min(path.length - 2, 1 + Math.floor(n / 2) + rng.int(0, 1));
  const mids = rng.shuffle(path.slice(1, -1));
  for (const c of mids) {
    if (posts.length + zones.length + mills.length >= count) break;
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
    } else if (kind === 'mill' && straight && mills.length < 2) {
      // Never beside water: a knock into a pond is luck, not skill.
      if (near(i, 'water')) continue;
      // Slow enough that the open window is readable (rules v8: 1.1-1.7 rad/s was a ~0.3 s window).
      mills.push({ x: cx(c), y: cy(c), arm: 5.0, a0: rng.int(0, 7) * (Math.PI / 8), w: (rng.next() < 0.5 ? -1 : 1) * (0.7 + rng.next() * 0.4), lane: Math.atan2(along[1], along[0]) });
      kindAt.set(c, 'mill');
    } else if (kind === 'sand') {
      // Never wider than half the lane, so there is always a way round.
      const w = rng.int(5, 8), h = rng.int(5, 8);
      zones.push({ kind: 'sand', x: x0 + rng.int(1, CELL - 1 - w), y: y0 + rng.int(1, CELL - 1 - h), w, h, dx: 0, dy: 0 });
    } else if (kind === 'water' && straight) {
      if (near(i, 'mill')) continue;
      kindAt.set(c, 'water');
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
      const millNext = [0, 1, 2, 3].some((d) => kindAt.get(neighbor(c, d)) === 'mill');
      const kind = n >= 3 && rng.next() < 0.5 && !millNext ? 'water' : 'sand';
      zones.push({ kind, x: (c % COLS) * CELL + 2, y: Math.floor(c / COLS) * CELL + 2, w: CELL - 4, h: CELL - 4, dx: 0, dy: 0 });
    }
  }

  const turns = turnsOf(path);
  const onRoute = new Set(path);
  const cellOf = (x: number, y: number) => Math.floor(y / CELL) * COLS + Math.floor(x / CELL);
  const inWay =
    zones.filter((z) => onRoute.has(cellOf(z.x + z.w / 2, z.y + z.h / 2))).length +
    posts.filter((p) => !p.bumper).length +
    mills.length;
  // Fitted to the search bot with a thumb-sized wobble (scripts/ninefold/fit.ts, rules v8, 1620 holes:
  // strokes ≈ 0.31·length + 0.16·obstacles + 0.1·turns + 0.17·green − 0.14·split), plus 0.25 a hole so the bot
  // lands ~1.5 under a round (v7's par let it go ~3 under, and testers called par generous).
  const rawPar = 0.31 * path.length + 0.16 * inWay + 0.1 * turns + (shape === 'green' ? 0.15 : shape === 'split' ? -0.15 : 0) + 0.25;
  const par = Math.max(2, Math.min(5, Math.round(rawPar)));
  // Angle the outer corner of every closed bend (unless a bumper sits there) so banks play cleanly.
  const walls = [...buildWalls(cells), ...rails.map((r) => ({ ...r }))];
  const wedges: number[][] = [];
  const K = 6;
  for (let i = 1; i < path.length - 1; i++) {
    const c = path[i];
    const din = dirBetween(path[i - 1], c), dout = dirBetween(c, path[i + 1]);
    if (din === dout) continue;
    const back = (dout + 2) % 4;
    const a = neighbor(c, din), b = neighbor(c, back);
    const diag = a >= 0 ? neighbor(a, back) : -1;
    if ([a, b, diag].some((m) => m >= 0 && cells[m])) continue;
    const ox = DIRS[din][0] + DIRS[back][0], oy = DIRS[din][1] + DIRS[back][1];
    const kx = cx(c) + ox * (CELL / 2), ky = cy(c) + oy * (CELL / 2);
    if (posts.some((p) => Math.hypot(p.x - kx, p.y - ky) < CELL / 2)) continue;
    const ax = kx + DIRS[dout][0] * K, ay = ky + DIRS[dout][1] * K;
    const bx = kx - DIRS[din][0] * K, by = ky - DIRS[din][1] * K;
    walls.push({ ax, ay, bx, by });
    wedges.push([kx, ky, ax, ay, bx, by]);
  }
  return { n, par, cells, path, tee, cup, walls, posts, zones, mills, wedges, rails, shape, rawPar, inWay, turns };
}

export const makeCourse = (seed: number): Hole[] => [...Array(HOLES).keys()].map((n) => makeHole(seed, n));
