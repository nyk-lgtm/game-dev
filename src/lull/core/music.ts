// What the garden plays, step by step, and where its creatures fly. Every note
// is in one major pentatonic scale (no two notes of it clash), and everything is
// a pure function of the garden and the step, so the page can schedule ahead.
//
// Each plant sings its own note (its column) on its own 8th of the bar (its
// lane), once every few bars by kind. Bees (by day), fireflies (by night) and a
// frog (when there are lilies) hop between plants and make them sing on landing.
// Breezy spells strum the garden left to right; rain drips random notes.

import { Rng, mixSeed } from '../../shared/rng';
import { BAR, COLS, DAY, LANES, ROWS, SPECIES, XS, growth, type Garden, type Plant, type Voice } from './garden';
import { dayTime, weatherAt } from './sky';

export const PENT = [0, 2, 4, 7, 9];
export const SOLFA = ['do', 're', 'mi', 'so', 'la'];
/** C, D, F, G or A. */
const ROOTS = [48, 50, 53, 55, 57];
export const KEY_NAMES = ['C', 'D', 'F', 'G', 'A'];
/** At most this many notes start on one step. */
export const MAX_PER_STEP = 6;

export const keyOf = (seed: number): number => mixSeed(seed, 0x6e7) % ROOTS.length;
export const rootOf = (seed: number): number => ROOTS[keyOf(seed)];
export const colOf = (x: number): number => Math.max(0, Math.min(COLS - 1, Math.floor((x * COLS) / XS)));
export const laneOf = (y: number): number => Math.max(0, Math.min(LANES - 1, Math.floor((y * LANES) / ROWS)));
/** Scale degree index (0 = lowest) → semitones above the root. */
export const degSemis = (d: number): number => PENT[((d % 5) + 5) % 5] + 12 * Math.floor(d / 5);
/** Highest note: anything above folds down an octave (still in the scale). */
export const TOP = 93;
const fold = (m: number): number => (m > TOP ? m - 12 * Math.ceil((m - TOP) / 12) : m);
export const midiOf = (seed: number, sp: number, deg: number): number => fold(rootOf(seed) + 12 * SPECIES[sp].oct + degSemis(deg));
/** "mi", "high mi", "low so". */
export const noteName = (col: number): string => `${col < 5 ? 'low ' : 'high '}${SOLFA[col % 5]}`;

const hash = (p: Plant): number => mixSeed(p.x * 64 + p.y, 0x51a7);

export type Why = 'song' | 'visit' | 'gust' | 'drip' | 'strum';
export interface Note {
  /** Plant index (-1 for rain). */
  i: number;
  step: number;
  midi: number;
  voice: Voice;
  vel: number;
  /** Length in steps. */
  len: number;
  why: Why;
}

/** How loud a plant sings at this time of day (0 = asleep). */
export function awake(sp: number, light: number): number {
  const s = SPECIES[sp];
  if (s.sleepsAtNight) return light < 0.25 ? 0 : Math.min(1, light * 1.3);
  if (s.nightSinger) return 0.7 + 0.3 * (1 - light);
  return 0.85;
}

const flourishing = (p: Plant, step: number): boolean => p.flourish > step;
const rainy = (g: Garden, step: number): boolean => {
  const w = weatherAt(g.seed, step);
  return w.kind === 'rain' && w.amt > 0.3;
};

/** Does plant p start its phrase on this step? */
function starts(p: Plant, step: number): boolean {
  const s = SPECIES[p.sp];
  const pos = ((step % BAR) + BAR) % BAR;
  if (pos !== laneOf(p.y) * 2) return false;
  const every = flourishing(p, step) ? Math.max(1, s.every >> 1) : s.every;
  const bar = Math.floor(step / BAR);
  return ((bar + (hash(p) % every)) % every + every) % every === 0;
}

