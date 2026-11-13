// Lull's garden: species, terrain (a seeded pond), planting rules, growth, and
// the actions that change a garden. Pure and deterministic: a garden is its seed
// plus timestamped actions, and `encode`/`decode` turn it into a short code
// (every live plant as a planting action, its time given as an age).
//
// Units: x runs 0..999 left to right (the pitch: ten columns of the pentatonic
// scale, low to high), y runs 0..35 back to front (the depth: eight lanes, which
// 8th note of the bar the plant sings on). Time is counted in 16th-note steps.

import { Rng, mixSeed } from '../../shared/rng';

export const RULES_VERSION = 1;
export const XS = 1000;
export const ROWS = 36;
export const COLS = 10;
export const LANES = 8;
export const BAR = 16;
export const BPM = 84;
export const STEP_SEC = 60 / BPM / 4;
/** A whole day and night, in steps (84 bars, four minutes). */
export const DAY = 84 * BAR;
/** A new garden opens early in the morning. */
export const START = Math.round(DAY * 0.07);
export const MAX_PLANTS = 30;
/** Steps a watering takes off a growing plant's time to full size. */
export const BOOST = 72;
/** Steps a watered grown plant flourishes (sings twice as often). */
export const FLOURISH = 8 * BAR;
/** Watering reaches this far (x units; a row counts ROW_U). */
export const WATER_R = 95;
/** One depth row measured in x units (for spacing). */
export const ROW_U = 18;

export type Voice = 'bell' | 'pluck' | 'reed' | 'glass' | 'wood' | 'bass';
export type Ground = 'soil' | 'shore' | 'water';

export interface Species {
  id: string;
  name: string;
  plural: string;
  /** Where it grows: soil (incl. the shore), water, or water and shore. */
  wet: 'no' | 'yes' | 'edge';
  /** Spacing radius in x units. */
  r: number;
  /** Steps from seed to full size. */
  grow: number;
  /** Octave offset from the garden's root. */
  oct: number;
  voice: Voice;
  /** Sings once every `every` bars (halved while flourishing). */
  every: number;
  /** The phrase: [16ths after its lane's step, scale degrees above its own note]. */
  phrase: [number, number][];
  /** Note length in steps. */
  len: number;
  /** Bees visit it by day, fireflies by night. */
  bees: boolean;
  flies: boolean;
  /** Sleeps (silent, closed) at night / sings softer by day. */
  sleepsAtNight: boolean;
  nightSinger: boolean;
  blurb: string;
}

export const SPECIES: Species[] = [
  {
    id: 'bell', name: 'Chimebell', plural: 'Chimebells', wet: 'no', r: 46, grow: 224, oct: 1, voice: 'bell', every: 2, phrase: [[0, 0]], len: 8,
    bees: true, flies: false, sleepsAtNight: true, nightSinger: false,
    blurb: 'Nodding bells that ring by day and fold up at night. Bees love them.',
  },
  {
    id: 'fern', name: 'Harpfern', plural: 'Harpferns', wet: 'no', r: 52, grow: 256, oct: 1, voice: 'pluck', every: 2, phrase: [[0, 0], [1, 1], [2, 2]], len: 2,
    bees: false, flies: true, sleepsAtNight: false, nightSinger: false,
    blurb: 'Plucks a little three-note run up the scale.',
  },
  {
    id: 'reed', name: 'Pipereed', plural: 'Pipereeds', wet: 'edge', r: 40, grow: 192, oct: 0, voice: 'reed', every: 4, phrase: [[0, 0]], len: 10,
    bees: false, flies: true, sleepsAtNight: false, nightSinger: false,
    blurb: 'A long, breathy note. Grows in the pond or on its shore.',
  },
  {
    id: 'lily', name: 'Moonlily', plural: 'Moonlilies', wet: 'yes', r: 56, grow: 224, oct: 1, voice: 'glass', every: 2, phrase: [[0, 0], [2, 2]], len: 8,
    bees: true, flies: true, sleepsAtNight: false, nightSinger: true,
    blurb: 'Glassy chimes from the water, brightest at night. The frog sits on its pads.',
  },
  {
    id: 'cap', name: 'Glowcap', plural: 'Glowcaps', wet: 'no', r: 34, grow: 160, oct: 1, voice: 'wood', every: 1, phrase: [[0, 0]], len: 1,
    bees: false, flies: true, sleepsAtNight: false, nightSinger: true,
    blurb: 'A soft wooden knock every bar. Glows at night and draws the fireflies.',
  },
  {
    id: 'willow', name: 'Humwillow', plural: 'Humwillows', wet: 'no', r: 80, grow: 448, oct: -1, voice: 'bass', every: 4, phrase: [[0, 0]], len: 16,
    bees: true, flies: false, sleepsAtNight: false, nightSinger: false,
    blurb: 'A slow little tree that hums the low notes. Takes a while to grow.',
  },
];

