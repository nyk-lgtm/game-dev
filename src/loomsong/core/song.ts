// Loomsong songs: a pure function of the seed. Key, mode, tempo (90-140 BPM),
// two chord progressions (verse and chorus), a section plan sized to ~90-120 s,
// drums, bass, pads, an arpeggio and a motif-based lead melody. Everything is
// in 16th-note steps (16 a bar, 4/4); the player turns steps into audio times
// and the chart generator reads the same notes, so taps land on the music.

import { Rng, mixSeed } from '../../shared/rng';

export const RULES_VERSION = 1;
export const STEPS_PER_BAR = 16;

export type Inst = 'kick' | 'snare' | 'hat' | 'ohat' | 'crash' | 'bass' | 'pad' | 'lead' | 'arp';
export type SectionKind = 'intro' | 'verse' | 'chorus' | 'break' | 'outro';
export type ModeName = 'major' | 'minor' | 'dorian' | 'mixolydian';
export type LeadTone = 'square' | 'triangle' | 'saw' | 'bell';

export interface SNote {
  step: number;
  /** Length in steps. */
  len: number;
  inst: Inst;
  midi: number;
  /** 0..1 */
  vel: number;
}

export interface Section {
  kind: SectionKind;
  bar: number;
  bars: number;
}

export interface Song {
  seed: number;
  name: string;
  bpm: number;
  /** Pitch class of the tonic (0 = C). */
  root: number;
  mode: ModeName;
  lead: LeadTone;
  bars: number;
  steps: number;
  /** Milliseconds per 16th step. */
  stepMs: number;
  sections: Section[];
  /** Each bar's chord as MIDI notes (pad voicing). */
  chords: number[][];
  /** Sorted by step (then instrument order of creation). */
  notes: SNote[];
  durationMs: number;
}

export const SCALES: Record<ModeName, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
};
const MODE_IDS: ModeName[] = ['major', 'minor', 'minor', 'dorian', 'mixolydian'];
/** Four-chord progressions as scale degrees (0 = tonic), per mode. */
const PROGS: Record<ModeName, number[][]> = {
  major: [[0, 4, 5, 3], [0, 5, 3, 4], [5, 3, 0, 4], [0, 3, 5, 4], [3, 4, 0, 5], [0, 2, 3, 4]],
  minor: [[0, 5, 2, 6], [0, 3, 6, 2], [0, 5, 3, 4], [0, 6, 5, 6], [5, 6, 0, 0], [0, 3, 4, 0]],
  dorian: [[0, 3, 0, 3], [0, 6, 3, 0], [0, 3, 6, 4], [0, 1, 3, 0]],
  mixolydian: [[0, 6, 3, 0], [0, 4, 6, 3], [0, 6, 0, 3], [3, 6, 0, 0]],
};
export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

const ADJ = ['Copper', 'Slow', 'Paper', 'Velvet', 'Hollow', 'Amber', 'Quiet', 'Salt', 'Linen', 'Indigo', 'Silver', 'Midnight', 'Tangled', 'Golden', 'Wandering', 'Crimson', 'Distant', 'Woven', 'Little', 'Restless', 'Ember', 'Glass', 'Northern', 'Sunday', 'Hidden', 'Paper', 'Lucky', 'Patient', 'Drifting', 'Rusty', 'Bright', 'Lantern'];
const NOUN = ['Lanterns', 'Rain', 'Thread', 'Harbour', 'Orchard', 'Spindle', 'Kites', 'Shuttle', 'Moths', 'Ferry', 'Tide', 'Weather', 'Bobbin', 'Garden', 'Signal', 'Rooftops', 'Embers', 'Meadow', 'Heron', 'Clockwork', 'Satellites', 'Marbles', 'Wool', 'Comets', 'Fireflies', 'Postcards', 'Tram', 'Pocket', 'Sparrows', 'Ribbon', 'Loom', 'Lighthouse'];

/** One stream per purpose, so adding a part never shifts another. */
const rngFor = (seed: number, part: number) => new Rng(mixSeed(mixSeed(seed, 0x5017), part));

