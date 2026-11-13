// Time of day and weather, both pure functions of the seed and the step.

import { Rng, mixSeed } from '../../shared/rng';
import { DAY } from './garden';

export type Phase = 'dawn' | 'day' | 'dusk' | 'night';

/** Where the day turns (fractions of DAY): dawn ends, dusk starts, night starts, dawn starts. */
export const DAWN_END = 0.07;
export const DUSK = 0.5;
export const NIGHT = 0.6;
export const DAWN = 0.97;
/** Light when the day's first phase (dawn) begins its second half, at t = 0. */
const DAWN_LIGHT = 0.3;

export interface DayTime {
  /** 1-based day number. */
  day: number;
  /** 0..1 through the day. */
  t: number;
  phase: Phase;
  /** 1 at noon-ish, 0 at night, ramps through dawn and dusk. */
  light: number;
}

export function dayTime(step: number): DayTime {
  const day = Math.floor(step / DAY);
  const t = (step - day * DAY) / DAY;
  let phase: Phase;
  let light: number;
  if (t < DAWN_END) {
    phase = 'dawn';
    light = DAWN_LIGHT + (1 - DAWN_LIGHT) * (t / DAWN_END);
  } else if (t < DUSK) {
    phase = 'day';
    light = 1;
  } else if (t < NIGHT) {
    phase = 'dusk';
    light = 1 - (t - DUSK) / (NIGHT - DUSK);
  } else if (t < DAWN) {
    phase = 'night';
    light = 0;
  } else {
    phase = 'dawn';
    light = (DAWN_LIGHT * (t - DAWN)) / (1 - DAWN);
  }
  return { day: day + 1, t, phase, light };
}

export type WeatherKind = 'clear' | 'breezy' | 'rain' | 'mist';
export interface Weather {
  kind: WeatherKind;
  /** 0..1: how strong right now (it eases in and out of each spell). */
  amt: number;
}

/** Weather comes in spells of half a day. */
export const SPELL = DAY / 2;
const KINDS: WeatherKind[] = ['clear', 'clear', 'clear', 'breezy', 'breezy', 'breezy', 'rain', 'rain', 'mist', 'mist'];
const EASE = 6 * 16;

export function spellKind(seed: number, w: number): WeatherKind {
  // The first morning is always clear.
  if (w <= 0) return 'clear';
  return new Rng(mixSeed(seed ^ 0x5eed7, w)).pick(KINDS);
}

export function weatherAt(seed: number, step: number): Weather {
  const w = Math.floor(step / SPELL);
  const kind = spellKind(seed, w);
  if (kind === 'clear') return { kind, amt: 0 };
  const pos = step - w * SPELL;
  // Ease in unless the spell before was the same, ease out unless the next one is.
  const a = spellKind(seed, w - 1) === kind ? 1 : Math.min(1, pos / EASE);
  const b = spellKind(seed, w + 1) === kind ? 1 : Math.min(1, (SPELL - pos) / EASE);
  return { kind, amt: Math.max(0, Math.min(a, b)) };
}
