// The test run: a fixed-step position-based solver (XPBD with stiff distance
// constraints, small steps). Members carry the force their constraint needed,
// smoothed over ~140 ms (so a wheel dropping onto a joint can't snap a
// plank that holds the load itself); one that goes past its material's strength snaps.
// The cart is three particles: two light wheels rolling on planks and rock and
// a heavy body riding on sprung, damped struts (so a wheel dropping over a
// joint between planks doesn't hammer the road with the whole load). Lanterns
// hang from their ring pegs on short cords; a convoy is two carts in a row.
// Wind levels push every peg in proportion to the pieces it holds, in slow
// gusts across and updraughts from the gorge that lift what only hangs.
//
// Pure and deterministic: only + − × ÷ and Math.sqrt (correctly rounded
// everywhere), fixed step, members solved in list order.

import { MATS, pegs, type Member } from './build';
import { WATER, px, py, ringsOf, type Level } from './level';

export const HZ = 480;
const H = 1 / HZ;
const H2 = H * H;
export const GRAVITY = 10;
const ITER = 2;
const DAMP = 1 - 0.6 * H;
/** Force smoothing per step (time constant ~140 ms). */
const SMOOTH = 0.015;

export const WHEEL_R = 0.28;
const WHEELBASE = 0.8;
const BODY_UP = 0.42;
const BODY_R = 0.26;
/** Share of the cart's mass in each wheel (the rest rides on the springs). */
const WHEEL_SHARE = 0.12;
/** Suspension: stiffness per unit of body mass (~3 Hz) and damping per second. */
const SPRING_K = 360;
const SPRING_DAMP = 18;
export const CART_SPEED = 2.4;
/** The beetle's pull: under g·sin(21°), so it can't haul the cart up a 2-across-1-up plank (roads must not climb). */
const CART_ACC = 3.6;
const LANTERN_CORD = 0.7;
/** How close each ring peg must stay, and for how long before the end of a reach run. */
export const RING_TOL = 0.4;
const REACH_STEPS = HZ * 4;
const REACH_HOLD = Math.round(HZ * 1.5);
/** Wind: gusts swing between 35% and 100% over 2 s, after a 0.5 s rise. */
const GUST_STEPS = HZ * 2;
const WIND_RISE = HZ / 2;

export type Outcome = 'crossed' | 'fell' | 'stalled' | 'held' | 'sagged' | 'dropped' | 'nohook';
export const WON: ReadonlySet<Outcome> = new Set(['crossed', 'held']);

/** Wind strength (0..1 of the level's wind) at a step. */
export function gust(step: number): number {
  const ph = (step % GUST_STEPS) / GUST_STEPS;
  const tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
  const rise = step < WIND_RISE ? step / WIND_RISE : 1;
  return rise * (0.35 + 0.65 * tri);
}

/** Updraught (−0.3..1 of the level's wind, + lifts) at a step: a shorter cycle out of step with the gusts. */
export function lift(step: number): number {
  const ph = ((step + LIFT_STEPS / 3) % LIFT_STEPS) / LIFT_STEPS;
  const tri = ph < 0.5 ? ph * 2 : 2 - ph * 2;
  const rise = step < WIND_RISE ? step / WIND_RISE : 1;
  return rise * (-0.3 + 1.3 * tri);
}
/** How hard an updraught lifts compared with the sideways gust. */
const LIFT_K = 1.6;
const LIFT_STEPS = Math.round(HZ * 1.4);
/** Gap between carts in a convoy (middle to middle). */
const CONVOY_GAP = 1.6;