/** The notes that start on `step`, loudest first, at most MAX_PER_STEP. */
export function notesAt(g: Garden, step: number): Note[] {
  const out: Note[] = [];
  const { light } = dayTime(step);
  const deg0 = (p: Plant) => colOf(p.x);
  // Each plant's own phrase.
  g.plants.forEach((p, i) => {
    const gr = growth(p, step);
    if (gr < 0.04) return;
    const aw = awake(p.sp, light);
    if (aw <= 0) return;
    const s = SPECIES[p.sp];
    for (const [dt, dd] of s.phrase) {
      if (!starts(p, step - dt)) continue;
      const vel = (0.3 + 0.7 * gr) * aw * (dd ? 0.8 : 1) * (flourishing(p, step) || rainy(g, step) ? 1.1 : 1);
      out.push({ i, step, midi: midiOf(g.seed, p.sp, deg0(p) + dd), voice: s.voice, vel: Math.min(1, vel), len: s.len, why: 'song' });
      // A flourishing chimebell adds a sparkle an octave up.
      if (flourishing(p, step) && p.sp === 0 && dt === 0) out.push({ i, step, midi: midiOf(g.seed, p.sp, deg0(p) + 5), voice: 'bell', vel: vel * 0.5, len: 6, why: 'song' });
    }
  });
  // Creatures landing.
  for (const c of critterKinds) {
    const n = critterCount(g, c, hopStart(c, hopAt(c, step)));
    for (let k = 0; k < n; k++) {
      const h = hopAt(c, step);
      if (landStep(c, k, h) !== step) continue;
      const i = target(g, c, k, h);
      if (i < 0) continue;
      const p = g.plants[i];
      const s = SPECIES[p.sp];
      const aw = Math.max(0.5, awake(p.sp, light));
      out.push({ i, step, midi: midiOf(g.seed, p.sp, deg0(p) + (c.id === 'frog' ? 0 : k % 2 ? 2 : 1)), voice: s.voice, vel: 0.75 * aw, len: Math.max(2, s.len >> 1), why: 'visit' });
    }
  }
  // A breezy spell strums every grown plant left to right, every 8 bars.
  const w = weatherAt(g.seed, step);
  if (w.kind === 'breezy' && w.amt > 0.5) {
    const bar = Math.floor(step / BAR);
    if (bar % 8 === 4) {
      const pos = step - bar * BAR;
      const grown = g.plants.map((p, i) => ({ p, i })).filter(({ p }) => growth(p, step) >= 0.5 && awake(p.sp, light) > 0);
      grown.forEach(({ p, i }, r) => {
        if (Math.floor((r * 12) / Math.max(1, grown.length)) !== pos) return;
        const s = SPECIES[p.sp];
        out.push({ i, step, midi: midiOf(g.seed, p.sp, deg0(p)), voice: s.voice, vel: 0.45 * w.amt, len: Math.max(2, s.len >> 1), why: 'gust' });
      });
    }
  }
  // Rain drips high glassy notes, even on bare ground.
  if (w.kind === 'rain' && w.amt > 0) {
    const r = new Rng(mixSeed(g.seed ^ 0xd819, step));
    if (r.next() < 0.11 * w.amt) out.push({ i: -1, step, midi: fold(rootOf(g.seed) + 24 + degSemis(r.int(0, 9))), voice: 'glass', vel: 0.25 + 0.2 * r.next(), len: 4, why: 'drip' });
  }
  const rank: Record<Why, number> = { visit: 3, strum: 3, gust: 2, drip: 1, song: 0 };
  out.sort((a, b) => rank[b.why] - rank[a.why] || b.vel - a.vel || a.i - b.i);
  return out.slice(0, MAX_PER_STEP);
}

// ------------------------------------------------------------------ creatures

export interface CritterKind {
  id: 'bee' | 'fly' | 'frog';
  /** Steps per hop. */
  hop: number;
  /** Steps in the air before landing. */
  fly: number;
  /** Landing step within the hop, per creature. */
  land: number[];
  salt: number;
}

export const BEE: CritterKind = { id: 'bee', hop: 16, fly: 7, land: [8, 12, 4, 14, 6], salt: 0xbee };
export const FLY: CritterKind = { id: 'fly', hop: 24, fly: 14, land: [16, 22, 18, 20, 14, 23], salt: 0xf1e };
export const FROG: CritterKind = { id: 'frog', hop: 32, fly: 3, land: [24], salt: 0xf06 };
export const critterKinds = [BEE, FLY, FROG];