export interface Plant {
  sp: number;
  x: number;
  y: number;
  /** Step it was planted, moved earlier by watering (growth = (now - born) / grow). */
  born: number;
  /** Flourishes until this step. */
  flourish: number;
}

export interface Pond {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface Garden {
  seed: number;
  /** The current step. */
  now: number;
  /** Sorted by x, then y (a canonical order: creatures pick from it). */
  plants: Plant[];
  pond: Pond[];
}

export type ActKind = 'P' | 'W' | 'X';
export interface Action {
  t: number;
  k: ActKind;
  sp?: number;
  x: number;
  y: number;
}

export function pondOf(seed: number): Pond[] {
  const r = new Rng(mixSeed(seed, 0x90d));
  const cx = 260 + r.int(0, 480);
  const cy = r.int(15, 21);
  const main: Pond = { cx, cy, rx: r.int(150, 200), ry: r.int(5, 6) };
  const out = [main];
  const lobes = r.int(1, 2);
  for (let i = 0; i < lobes; i++) {
    const side = r.next() < 0.5 ? -1 : 1;
    out.push({ cx: cx + side * r.int(70, 130), cy: cy + r.int(-2, 3), rx: r.int(80, 120), ry: r.int(3, 5) });
  }
  return out;
}

export function newGarden(seed: number, now = START): Garden {
  return { seed: seed >>> 0, now, plants: [], pond: pondOf(seed >>> 0) };
}

export function cloneGarden(g: Garden): Garden {
  return { seed: g.seed, now: g.now, pond: g.pond, plants: g.plants.map((p) => ({ ...p })) };
}

/** Smallest normalized ellipse distance² to the pond (< 1 inside). */
export function pondDist(g: Garden, x: number, y: number): number {
  let best = Infinity;
  for (const e of g.pond) {
    const dx = (x - e.cx) / e.rx;
    const dy = (y - e.cy) / e.ry;
    best = Math.min(best, dx * dx + dy * dy);
  }
  return best;
}

export function groundAt(g: Garden, x: number, y: number): Ground {
  const d = pondDist(g, x, y);
  return d < 1 ? 'water' : d < 1.8 ? 'shore' : 'soil';
}

export const growth = (p: Plant, step: number): number => Math.max(0, Math.min(1, (step - p.born) / SPECIES[p.sp].grow));

const dist2 = (ax: number, ay: number, bx: number, by: number): number => (ax - bx) ** 2 + ((ay - by) * ROW_U) ** 2;

export type PlantError = 'full' | 'water' | 'dry' | 'edge' | 'close' | 'bounds';

/** Why a plant can't go here (null when it can). `near` is the plant in the way. */
export function plantError(g: Garden, sp: number, x: number, y: number): { err: PlantError; near?: number } | null {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= XS || y < 0 || y >= ROWS || !SPECIES[sp]) return { err: 'bounds' };
  if (g.plants.length >= MAX_PLANTS) return { err: 'full' };
  const s = SPECIES[sp];
  const gr = groundAt(g, x, y);
  if (s.wet === 'yes' && gr !== 'water') return { err: 'water' };
  if (s.wet === 'no' && gr === 'water') return { err: 'dry' };
  if (s.wet === 'edge' && gr === 'soil') return { err: 'edge' };
  let near = -1;
  let nd = Infinity;
  g.plants.forEach((p, i) => {
    const need = (s.r + SPECIES[p.sp].r) / 2;
    const d = dist2(x, y, p.x, p.y);
    if (d < need * need && d < nd) {
      nd = d;
      near = i;
    }
  });
  return near >= 0 ? { err: 'close', near } : null;
}

const order = (a: Plant, b: Plant) => a.x - b.x || a.y - b.y;

