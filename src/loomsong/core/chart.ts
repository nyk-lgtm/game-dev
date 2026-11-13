// Charts: the notes you play, picked from the song's own onsets (lead melody,
// kicks, snares, crashes, bass, hats) so every tap sits on something you hear.
// A pure function of the song and level. Per bar a note budget (density ×
// section intensity) takes the strongest onsets that keep the level's spacing;
// long melody notes become holds, crashes become flicks, and lanes follow the
// melody's contour (up = right), kicks lean left and snares right.

import { Rng, mixSeed } from '../../shared/rng';
import { STEPS_PER_BAR, type Inst, type SectionKind, type Song } from './song';

export const LANES = 4;
export type Level = 0 | 1 | 2;
export type NoteKind = 'tap' | 'hold' | 'flick';

export interface LevelDef {
  id: string;
  name: string;
  /** Notes per second at intensity 1. */
  nps: number;
  /** Closest two note times (ms), chords aside. */
  minGapMs: number;
  /** Closest two notes in one lane (ms). */
  jackMs: number;
  /** Longest run of notes in one lane in a row. */
  maxRun: number;
  holdSteps: number;
  holdMs: number;
  /** Notes inside a hold's span that may be dropped to make it (Infinity: notes play on in other lanes). */
  holdClear: number;
  /** How often a strong two-source onset becomes a two-lane chord. */
  chords: number;
  /** How long a note takes from the top to the line (ms), before the speed setting. */
  scrollMs: number;
}

export const LEVELS: LevelDef[] = [
  { id: 'easy', name: 'Easy', nps: 1.35, minGapMs: 340, jackMs: 560, maxRun: 2, holdSteps: 6, holdMs: 620, holdClear: 1, chords: 0, scrollMs: 1750 },
  { id: 'normal', name: 'Normal', nps: 2.35, minGapMs: 200, jackMs: 300, maxRun: 3, holdSteps: 4, holdMs: 440, holdClear: 1, chords: 0.5, scrollMs: 1450 },
  { id: 'hard', name: 'Hard', nps: 3.7, minGapMs: 104, jackMs: 180, maxRun: 3, holdSteps: 4, holdMs: 320, holdClear: Infinity, chords: 0.45, scrollMs: 1200 },
];
/** A flick needs this much room (ms) from any other note in its lane. */
export const FLICK_CLEAR = 320;

export interface Note {
  id: number;
  /** Time of the head (ms from the song's step 0). */
  t: number;
  /** Time a hold ends (= t for taps and flicks). */
  end: number;
  lane: number;
  kind: NoteKind;
  step: number;
  /** Part of a two-lane chord. */
  chord: boolean;
  /** Which instrument it came from (for stats and the burst colour). */
  src: Inst;
}

export interface Chart {
  level: Level;
  notes: Note[];
  /** Judged objects: every note plus every hold's tail. */
  objects: number;
}

const INTENSITY: Record<SectionKind, number> = { intro: 0.45, verse: 0.85, chorus: 1.18, break: 0.55, outro: 0.6 };

interface Cand {
  step: number;
  pri: number;
  srcs: Set<Inst>;
  lead: { midi: number; len: number } | null;
  crash: boolean;
}

interface Pick {
  step: number;
  kind: NoteKind;
  endStep: number;
  c: Cand;
  chord: boolean;
}