export class Sim {
  readonly level: Level;
  readonly members: Member[];
  /** Particles: the pegs (in `pegIds` order), then cart wheels + body, or the lanterns. */
  x: Float64Array;
  y: Float64Array;
  private ox: Float64Array;
  private oy: Float64Array;
  vx: Float64Array;
  vy: Float64Array;
  w: Float64Array;
  /** Wind catch per particle. */
  private area: Float64Array;
  readonly pegIds: number[];
  /** Particle index per member end. */
  readonly ma: Int32Array;
  readonly mb: Int32Array;
  private rest: Float64Array;
  private isRope: Uint8Array;
  private isRoad: Uint8Array;
  private str: Float64Array;
  private lam: Float64Array;
  /** Smoothed force per member (+ tension, − compression). */
  force: Float64Array;
  /** Highest |force| / strength seen, and the most compression seen. */
  peak: Float64Array;
  minF: Float64Array;
  broken: Uint8Array;
  /** Step at which each member snapped (−1 intact). */
  brokeAt: Int32Array;
  breaks = 0;
  /** The first member to snap and when (−1 none). */
  firstBreak = -1;
  firstBreakAt = -1;
  /** Cart particles (rear wheel, front wheel, body), the lead cart first; `cart` is the lead. */
  readonly carts: [number, number, number][];
  readonly cart: [number, number, number] | null;
  /** Lantern particles and their ring pegs' particles (−1 where a ring has no peg). */
  readonly lanterns: number[];
  readonly ringPegs: number[];
  /** Wheel contact normals from the last step (0,0 = airborne). */
  private cn = new Float64Array(4);
  private springLam = new Float64Array(8);
  private springRest = 0;
  private springAlpha = 0;
  steps = 0;
  outcome: Outcome | null = null;
  outcomeAt = -1;
  /** Steps the cart has barely moved / the rings have held. */
  private still = 0;
  private held = 0;
  private lastCx = 0;
  readonly maxSteps: number;
  /** Stop solving at the first snap (the surveyor wants clean builds). */
  stopOnBreak = false;