// Drum grooves as 16-step strings ('x' loud, 'o' soft).
const KICKS = ['x.......x.......', 'x.........x.....', 'x.....x...x.....', 'x..x....x.x.....', 'x.....x.x.......', 'x.......x..x....', 'x..x..x...x.....'];
const KICKS_BUSY = ['x.....x.x.x.....', 'x..x..x.x.......', 'x.x...x...x..x..', 'x.....x.x..x..x.'];
const SNARE_BACK = '....x.......x...';
const SNARE_HALF = '........x.......';

/** Rhythm cells for one beat (4 steps): onsets inside the beat, with a weight. */
const CELLS: [number[], number][] = [
  [[0], 5], [[0, 2], 5], [[2], 2], [[], 2], [[0, 3], 2], [[0, 2, 3], 1.5], [[0, 1, 2], 1], [[1, 2], 0.6], [[0, 1, 2, 3], 0.6],
];
const CELLS_SPARSE: [number[], number][] = [[[0], 6], [[], 4], [[0, 2], 2], [[2], 1]];

function weighted<T>(rng: Rng, xs: [T, number][]): T {
  let tot = 0;
  for (const [, w] of xs) tot += w;
  let r = rng.next() * tot;
  for (const [x, w] of xs) if ((r -= w) < 0) return x;
  return xs[xs.length - 1][0];
}

/** The section plan: intro, verse/chorus pairs (with a break) and an outro, sized to the tempo. */
const FORMS = [
  'i4 v4 c8 v8 c8 o4',
  'i4 v8 c8 v8 c8 o4',
  'i4 v8 c8 v8 b4 c8 o4',
  'i4 v8 c8 b4 v8 c8 o4',
  'i4 v8 c8 v8 b4 c8 c8 o4',
  'i4 v8 c8 v8 c8 b4 c8 c8 o4',
  'i4 v8 c8 v8 c8 b4 v8 c8 c8 o4',
];
const KIND: Record<string, SectionKind> = { i: 'intro', v: 'verse', c: 'chorus', b: 'break', o: 'outro' };

/** The section plan: one of a few song forms whose length at this tempo lands in 90-120 s. */
export function plan(bpm: number, rng: Rng): Section[] {
  const barS = (60 / bpm) * 4;
  const secs = (f: string) => (f.split(' ').reduce((n, x) => n + Number(x.slice(1)), 0) + 1) * barS;
  const fits = FORMS.filter((f) => secs(f) >= 90 && secs(f) <= 120);
  const form = fits.length ? rng.pick(fits) : FORMS.reduce((a, b) => (Math.abs(secs(a) - 105) <= Math.abs(secs(b) - 105) ? a : b));
  const out: Section[] = [];
  let bar = 0;
  for (const part of form.split(' ')) {
    const n = Number(part.slice(1));
    out.push({ kind: KIND[part[0]], bar, bars: n });
    bar += n;
  }
  return out;
}

/** Diatonic triad on scale degree d as pitch classes relative to the tonic. */
function triad(scale: number[], d: number): number[] {
  return [0, 2, 4].map((k) => scale[(d + k) % 7] + 12 * Math.floor((d + k) / 7));
}

/** Voice a chord near the previous one (smallest total movement), within 52-74. */
function voice(pcs: number[], root: number, prev: number[] | null): number[] {
  let best: number[] = [], bestCost = Infinity;
  for (let inv = 0; inv < 3; inv++) {
    const ns = pcs.map((p, i) => root + p + (i < inv ? 12 : 0));
    for (const shift of [36, 48, 60]) {
      const v = ns.map((n) => n + shift).sort((a, b) => a - b);
      if (v[0] < 52 || v[2] > 74) continue;
      const cost = prev ? v.reduce((s, n, i) => s + Math.abs(n - prev[i]), 0) : Math.abs(v[1] - 62);
      if (cost < bestCost) {
        bestCost = cost;
        best = v;
      }
    }
  }
  return best;
}