/** Applies one action (mutates). False if it changed nothing (an invalid plant or dig). */
export function apply(g: Garden, a: Action): boolean {
  if (a.t < g.now) return false;
  g.now = a.t;
  if (a.k === 'P') {
    const sp = a.sp ?? -1;
    if (plantError(g, sp, a.x, a.y)) return false;
    g.plants.push({ sp, x: a.x, y: a.y, born: a.t, flourish: -1 });
    g.plants.sort(order);
    return true;
  }
  if (a.k === 'X') {
    const i = g.plants.findIndex((p) => p.x === a.x && p.y === a.y);
    if (i < 0) return false;
    g.plants.splice(i, 1);
    return true;
  }
  // Water: growing plants in reach grow faster, grown ones flourish.
  let any = false;
  for (const p of watered(g, a.x, a.y)) {
    const s = SPECIES[p.sp];
    if (growth(p, a.t) < 1) p.born = Math.max(p.born - BOOST, a.t - s.grow);
    else p.flourish = a.t + FLOURISH;
    any = true;
  }
  return any;
}

/** Plants a watering at (x, y) reaches. */
export function watered(g: Garden, x: number, y: number): Plant[] {
  return g.plants.filter((p) => dist2(x, y, p.x, p.y) <= WATER_R * WATER_R);
}

export function replay(seed: number, acts: Action[], start = START, now?: number): Garden {
  const g = newGarden(seed, start);
  for (const a of acts) apply(g, a);
  if (now !== undefined && now > g.now) g.now = now;
  return g;
}

// ------------------------------------------------------------------ codes

const b36 = (n: number, w: number) => n.toString(36).padStart(w, '0');
const AGE_MAX = 36 * 36 - 1;

/**
 * The garden as a short code: rules version, seed, the current step, then six
 * characters a plant (species, x, y, age). Growth only depends on age, capped at
 * full size, so decoding replays the same garden (watering's flourish is dropped).
 */
export function encode(g: Garden): string {
  const ps = g.plants
    .map((p) => {
      const age = Math.min(SPECIES[p.sp].grow, Math.max(0, g.now - p.born));
      return String.fromCharCode(97 + p.sp) + b36(p.x, 2) + b36(p.y, 1) + b36(Math.min(AGE_MAX, age), 2);
    })
    .join('');
  return `${RULES_VERSION}.${g.seed.toString(36)}.${Math.max(0, Math.floor(g.now)).toString(36)}.${ps}`;
}

/** The planting actions a code stands for (null if it isn't one). */
export function decodeActions(code: string): { seed: number; now: number; acts: Action[] } | null {
  const m = /^(\d+)\.([0-9a-z]{1,7})\.([0-9a-z]{1,8})\.((?:[a-z][0-9a-z]{5})*)$/.exec(code.trim().toLowerCase());
  if (!m || Number(m[1]) !== RULES_VERSION) return null;
  const seed = parseInt(m[2], 36);
  const now = parseInt(m[3], 36);
  if (!Number.isFinite(seed) || seed > 0xffffffff || !Number.isFinite(now)) return null;
  const acts: Action[] = [];
  for (let i = 0; i < m[4].length; i += 6) {
    const sp = m[4].charCodeAt(i) - 97;
    const x = parseInt(m[4].slice(i + 1, i + 3), 36);
    const y = parseInt(m[4].slice(i + 3, i + 4), 36);
    const age = parseInt(m[4].slice(i + 4, i + 6), 36);
    if (!SPECIES[sp]) return null;
    acts.push({ t: now - age, k: 'P', sp, x, y });
  }
  acts.sort((a, b) => a.t - b.t);
  return { seed, now, acts };
}

export function decode(code: string): Garden | null {
  const d = decodeActions(code);
  if (!d) return null;
  const start = Math.min(d.now, d.acts[0]?.t ?? d.now);
  const g = newGarden(d.seed, start);
  for (const a of d.acts) if (!apply(g, a)) return null;
  g.now = d.now;
  return g;
}

/** Same plants, same growth from now on (flourish aside). */
export function sameGarden(a: Garden, b: Garden): boolean {
  if (a.seed !== b.seed || a.plants.length !== b.plants.length) return false;
  return a.plants.every((p, i) => {
    const q = b.plants[i];
    return p.sp === q.sp && p.x === q.x && p.y === q.y && growth(p, a.now) === growth(q, b.now);
  });
}
