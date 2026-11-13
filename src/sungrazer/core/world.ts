// Sungrazer's sky: a seeded column of stars, cinders and motes, grown upward
// lazily and always in the same order, so every run of a seed sees the same sky.
// Coordinates: x 0..W (the screen's width), y grows upward. Pure: no DOM, no
// Math.random, no trig (positions use a fixed table of directions).

import { Rng, mixSeed } from '../../shared/rng';

/** The field's width; the walls sit at 0 and W. */
export const W = 100;
/** How much sky the rules assume is on screen (the camera and the void use it). */
export const VIEW_H = 160;
export const TPS = 240;
export const STEP = 1 / TPS;
export const COMET_R = 1.3;
export const MOTE_R = 1.6;
/** Where the comet starts. */
export const START_Y = 14;
/** The farthest two linked stars can be apart (centre to centre). */
export const MAX_LINK = 40;

export type Mode = 'n' | 's' | 't' | 'm';
export interface ModeDef {
  id: Mode;
  name: string;
  blurb: string;
  /** Orbit speed and void-rise factor. */
  speed: number;
  /** Tether reel-in factor. */
  reel: number;
  /** Graze points factor. */
  graze: number;
  /** Extra cinder chance (and cinders from the start). */
  shower: boolean;
  /** All points ×. */
  points: number;
  /** Best score (any mode) that unlocks it. */
  unlock: number;
}
export const MODES: Record<Mode, ModeDef> = {
  n: { id: 'n', name: 'Classic', blurb: 'The standard sky.', speed: 1, reel: 1, graze: 1, shower: false, points: 1, unlock: 0 },
  s: { id: 's', name: 'Swift', blurb: 'Everything 15% faster, the void too. Points ×1.25.', speed: 1.15, reel: 1.1, graze: 1, shower: false, points: 1.25, unlock: 4000 },
  t: { id: 't', name: 'Tight orbit', blurb: 'Stars reel you in 70% faster; grazing pays double.', speed: 1, reel: 1.7, graze: 2, shower: false, points: 1, unlock: 9000 },
  m: { id: 'm', name: 'Meteor shower', blurb: 'Cinders from the first star, twice as many. Points ×1.4.', speed: 1, reel: 1, graze: 1, shower: true, points: 1.4, unlock: 15000 },
};
export const MODE_IDS: Mode[] = ['n', 's', 't', 'm'];

export type StarKind = 'star' | 'giant' | 'pulsar';
export interface Star {
  id: number;
  x: number;
  y: number;
  r: number;
  /** Width of the corona (the graze band) beyond the surface. */
  band: number;
  kind: StarKind;
  /** Pulsars: lit for the first `lit` ticks of every `period`, offset by `phase`. */
  period: number;
  lit: number;
  phase: number;
  spine: boolean;
}
export interface Cinder {
  id: number;
  x: number;
  y: number;
  r: number;
  /** Drifters swing ±amp across x over `period` ticks. */
  amp: number;
  period: number;
  phase: number;
}
export interface Mote {
  id: number;
  x: number;
  y: number;
}

export interface Zone {
  at: number;
  name: string;
}
/** Bands of altitude; each brings something new. */
export const ZONES: Zone[] = [
  { at: 0, name: 'Inner Reach' },
  { at: 450, name: 'Cinder Belt' },
  { at: 1000, name: 'Pulsar Drift' },
  { at: 1700, name: 'Giant Field' },
  { at: 2500, name: 'Deep Dark' },
  { at: 3400, name: 'Far Edge' },
];
export function zoneAt(alt: number): number {
  let z = 0;
  for (let i = 1; i < ZONES.length; i++) if (alt >= ZONES[i].at) z = i;
  return z;
}

/** 16 unit directions (k·22.5°), as constants so no trig enters the rules. */
const DIRS: [number, number][] = [
  [1, 0], [0.92388, 0.38268], [0.70711, 0.70711], [0.38268, 0.92388], [0, 1], [-0.38268, 0.92388], [-0.70711, 0.70711], [-0.92388, 0.38268],
  [-1, 0], [-0.92388, -0.38268], [-0.70711, -0.70711], [-0.38268, -0.92388], [0, -1], [0.38268, -0.92388], [0.70711, -0.70711], [0.92388, -0.38268],
];