export function makeSong(seed: number): Song {
  const rng = rngFor(seed, 1);
  const bpm = 90 + 2 * rng.int(0, 25);
  const root = rng.int(0, 11);
  const mode = rng.pick(MODE_IDS);
  const scale = SCALES[mode];
  const lead = rng.pick<LeadTone>(['square', 'triangle', 'saw', 'bell']);
  const sections = plan(bpm, rngFor(seed, 2));
  const bars = sections.reduce((s, x) => s + x.bars, 0);
  const steps = bars * STEPS_PER_BAR;
  const stepMs = 60000 / bpm / 4;
  const name = `${rngFor(seed, 3).pick(ADJ)} ${rngFor(seed, 4).pick(NOUN)}`;

  // Harmony: a verse and a chorus progression (different ones), a chord a bar.
  const hr = rngFor(seed, 5);
  const progs = PROGS[mode];
  const pv = hr.pick(progs);
  let pc = hr.pick(progs);
  for (let k = 0; k < 4 && pc === pv; k++) pc = hr.pick(progs);
  const degrees: number[] = [];
  const kindOf: SectionKind[] = [];
  for (const s of sections)
    for (let b = 0; b < s.bars; b++) {
      const prog = s.kind === 'chorus' ? pc : pv;
      // The outro lands on the tonic for its last two bars.
      degrees.push(s.kind === 'outro' && b >= 2 ? 0 : prog[b % 4]);
      kindOf.push(s.kind);
    }
  const chords: number[][] = [];
  let prev: number[] | null = null;
  for (const d of degrees) {
    prev = voice(triad(scale, d), root, prev);
    chords.push(prev);
  }

  const notes: SNote[] = [];
  const add = (step: number, len: number, inst: Inst, midi: number, vel: number) => notes.push({ step, len, inst, midi, vel });

  // ---- drums
  const dr = rngFor(seed, 6);
  const kVerse = dr.pick(KICKS);
  const kChorus = dr.pick(KICKS_BUSY);
  const halfTime = bpm >= 124 && dr.next() < 0.35;
  const snarePat = halfTime ? SNARE_HALF : SNARE_BACK;
  const hats16 = bpm <= 112 && dr.next() < 0.6;
  for (const s of sections) {
    for (let b = 0; b < s.bars; b++) {
      const bar = s.bar + b;
      const at = bar * STEPS_PER_BAR;
      const lastOfPhrase = b % 4 === 3;
      const lastOfSection = b === s.bars - 1;
      if (b === 0 && (s.kind === 'chorus' || (s.kind === 'verse' && s.bar > 4))) add(at, 16, 'crash', 0, 0.8);
      if (s.kind === 'break') {
        if (b % 2 === 0) add(at, 2, 'kick', 0, 0.55);
        if (lastOfSection) for (const k of [8, 10, 12, 13, 14, 15]) add(at + k, 1, 'snare', 0, 0.35 + k * 0.035);
        continue;
      }
      if (s.kind === 'outro' && b === s.bars - 1) {
        add(at, 16, 'crash', 0, 0.9);
        add(at, 2, 'kick', 0, 1);
        continue;
      }
      const kick = s.kind === 'chorus' ? kChorus : s.kind === 'intro' ? (b < 2 ? 'x.......x.......' : kVerse) : kVerse;
      const fill = lastOfSection && s.kind !== 'outro';
      for (let k = 0; k < 16; k++) {
        if (fill && k >= 12) continue;
        if (kick[k] === 'x') add(at + k, 2, 'kick', 0, k === 0 ? 1 : 0.85);
        if (s.kind !== 'intro' || b >= 2) if (snarePat[k] === 'x') add(at + k, 2, 'snare', 0, 0.9);
        const hatOn = s.kind === 'chorus' ? hats16 || k % 2 === 0 : k % 2 === 0;
        if (hatOn && !(s.kind === 'intro' && b < 1)) {
          if (k === 14 && s.kind === 'chorus') add(at + k, 2, 'ohat', 0, 0.5);
          else add(at + k, 1, 'hat', 0, k % 4 === 0 ? 0.55 : k % 2 === 0 ? 0.4 : 0.28);
        }
      }
      if (!fill && lastOfPhrase && s.kind !== 'intro' && dr.next() < 0.6) add(at + 15, 1, 'snare', 0, 0.35);
      if (fill) {
        const pat = dr.pick([[12, 13, 14, 15], [12, 14, 15], [12, 14], [13, 14, 15]]);
        for (const k of pat) add(at + k, 1, 'snare', 0, 0.6 + (k - 12) * 0.1);
        if (dr.next() < 0.5) add(at + 12, 2, 'kick', 0, 0.8);
      }
    }
  }

  // ---- bass: chord roots on the groove
  const br = rngFor(seed, 7);
  const bassStyle = br.pick(['kick', 'eighths', 'syncop'] as const);
  for (const s of sections) {
    if (s.kind === 'intro') continue;
    for (let b = 0; b < s.bars; b++) {
      const bar = s.bar + b;
      const at = bar * STEPS_PER_BAR;
      const low = 36 + ((root + scale[degrees[bar]]) % 12); // C2..B2
      const fifth = low + 7;
      if (s.kind === 'break' || (s.kind === 'outro' && b >= 2)) {
        add(at, 16, 'bass', low, 0.7);
        continue;
      }
      const style = s.kind === 'chorus' && bassStyle === 'kick' ? 'eighths' : bassStyle;
      if (style === 'kick') {
        const kick = kVerse;
        const ons = [...kick].map((c, k) => (c === 'x' ? k : -1)).filter((k) => k >= 0);
        ons.forEach((k, i) => add(at + k, (ons[i + 1] ?? 16) - k, 'bass', i === ons.length - 1 && k >= 8 ? fifth : low, 0.8));
      } else if (style === 'eighths') {
        for (let k = 0; k < 16; k += 2) add(at + k, 2, 'bass', k % 4 === 2 && s.kind === 'chorus' ? low + 12 : low, k === 0 ? 0.85 : 0.6);
      } else {
        for (const [k, n, l] of [[0, low, 3], [3, low, 3], [6, fifth, 4], [10, low, 2], [12, low + 12, 2], [14, fifth, 2]] as const) add(at + k, l, 'bass', n, k === 0 ? 0.85 : 0.65);
      }
    }
  }

  // ---- pads (whole bars) and the chorus arpeggio
  const ar = rngFor(seed, 8);
  const arpShape = ar.pick([[0, 1, 2, 1], [0, 1, 2, 3], [2, 1, 0, 1], [0, 2, 1, 2]]);
  for (const s of sections)
    for (let b = 0; b < s.bars; b++) {
      const bar = s.bar + b;
      const at = bar * STEPS_PER_BAR;
      const ch = chords[bar];
      const last = s.kind === 'outro' && b === s.bars - 1;
      for (const n of ch) add(at, last ? 24 : 16, 'pad', n, s.kind === 'break' ? 0.55 : 0.4);
      if (s.kind === 'chorus' || (s.kind === 'intro' && b >= 2)) {
        const tones = [ch[0] + 12, ch[1] + 12, ch[2] + 12, ch[0] + 24];
        for (let k = 0; k < 16; k += s.kind === 'chorus' ? 1 : 2) add(at + k, 1, 'arp', tones[arpShape[(k >> (s.kind === 'chorus' ? 0 : 1)) % 4]], k % 4 === 0 ? 0.5 : 0.32);
      }
    }

  // ---- lead melody
  melody(seed, sections, degrees, scale, root, add);

  notes.sort((a, b) => a.step - b.step);
  return { seed, name, bpm, root, mode, lead, bars, steps, stepMs, sections, chords, notes, durationMs: (steps + STEPS_PER_BAR) * stepMs };
}