export function makeChart(song: Song, level: Level): Chart {
  const L = LEVELS[level];
  const rng = new Rng(mixSeed(mixSeed(song.seed, 0xc4a7), level));
  const ms = song.stepMs;

  // ---- onsets, merged per step
  const byStep = new Map<number, Cand>();
  const cand = (step: number) => {
    let c = byStep.get(step);
    if (!c) byStep.set(step, (c = { step, pri: 0, srcs: new Set(), lead: null, crash: false }));
    return c;
  };
  for (const n of song.notes) {
    let p = 0;
    switch (n.inst) {
      case 'lead': p = 3 + (n.step % 8 === 0 ? 0.6 : 0) + (n.len >= 4 ? 0.3 : 0); break;
      case 'kick': p = n.vel >= 0.7 ? 2.1 : 0; break;
      case 'snare': p = n.vel >= 0.8 ? 2.4 : n.vel >= 0.55 && level === 2 ? 1.2 : 0; break;
      case 'crash': p = 2.5; break;
      case 'bass': p = level > 0 ? 0.9 : 0; break;
      case 'ohat': p = level === 2 ? 0.8 : 0; break;
      case 'hat': p = level === 2 && n.vel >= 0.4 ? 0.45 : 0; break;
      default: p = 0;
    }
    if (p <= 0) continue;
    const c = cand(n.step);
    c.srcs.add(n.inst);
    c.pri = Math.max(c.pri, p) + (c.srcs.size > 1 ? 0.25 : 0);
    if (n.inst === 'lead') c.lead = { midi: n.midi, len: n.len };
    if (n.inst === 'crash') c.crash = true;
  }

  // ---- pick per bar
  const gapSteps = Math.max(1, Math.ceil(L.minGapMs / ms - 1e-9));
  const taken = new Set<number>();
  const free = (step: number) => {
    for (let k = 1; k < gapSteps; k++) if (taken.has(step - k) || taken.has(step + k)) return false;
    return !taken.has(step);
  };
  const kindOfBar: SectionKind[] = [];
  const firstBar = new Set<number>();
  for (const s of song.sections) {
    for (let b = 0; b < s.bars; b++) kindOfBar.push(s.kind);
    firstBar.add(s.bar);
  }
  let carry = 0.5;
  const barMs = ms * STEPS_PER_BAR;
  for (let bar = 0; bar < song.bars; bar++) {
    carry += (L.nps * INTENSITY[kindOfBar[bar]] * barMs) / 1000;
    let budget = Math.floor(carry);
    carry -= budget;
    // Nothing in the first bar: the song gets a moment to start.
    if (bar === 0) continue;
    const cs: [Cand, number][] = [];
    for (let k = 0; k < STEPS_PER_BAR; k++) {
      const c = byStep.get(bar * STEPS_PER_BAR + k);
      if (c) cs.push([c, c.pri + (k % 4 === 0 ? 0.6 : k % 2 === 0 ? 0.2 : 0) + rng.next() * 0.35]);
    }
    cs.sort((a, b) => b[1] - a[1] || a[0].step - b[0].step);
    for (const [c] of cs) {
      if (budget <= 0) break;
      if (!free(c.step)) continue;
      taken.add(c.step);
      budget--;
    }
  }

  // ---- shapes: holds, flicks, chords
  const steps = [...taken].sort((a, b) => a - b);
  const picks: Pick[] = [];
  const drop = new Set<number>();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (drop.has(step)) continue;
    const c = byStep.get(step)!;
    const bar = Math.floor(step / STEPS_PER_BAR);
    const kind = kindOfBar[bar];
    let p: Pick = { step, kind: 'tap', endStep: step, c, chord: false };
    if (c.crash && step % STEPS_PER_BAR === 0 && (level > 0 || kind === 'chorus') && kind !== 'outro') p.kind = 'flick';
    else if (level === 2 && step % (STEPS_PER_BAR * 4) === 0 && firstBar.has(bar) && kind !== 'outro') p.kind = 'flick';
    else if (c.lead && c.lead.len >= L.holdSteps && c.lead.len * ms >= L.holdMs) {
      const endStep = step + c.lead.len;
      const inside = steps.filter((s) => s > step && s < endStep + gapSteps && !drop.has(s));
      if (inside.length <= L.holdClear || L.holdClear === Infinity) {
        if (L.holdClear !== Infinity) for (const s of inside) drop.add(s);
        p = { ...p, kind: 'hold', endStep };
      }
    }
    if (p.kind === 'flick') {
      // A flick stands alone in its moment: clear the notes right around it.
      for (const s of steps) if (s !== step && Math.abs(s - step) * ms < (level === 0 ? 900 : 240)) drop.add(s);
    }
    picks.push(p);
    // Chords: two sources at once on a strong step.
    if (L.chords > 0 && p.kind !== 'flick' && kind !== 'break' && kind !== 'intro') {
      const strong = level === 2 ? step % 8 === 0 : step % STEPS_PER_BAR === 0 && kind === 'chorus';
      const two = c.srcs.size >= 2 && (c.srcs.has('lead') || c.srcs.has('crash'));
      if (two && strong && rng.next() < L.chords) picks.push({ step, kind: 'tap', endStep: step, c, chord: true });
      else if (level === 2 && two && c.srcs.has('kick') && rng.next() < 0.1) picks.push({ step, kind: 'tap', endStep: step, c, chord: true });
    }
  }

  // ---- lanes
  interface LaneState { end: number; kind: NoteKind | null; run: number }
  const lanes: LaneState[] = Array.from({ length: LANES }, () => ({ end: -1e9, kind: null, run: 0 }));
  let lastLane = 1, lastMidi = -1, prevLane = -1;
  const notes: Note[] = [];
  let partner = -1;
  for (const p of picks) {
    if (drop.has(p.step) && !p.chord) {
      partner = -1;
      continue;
    }
    if (p.chord && partner < 0) continue;
    const t = p.step * ms;
    const end = p.endStep * ms;
    const c = p.c;
    // Preferred lanes, best first.
    let pref: number[];
    if (p.chord) {
      const other = partner;
      pref = (other <= 1 ? [3, 2] : [0, 1]).concat(other <= 1 ? [1 - other] : [5 - other]);
    } else if (c.lead && (c.srcs.has('lead') || p.kind === 'hold')) {
      const diff = lastMidi < 0 ? 0 : c.lead.midi - lastMidi;
      const dir = Math.sign(diff), mag = Math.abs(diff) >= 5 ? 2 : 1;
      let want = lastLane + dir * mag;
      if (want < 0 || want >= LANES) want = lastLane - dir * mag;
      want = Math.max(0, Math.min(LANES - 1, want));
      const tie = [rng.next(), rng.next(), rng.next(), rng.next()];
      pref = [0, 1, 2, 3].sort((a, b) => Math.abs(a - want) - Math.abs(b - want) || tie[a] - tie[b]);
    } else if (c.srcs.has('kick')) pref = rng.next() < 0.5 ? [0, 1, 2, 3] : [1, 0, 2, 3];
    else if (c.srcs.has('snare')) pref = rng.next() < 0.5 ? [3, 2, 1, 0] : [2, 3, 1, 0];
    else pref = [0, 1, 2, 3].sort((a, b) => Math.abs(a - ((lastLane + 2) % 4)) - Math.abs(b - ((lastLane + 2) % 4)));
    const ok = (lane: number, kind: NoteKind, relax: boolean) => {
      if (p.chord && lane === partner) return false;
      const st = lanes[lane];
      const gap = t - st.end;
      if (gap < (st.kind === 'hold' ? Math.max(L.jackMs, 220) : L.jackMs)) return false;
      if ((kind === 'flick' || st.kind === 'flick') && gap < FLICK_CLEAR) return false;
      // Hard lets notes play on in other lanes during a hold; never two holds at once.
      for (let k = 0; k < LANES; k++) if (k !== lane && lanes[k].kind === 'hold' && lanes[k].end > t && (kind === 'hold' || p.chord)) return false;
      if (!relax && lane === prevLane && st.run >= L.maxRun) return false;
      return true;
    };
    let kind = p.kind;
    let lane = pref.find((l) => ok(l, kind, false)) ?? pref.find((l) => ok(l, kind, true)) ?? -1;
    if (lane < 0 && kind !== 'tap') {
      kind = 'tap';
      lane = pref.find((l) => ok(l, kind, true)) ?? -1;
    }
    if (lane < 0) {
      if (!p.chord) partner = -1;
      continue;
    }
    const st = lanes[lane];
    st.run = lane === prevLane ? st.run + 1 : 1;
    st.end = kind === 'hold' ? end : t;
    st.kind = kind;
    notes.push({ id: 0, t, end: kind === 'hold' ? end : t, lane, kind, step: p.step, chord: p.chord, src: c.lead ? 'lead' : [...c.srcs][0] });
    if (p.chord) {
      notes[notes.length - 2].chord = true;
      partner = -1;
    } else partner = lane;
    if (!p.chord) {
      if (c.lead) lastMidi = c.lead.midi;
      lastLane = lane;
    }
    prevLane = lane;
  }
  notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
  notes.forEach((n, i) => (n.id = i));
  return { level, notes, objects: notes.length + notes.filter((n) => n.kind === 'hold').length };
}

/** Stats for the probe and the menu: notes a second, lane balance, longest same-lane run. */
export function chartStats(ch: Chart, song: Song) {
  const n = ch.notes;
  const secs = (n.length ? n[n.length - 1].end - n[0].t : 1) / 1000;
  const lanes = [0, 0, 0, 0];
  let maxJack = 0, run = 0, prev = -1, peak = 0;
  for (let i = 0; i < n.length; i++) {
    lanes[n[i].lane]++;
    run = n[i].lane === prev ? run + 1 : 1;
    prev = n[i].lane;
    maxJack = Math.max(maxJack, run);
    // Busiest 4 s window.
    let j = i;
    while (j < n.length && n[j].t < n[i].t + 4000) j++;
    peak = Math.max(peak, (j - i) / 4);
  }
  const count = (k: NoteKind) => n.filter((x) => x.kind === k).length;
  return {
    notes: n.length,
    nps: n.length / Math.max(1, secs),
    peak,
    holds: count('hold'),
    flicks: count('flick'),
    chords: n.filter((x) => x.chord).length / 2,
    lanes,
    maxJack,
    songS: song.durationMs / 1000,
  };
}