/** A smooth ping-pong in [-1, 1] over `period` ticks (no trig). */
export function swing(tick: number, period: number, phase: number): number {
  const u = (((tick + phase) % period) + period) % period / period;
  const s = u < 0.5 ? u * 2 : 2 - u * 2;
  return s * s * (3 - 2 * s) * 2 - 1;
}
export const cinderX = (c: Cinder, tick: number) => (c.amp ? c.x + c.amp * swing(tick, c.period, c.phase) : c.x);
export const isLit = (s: Star, tick: number) => s.kind !== 'pulsar' || (tick + s.phase) % s.period < s.lit;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function insertByY<T extends { y: number }>(arr: T[], item: T): void {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].y <= item.y) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, item);
}

/** Index of the first item with y ≥ v. */
export function lowerY(arr: { y: number }[], v: number): number {
  let lo = 0, hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid].y < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax, vy = by - ay;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

export class World {
  stars: Star[] = [];
  cinders: Cinder[] = [];
  motes: Mote[] = [];
  /** Generated up to this height. */
  top = 0;
  private rng: Rng;
  private prev: Star;
  private ids = 0;

  constructor(readonly seed: number, readonly mode: Mode) {
    this.rng = new Rng(mixSeed(seed, 0x51a7e));
    const side = this.rng.next() < 0.5 ? -1 : 1;
    this.prev = this.addStar(50 + side * (15 + this.rng.next() * 6), START_Y + 36, 'star', true);
    this.top = this.prev.y;
  }

  /** Grow the sky until it reaches at least y. */
  ensure(y: number): void {
    while (this.top < y) this.grow();
  }

  private addStar(x: number, y: number, kind: StarKind, spine: boolean): Star {
    const rng = this.rng;
    const r = kind === 'giant' ? 6.4 + rng.next() * 1.2 : kind === 'pulsar' ? 3.7 : 3.4 + rng.next() * 1.2;
    const band = kind === 'giant' ? 8.5 : kind === 'pulsar' ? 5.5 : 6;
    const period = kind === 'pulsar' ? 540 + Math.floor(rng.next() * 240) : 1;
    const s: Star = { id: this.ids++, x, y, r, band, kind, period, lit: Math.floor(period * 0.62), phase: Math.floor(rng.next() * period), spine };
    insertByY(this.stars, s);
    return s;
  }

  private clearOfStars(x: number, y: number, need: number, extra = 0): boolean {
    for (let i = lowerY(this.stars, y - 70); i < this.stars.length && this.stars[i].y < y + 70; i++) {
      const s = this.stars[i];
      if (Math.hypot(s.x - x, s.y - y) < s.r + need + extra) return false;
    }
    return true;
  }

  private clearOfCinders(x: number, y: number, need: number): boolean {
    for (let i = lowerY(this.cinders, y - 50); i < this.cinders.length && this.cinders[i].y < y + 50; i++) {
      const c = this.cinders[i];
      if (Math.abs(c.y - y) < need + c.r && Math.abs(c.x - x) < need + c.r + c.amp) return false;
    }
    return true;
  }