interface Motif {
  /** Onset steps within 2 bars (0..31) and lengths. */
  on: number[];
  len: number[];
  /** Scale-degree offsets from the chord root for each onset. */
  deg: number[];
}

function makeMotif(rng: Rng, busy: number, sparse = false): Motif {
  const on: number[] = [];
  for (let beat = 0; beat < 8; beat++) {
    // The last beat of the two bars rests half the time (a breath before the next phrase).
    if (beat === 7 && rng.next() < 0.5) continue;
    let cell = weighted(rng, sparse ? CELLS_SPARSE : CELLS);
    if (busy > 0 && cell.length < 2 && rng.next() < busy) cell = rng.pick([[0, 2], [0, 2, 3], [0, 3]]);
    for (const k of cell) on.push(beat * 4 + k);
  }
  if (!on.length || on[0] !== 0) on.unshift(0);
  const len = on.map((s, i) => Math.max(1, Math.min((on[i + 1] ?? 32) - s, 8)));
  // A contour: mostly steps, a leap now and then, starting on a chord tone.
  const deg: number[] = [];
  let d = rng.pick([0, 2, 4]);
  for (let i = 0; i < on.length; i++) {
    deg.push(d);
    const r = rng.next();
    const mv = r < 0.18 ? 0 : r < 0.78 ? (rng.next() < 0.5 ? 1 : -1) : rng.pick([-3, -2, 2, 3, 4]);
    d = Math.max(-3, Math.min(7, d + mv));
  }
  return { on, len, deg };
}