  constructor(level: Level, members: readonly Member[]) {
    this.level = level;
    this.members = [...members];
    const used = new Set<number>();
    for (const m of members) used.add(m.a).add(m.b);
    const g = level.goal;
    const rings = ringsOf(level);
    for (const r of rings) used.add(r);
    this.pegIds = [...pegs(level, members)].filter((p) => used.has(p)).sort((a, b) => a - b);
    const idx = new Map(this.pegIds.map((p, i) => [p, i]));
    const nCarts = g.kind === 'cross' ? (g.carts ?? 1) : 0;
    const extra = g.kind === 'cross' ? 3 * nCarts : rings.length;
    const n = this.pegIds.length + extra;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.ox = new Float64Array(n);
    this.oy = new Float64Array(n);
    this.vx = new Float64Array(n);
    this.vy = new Float64Array(n);
    this.w = new Float64Array(n);
    this.area = new Float64Array(n);
    const mass = new Float64Array(n);
    this.pegIds.forEach((p, i) => {
      this.x[i] = px(p);
      this.y[i] = py(p);
      mass[i] = 0.06;
      this.area[i] = 0.05;
    });
    const M = members.length;
    this.ma = new Int32Array(M);
    this.mb = new Int32Array(M);
    this.rest = new Float64Array(M);
    this.isRope = new Uint8Array(M);
    this.isRoad = new Uint8Array(M);
    this.str = new Float64Array(M);
    this.lam = new Float64Array(M);
    this.force = new Float64Array(M);
    this.peak = new Float64Array(M);
    this.minF = new Float64Array(M);
    this.broken = new Uint8Array(M);
    this.brokeAt = new Int32Array(M).fill(-1);
    members.forEach((m, k) => {
      const a = idx.get(m.a)!;
      const b = idx.get(m.b)!;
      this.ma[k] = a;
      this.mb[k] = b;
      const dx = this.x[a] - this.x[b];
      const dy = this.y[a] - this.y[b];
      const L = Math.sqrt(dx * dx + dy * dy);
      this.rest[k] = L;
      const def = MATS[m.mat];
      this.isRope[k] = def.rope ? 1 : 0;
      this.isRoad[k] = def.road ? 1 : 0;
      this.str[k] = def.strength;
      const half = (L * def.density) / 2;
      mass[a] += half;
      mass[b] += half;
      const catchHalf = (L * (def.rope ? 0.3 : def.road ? 1.2 : 1)) / 2;
      this.area[a] += catchHalf;
      this.area[b] += catchHalf;
    });
    const anchors = new Set(level.anchors);
    this.pegIds.forEach((p, i) => (this.w[i] = anchors.has(p) ? 0 : 1 / mass[i]));
    const base = this.pegIds.length;
    if (g.kind === 'cross') {
      this.carts = [];
      const cy = g.startY - WHEEL_R;
      const body = g.cart * (1 - 2 * WHEEL_SHARE);
      this.springRest = Math.sqrt((WHEELBASE / 2) * (WHEELBASE / 2) + BODY_UP * BODY_UP);
      // Static sag: each strut carries about half the body's weight.
      const k = SPRING_K * body;
      this.springAlpha = 1 / k;
      for (let c = 0; c < nCarts; c++) {
        const b = base + 3 * c;
        const sx = g.startX - c * CONVOY_GAP;
        this.carts.push([b, b + 1, b + 2]);
        this.x[b] = sx - WHEELBASE / 2;
        this.x[b + 1] = sx + WHEELBASE / 2;
        this.y[b] = this.y[b + 1] = cy;
        this.x[b + 2] = sx;
        this.y[b + 2] = cy - BODY_UP + (body * GRAVITY) / (2 * k);
        this.w[b] = this.w[b + 1] = 1 / (g.cart * WHEEL_SHARE);
        this.w[b + 2] = 1 / body;
        this.area[b + 2] = 0.5;
      }
      this.cart = this.carts[0];
      this.cn = new Float64Array(4 * nCarts);
      this.lanterns = [];
      this.ringPegs = [];
      this.lastCx = g.startX - (nCarts - 1) * CONVOY_GAP;
      this.maxSteps = Math.round(HZ * ((g.goalX - this.lastCx) / CART_SPEED + 4));
    } else {
      this.carts = [];
      this.cart = null;
      this.lanterns = rings.map((_, k) => base + k);
      this.ringPegs = rings.map((r) => (members.some((m) => m.a === r || m.b === r) ? idx.get(r)! : -1));
      rings.forEach((r, k) => {
        this.x[base + k] = px(r);
        this.y[base + k] = py(r) + LANTERN_CORD;
        this.w[base + k] = 1 / g.weight;
        this.area[base + k] = 3;
      });
      this.maxSteps = REACH_STEPS;
      if (this.ringPegs.some((r) => r < 0)) this.decide('nohook');
    }
    this.ox.set(this.x);
    this.oy.set(this.y);
  }

  private decide(o: Outcome): void {
    if (this.outcome) return;
    this.outcome = o;
    this.outcomeAt = this.steps;
  }

  /** A cart's middle (between the wheels); the rearmost cart by default. */
  cartMid(c = this.carts[this.carts.length - 1]): [number, number] {
    return [(this.x[c[0]] + this.x[c[1]]) / 2, (this.y[c[0]] + this.y[c[1]]) / 2];
  }

  /** Wind push this step (units of force per unit of catch). */
  windNow(): number {
    const wd = this.level.wind ?? 0;
    return wd ? wd * gust(this.steps) : 0;
  }

  /** Updraught this step (+ lifts). */
  liftNow(): number {
    const wd = this.level.wind ?? 0;
    return wd ? (wd < 0 ? -wd : wd) * LIFT_K * lift(this.steps) : 0;
  }