  private grow(): void {
    const rng = this.rng;
    const p = this.prev;
    const alt = p.y - START_Y;
    const z = zoneAt(alt);
    const shower = MODES[this.mode].shower;

    // The next star on the spine: always within MAX_LINK of the last one, higher up.
    const gap = 22 + rng.next() * 10 + Math.min(11, alt / 280);
    const side = p.x < 32 ? 1 : p.x > 68 ? -1 : rng.next() < 0.5 ? -1 : 1;
    // Never straight above: a plain fling upward shouldn't fly into the next star.
    // (Further still for the second star: the first swing must never sweep into it.)
    const first = this.stars.length <= 1;
    const minShift = first ? 24 : 13;
    const dir = first ? (p.x < 50 ? 1 : -1) : side;
    let x = clamp(p.x + dir * (minShift + rng.next() * (36 - minShift)), 14, 86);
    let dy = gap;
    if (Math.hypot(x - p.x, dy) > MAX_LINK) dy = Math.max(18, Math.sqrt(Math.max(0, MAX_LINK * MAX_LINK - (x - p.x) ** 2)));
    if (Math.hypot(x - p.x, dy) > MAX_LINK) x = p.x + Math.sign(x - p.x) * Math.sqrt(MAX_LINK * MAX_LINK - dy * dy);
    const roll = rng.next();
    const kind: StarKind = z >= 3 && roll < 0.22 ? 'giant' : z >= 2 && roll < 0.5 && roll >= 0.25 ? 'pulsar' : 'star';
    const s = this.addStar(x, p.y + dy, kind, true);

    // A bonus star off to the other side now and then (a choice, often with motes).
    let bonus: Star | null = null;
    const bonusChance = z >= 4 ? 0.2 : 0.38;
    if (rng.next() < bonusChance) {
      const bx = clamp(100 - s.x + (rng.next() - 0.5) * 20, 12, 88);
      const by = p.y + dy * (0.35 + rng.next() * 0.4);
      if (this.clearOfStars(bx, by, 4.5, 16) && this.clearOfCinders(bx, by, 16)) bonus = this.addStar(bx, by, z >= 2 && rng.next() < 0.3 ? 'pulsar' : 'star', false);
    }

    // Motes: an arc in the corona of a star (graze to collect them), or a line across the gap.
    const mk = rng.next();
    if (mk < 0.45) {
      const host = bonus && rng.next() < 0.6 ? bonus : s;
      const rad = host.r + COMET_R + 2.6 + rng.next() * 2.4;
      const k0 = Math.floor(rng.next() * 16);
      const n = 3 + Math.floor(rng.next() * 3);
      for (let i = 0; i < n; i++) {
        const d = DIRS[(k0 + i) % 16];
        insertByY(this.motes, { id: this.ids++, x: host.x + d[0] * rad, y: host.y + d[1] * rad });
      }
    } else if (mk < 0.8) {
      const nx = -(s.y - p.y), ny = s.x - p.x;
      const nl = Math.hypot(nx, ny) || 1;
      const off = (rng.next() - 0.5) * 16;
      for (const f of [0.38, 0.5, 0.62]) {
        const mx = clamp(p.x + (s.x - p.x) * f + (nx / nl) * off, 6, 94), my = p.y + (s.y - p.y) * f + (ny / nl) * off;
        if (this.clearOfStars(mx, my, 3)) insertByY(this.motes, { id: this.ids++, x: mx, y: my });
      }
    }

    // Cinders: small burning rocks in the gaps, clear of every corona and of the straight line between stars.
    if (z >= 1 || shower) {
      let n = rng.next() < (z >= 4 ? 0.7 : z >= 2 ? 0.48 : 0.33) ? 1 : 0;
      if (z >= 4 && rng.next() < 0.4) n++;
      if (shower) n += rng.next() < 0.7 ? 1 : 0;
      for (let k = 0; k < n; k++) {
        const drift = z >= 3 && rng.next() < 0.45;
        const amp = drift ? 6 + rng.next() * 8 : 0;
        for (let tries = 0; tries < 14; tries++) {
          const cx = 8 + amp + rng.next() * (84 - amp * 2);
          const cy = p.y + 6 + rng.next() * Math.max(1, dy - 20);
          const cr = 1.4 + rng.next() * 0.5;
          let ok = segDist(cx, cy, p.x, p.y, s.x, s.y) > 7 + cr && this.clearOfCinders(cx, cy, 9);
          for (const sx of drift ? [cx - amp, cx - amp / 2, cx, cx + amp / 2, cx + amp] : [cx]) if (ok) ok = this.clearOfStars(sx, cy, cr, 14);
          if (!ok) continue;
          const period = drift ? 720 + Math.floor(rng.next() * 480) : 1;
          insertByY(this.cinders, { id: this.ids++, x: cx, y: cy, r: cr, amp, period, phase: Math.floor(rng.next() * period) });
          break;
        }
      }
    }
    this.prev = s;
    this.top = s.y;
  }
}