/** The lead: per section a two-bar motif, repeated over the chords with a varied answer and a cadence. */
function melody(seed: number, sections: Section[], degrees: number[], scale: number[], root: number, add: (step: number, len: number, inst: Inst, midi: number, vel: number) => void): void {
  const rng = rngFor(seed, 9);
  const verse = makeMotif(rng, 0);
  const chorus = makeMotif(rng, 0.35);
  const answerV = makeMotif(rng, 0.1);
  const answerC = makeMotif(rng, 0.3);
  const brk = makeMotif(rng, 0, true);
  const base = 60 + root - (root > 7 ? 12 : 0); // the tonic, G♯3..G4
  // Scale index → MIDI, chord-aware: strong beats snap to the bar's chord tones.
  const midiOf = (idx: number) => base + scale[((idx % 7) + 7) % 7] + 12 * Math.floor(idx / 7);
  const chordIdx = (bar: number) => [0, 2, 4].map((k) => degrees[bar] + k);
  for (const s of sections) {
    if (s.kind === 'intro') continue;
    const lift = s.kind === 'chorus' ? 2 : 0;
    for (let b = 0; b < s.bars; b += 2) {
      const phraseBar = b % 8;
      let m: Motif;
      if (s.kind === 'break') m = brk;
      else if (s.kind === 'outro') m = b === 0 ? verse : { on: [0], len: [24], deg: [0] };
      else if (phraseBar === 2 || phraseBar === 6) m = s.kind === 'chorus' ? answerC : answerV;
      else m = s.kind === 'chorus' ? chorus : verse;
      const cadence = s.kind !== 'break' && s.kind !== 'outro' && (phraseBar === 6 || b + 2 >= s.bars);
      for (let i = 0; i < m.on.length; i++) {
        const st = m.on[i];
        const bar = s.bar + b + (st >> 4);
        if (bar >= s.bar + s.bars) break;
        const strong = st % 8 === 0;
        // Follow the harmony: the motif rides on the bar's chord root.
        let idx = degrees[bar] + m.deg[i] + lift;
        while (idx > 9) idx -= 7;
        while (idx < -2) idx += 7;
        if (strong) {
          let bestI = idx, bd = 99;
          for (const c of chordIdx(bar)) for (const o of [-7, 0, 7]) if (Math.abs(c + o - idx) < bd) { bd = Math.abs(c + o - idx); bestI = c + o; }
          idx = bestI;
        }
        let len = m.len[i];
        const lastNote = i === m.on.length - 1 || (m.on[i + 1] >> 4) + b + s.bar >= s.bar + s.bars;
        if (cadence && lastNote) {
          // End the phrase on the tonic (or its third), held.
          idx = idx > 3 ? 7 : idx < -1 ? 0 : rng.pick([0, 2]);
          len = Math.max(len, Math.min(8, 32 - st));
        }
        add(s.bar * STEPS_PER_BAR + b * STEPS_PER_BAR + st, Math.max(1, len - (len > 2 ? 1 : 0)), 'lead', midiOf(idx), strong ? 0.9 : 0.75);
      }
    }
  }
}

export const keyName = (s: Song) => `${NOTE_NAMES[s.root]} ${s.mode}`;
export const stepTime = (s: Song, step: number) => step * s.stepMs;