export const hopAt = (c: CritterKind, step: number): number => Math.floor(step / c.hop);
export const hopStart = (c: CritterKind, h: number): number => h * c.hop;
export const landStep = (c: CritterKind, k: number, h: number): number => h * c.hop + c.land[k % c.land.length];

/** Plants this kind of creature will land on at `step`. */
export function eligible(g: Garden, c: CritterKind, step: number): number[] {
  const { light } = dayTime(step);
  const out: number[] = [];
  g.plants.forEach((p, i) => {
    const s = SPECIES[p.sp];
    const gr = growth(p, step);
    if (c.id === 'bee' && s.bees && gr >= 0.6 && awake(p.sp, light) > 0) out.push(i);
    else if (c.id === 'fly' && s.flies && gr >= 0.5) out.push(i);
    else if (c.id === 'frog' && (p.sp === 3 || p.sp === 2) && gr >= 0.5) out.push(i);
  });
  return out;
}

/** How many of a kind are out at `step`. */
export function critterCount(g: Garden, c: CritterKind, step: number): number {
  const { light } = dayTime(step);
  const w = weatherAt(g.seed, step);
  if (c.id === 'bee') {
    if (light < 0.6 || (w.kind === 'rain' && w.amt > 0.5)) return 0;
    return Math.min(BEE.land.length, Math.floor(eligible(g, c, step).length / 2));
  }
  if (c.id === 'fly') {
    if (light > 0.3) return 0;
    const el = eligible(g, c, step);
    if (!el.length) return 0;
    const caps = el.filter((i) => g.plants[i].sp === 4).length;
    return Math.min(FLY.land.length, caps + Math.ceil((el.length - caps) / 3));
  }
  return g.plants.some((p) => p.sp === 3 && growth(p, step) >= 0.5) ? 1 : 0;
}

function pick(g: Garden, c: CritterKind, k: number, h: number, avoid: number): number {
  const el = eligible(g, c, hopStart(c, h));
  if (!el.length) return -1;
  const r = new Rng(mixSeed(mixSeed(g.seed ^ c.salt, k), h));
  const choices = el.length > 1 ? el.filter((i) => i !== avoid) : el;
  // Frogs prefer lily pads.
  if (c.id === 'frog') {
    const pads = choices.filter((i) => g.plants[i].sp === 3);
    if (pads.length && r.next() < 0.75) return r.pick(pads);
  }
  return r.pick(choices);
}

/** Where creature k of a kind lands at hop h (a plant index, -1 if nowhere). */
export function target(g: Garden, c: CritterKind, k: number, h: number): number {
  return pick(g, c, k, h, pick(g, c, k, h - 1, -1));
}

export interface CritterPos {
  kind: CritterKind['id'];
  k: number;
  /** Plant flown from and to (from may be -1: arriving from off-screen). */
  from: number;
  to: number;
  /** 0..1 along the flight (1 = sitting on `to`). */
  f: number;
  /** Seconds-free flight phase for wobble: the hop number. */
  h: number;
}

/** Every creature out at a (fractional) step, for drawing. */
export function crittersAt(g: Garden, step: number): CritterPos[] {
  const out: CritterPos[] = [];
  for (const c of critterKinds) {
    // A hop's flight ends at its landing step; after landing it sits until the next flight starts.
    const s = Math.floor(step);
    const h0 = hopAt(c, s);
    const n = critterCount(g, c, hopStart(c, h0));
    for (let k = 0; k < n; k++) {
      let h = h0;
      if (step < landStep(c, k, h) - c.fly) h -= 1;
      const to = target(g, c, k, h);
      if (to < 0) continue;
      const land = landStep(c, k, h);
      const f = Math.max(0, Math.min(1, 1 - (land - step) / c.fly));
      const from = f < 1 ? target(g, c, k, h - 1) : to;
      out.push({ kind: c.id, k, from, to, f, h });
    }
  }
  return out;
}

/** Chord helper: the scale degrees (0..4) the grown plants sing. */
export function degreesSung(g: Garden, step: number, min = 0.5): Set<number> {
  const out = new Set<number>();
  for (const p of g.plants) if (growth(p, step) >= min) out.add(colOf(p.x) % 5);
  return out;
}

export const daysOld = (step: number): number => Math.floor(step / DAY);