  step(): void {
    const { x, y, ox, oy, vx, vy, w } = this;
    const n = x.length;
    // Motor: wheels touching something push along it toward the flag.
    if (!this.outcome)
      for (let ci = 0; ci < this.carts.length; ci++) {
        const c = this.carts[ci];
        for (let k = 0; k < 2; k++) {
          const nx = this.cn[4 * ci + 2 * k];
          const ny = this.cn[4 * ci + 2 * k + 1];
          if (nx === 0 && ny === 0) continue;
          let tx = -ny;
          let ty = nx;
          if (tx < 0) ((tx = -tx), (ty = -ty));
          const i = c[k];
          const vt = vx[i] * tx + vy[i] * ty;
          let dv = 0;
          if (vt < CART_SPEED) dv = Math.min(CART_ACC * H, CART_SPEED - vt);
          else if (vt > CART_SPEED + 0.6) dv = -Math.min(CART_ACC * H, vt - CART_SPEED);
          vx[i] += tx * dv;
          vy[i] += ty * dv;
          // The motor pulls the whole cart: each driving wheel takes half the body along.
          const vb = vx[c[2]] * tx + vy[c[2]] * ty;
          if (dv < 0 || vb < CART_SPEED) {
            vx[c[2]] += tx * dv * 0.5;
            vy[c[2]] += ty * dv * 0.5;
          }
        }
      }
    const wind = this.windNow();
    const up = this.liftNow();
    for (let i = 0; i < n; i++) {
      ox[i] = x[i];
      oy[i] = y[i];
      if (w[i] === 0) continue;
      vy[i] += GRAVITY * H;
      if (wind) {
        vx[i] += wind * this.area[i] * w[i] * H;
        vy[i] -= up * this.area[i] * w[i] * H;
      }
      x[i] += vx[i] * H;
      y[i] += vy[i] * H;
    }
    const M = this.members.length;
    const lam = this.lam;
    lam.fill(0);
    const sl = this.springLam;
    sl.fill(0);
    for (let it = 0; it < ITER; it++) {
      for (let k = 0; k < M; k++) {
        if (this.broken[k]) continue;
        const a = this.ma[k];
        const b = this.mb[k];
        const ws = w[a] + w[b];
        if (ws === 0) continue;
        const dx = x[a] - x[b];
        const dy = y[a] - y[b];
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1e-9) continue;
        const C = d - this.rest[k];
        if (C <= 0 && this.isRope[k]) continue;
        const dl = -C / ws;
        lam[k] += dl;
        const nx = dx / d;
        const ny = dy / d;
        x[a] += w[a] * dl * nx;
        y[a] += w[a] * dl * ny;
        x[b] -= w[b] * dl * nx;
        y[b] -= w[b] * dl * ny;
      }
      if (this.carts.length)
        this.carts.forEach((c, ci) => {
          this.rigid(c[0], c[1], WHEELBASE);
          sl[2 * ci] = this.spring(c[0], c[2], sl[2 * ci]);
          sl[2 * ci + 1] = this.spring(c[1], c[2], sl[2 * ci + 1]);
        });
      else
        this.lanterns.forEach((l, k) => {
          const r = this.ringPegs[k];
          if (r >= 0) this.rope(r, l, LANTERN_CORD);
        });
      this.collide();
    }
    for (let i = 0; i < n; i++) {
      if (w[i] === 0) continue;
      vx[i] = ((x[i] - ox[i]) / H) * DAMP;
      vy[i] = ((y[i] - oy[i]) / H) * DAMP;
    }
    for (const c of this.carts) {
      this.dampSpring(c[0], c[2]);
      this.dampSpring(c[1], c[2]);
    }
    // Forces, peaks and snapping.
    for (let k = 0; k < M; k++) {
      if (this.broken[k]) continue;
      const f = -lam[k] / H2;
      const s = (this.force[k] += (f - this.force[k]) * SMOOTH);
      const r = (s < 0 ? -s : s) / this.str[k];
      if (r > this.peak[k]) this.peak[k] = r;
      if (s < this.minF[k]) this.minF[k] = s;
      if (r > 1 && (s > 0 || !this.isRope[k])) {
        this.broken[k] = 1;
        this.brokeAt[k] = this.steps;
        if (this.firstBreak < 0) ((this.firstBreak = k), (this.firstBreakAt = this.steps));
        this.breaks++;
        this.force[k] = 0;
      }
    }
    this.steps++;
    this.judge();
  }

  private rigid(a: number, b: number, L: number): void {
    const { x, y, w } = this;
    const dx = x[a] - x[b];
    const dy = y[a] - y[b];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-9) return;
    const dl = -(d - L) / (w[a] + w[b]);
    x[a] += (w[a] * dl * dx) / d;
    y[a] += (w[a] * dl * dy) / d;
    x[b] -= (w[b] * dl * dx) / d;
    y[b] -= (w[b] * dl * dy) / d;
  }

  /** A compliant strut (XPBD); returns its accumulated multiplier for the step. */
  private spring(a: number, b: number, lam: number): number {
    const { x, y, w } = this;
    const dx = x[a] - x[b];
    const dy = y[a] - y[b];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-9) return lam;
    const at = this.springAlpha / H2;
    const dl = (-(d - this.springRest) - at * lam) / (w[a] + w[b] + at);
    x[a] += (w[a] * dl * dx) / d;
    y[a] += (w[a] * dl * dy) / d;
    x[b] -= (w[b] * dl * dx) / d;
    y[b] -= (w[b] * dl * dy) / d;
    return lam + dl;
  }

  /** Damps the closing speed along a strut. */
  private dampSpring(a: number, b: number): void {
    const { x, y, vx, vy, w } = this;
    const dx = x[a] - x[b];
    const dy = y[a] - y[b];
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < 1e-9) return;
    const nx = dx / d;
    const ny = dy / d;
    const rel = (vx[a] - vx[b]) * nx + (vy[a] - vy[b]) * ny;
    const j = (rel * Math.min(1, SPRING_DAMP * H)) / (w[a] + w[b]);
    vx[a] -= w[a] * j * nx;
    vy[a] -= w[a] * j * ny;
    vx[b] += w[b] * j * nx;
    vy[b] += w[b] * j * ny;
  }

  private rope(a: number, b: number, L: number): void {
    const dx = this.x[a] - this.x[b];
    const dy = this.y[a] - this.y[b];
    if (dx * dx + dy * dy > L * L) this.rigid(a, b, L);
  }

  private collide(): void {
    const { x, y, w } = this;
    // Pegs stay out of rock.
    for (let i = 0; i < this.pegIds.length; i++) if (w[i] > 0) this.pushOut(i, 0);
    for (let ci = 0; ci < this.carts.length; ci++) {
      const c = this.carts[ci];
      this.pushOut(c[2], BODY_R);
      for (let k = 0; k < 2; k++) {
        const i = c[k];
        let nx = 0;
        let ny = 0;
        // Planks.
        for (let m = 0; m < this.members.length; m++) {
          if (this.broken[m] || !this.isRoad[m]) continue;
          const a = this.ma[m];
          const b = this.mb[m];
          const ex = x[b] - x[a];
          const ey = y[b] - y[a];
          const ee = ex * ex + ey * ey;
          let t = ee > 0 ? ((x[i] - x[a]) * ex + (y[i] - y[a]) * ey) / ee : 0;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const qx = x[a] + ex * t;
          const qy = y[a] + ey * t;
          const dx = x[i] - qx;
          const dy = y[i] - qy;
          const dd = dx * dx + dy * dy;
          if (dd >= WHEEL_R * WHEEL_R || dd < 1e-12) continue;
          const d = Math.sqrt(dd);
          const ux = dx / d;
          const uy = dy / d;
          const C = d - WHEEL_R;
          const wa = w[a] * (1 - t);
          const wb = w[b] * t;
          const ws = w[i] + wa * (1 - t) + wb * t;
          const dl = -C / ws;
          x[i] += w[i] * dl * ux;
          y[i] += w[i] * dl * uy;
          x[a] -= wa * dl * ux;
          y[a] -= wa * dl * uy;
          x[b] -= wb * dl * ux;
          y[b] -= wb * dl * uy;
          nx += ux;
          ny += uy;
        }
        const r = this.pushOut(i, WHEEL_R);
        if (r) ((nx += r[0]), (ny += r[1]));
        const d = Math.sqrt(nx * nx + ny * ny);
        this.cn[4 * ci + 2 * k] = d > 0 ? nx / d : 0;
        this.cn[4 * ci + 2 * k + 1] = d > 0 ? ny / d : 0;
      }
    }
  }

  /** Pushes particle i (radius r) out of every rock; returns the last push direction. */
  private pushOut(i: number, r: number): [number, number] | null {
    const { x, y } = this;
    let hit: [number, number] | null = null;
    for (const k of this.level.terrain) {
      // A keep-clear lane (a boat passes) only stops building; it doesn't push.
      if (k.kind === 'clear') continue;
      const cx = x[i] < k.x0 ? k.x0 : x[i] > k.x1 ? k.x1 : x[i];
      const cy = y[i] < k.y0 ? k.y0 : y[i] > k.y1 ? k.y1 : y[i];
      const dx = x[i] - cx;
      const dy = y[i] - cy;
      const dd = dx * dx + dy * dy;
      if (dd > 1e-12) {
        if (dd >= r * r) continue;
        const d = Math.sqrt(dd);
        x[i] = cx + (dx / d) * r;
        y[i] = cy + (dy / d) * r;
        hit = [dx / d, dy / d];
        continue;
      }
      // Inside: out through the nearest face.
      const l = x[i] - k.x0;
      const rr = k.x1 - x[i];
      const t = y[i] - k.y0;
      const b = k.y1 - y[i];
      const m = Math.min(l, rr, t, b);
      if (m === t) ((y[i] = k.y0 - r), (hit = [0, -1]));
      else if (m === l) ((x[i] = k.x0 - r), (hit = [-1, 0]));
      else if (m === rr) ((x[i] = k.x1 + r), (hit = [1, 0]));
      else ((y[i] = k.y1 + r), (hit = [0, 1]));
    }
    return hit;
  }

  private judge(): void {
    if (this.outcome) return;
    const g = this.level.goal;
    if (this.stopOnBreak && this.breaks) {
      this.decide(g.kind === 'cross' ? 'fell' : 'dropped');
      return;
    }
    if (g.kind === 'cross') {
      let over = true;
      for (const c of this.carts) {
        if (Math.min(this.x[c[0]], this.x[c[1]]) < g.goalX) over = false;
        if (this.y[c[2]] > g.startY + 2.5 || this.y[c[2]] > WATER) return this.decide('fell');
      }
      if (over) return this.decide('crossed');
      const [cx] = this.cartMid();
      if (Math.abs(cx - this.lastCx) < 0.05) {
        if (++this.still > HZ * 1.5) return this.decide('stalled');
      } else ((this.still = 0), (this.lastCx = cx));
      if (this.steps >= this.maxSteps) return this.decide('stalled');
      return;
    }
    let all = true;
    const rings = ringsOf(this.level);
    for (let k = 0; k < rings.length; k++) {
      const i = this.ringPegs[k];
      const dx = this.x[i] - px(rings[k]);
      const dy = this.y[i] - py(rings[k]);
      if (dy > 1.5 || this.y[i] > WATER) return this.decide('dropped');
      if (dx * dx + dy * dy > RING_TOL * RING_TOL) all = false;
    }
    this.held = all ? this.held + 1 : 0;
    if (this.steps >= this.maxSteps) this.decide(this.held >= REACH_HOLD ? 'held' : 'sagged');
  }
}

export interface RunResult {
  outcome: Outcome;
  steps: number;
  breaks: number;
  firstBreak: number;
  firstBreakAt: number;
  /** Per member: peak |force| / strength and the most compression (≤ 0). */
  peak: Float64Array;
  minF: Float64Array;
}

/** Runs a build to its outcome. */
export function runSim(level: Level, members: readonly Member[], stopOnBreak = false): RunResult {
  const s = new Sim(level, members);
  s.stopOnBreak = stopOnBreak;
  while (!s.outcome) s.step();
  return { outcome: s.outcome, steps: s.steps, breaks: s.breaks, firstBreak: s.firstBreak, firstBreakAt: s.firstBreakAt, peak: s.peak, minF: s.minF };
}
