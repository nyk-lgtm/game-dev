// A play is a seed, a level and the input events (song ms after calibration),
// so the song, the chart and the score can always be rebuilt from it.

import { Rng, mixSeed } from '../../shared/rng';
import { makeChart, type Chart, type Level } from './chart';
import { judgePlay, type InputEv, type Result } from './judge';
import { makeSong, type Song } from './song';

export interface Play {
  seed: number;
  level: Level;
  events: InputEv[];
}

export const isLevel = (n: unknown): n is Level => n === 0 || n === 1 || n === 2;

/** Events as `d2840.u250.f0-12…`: kind, lane, then ms since the previous event (negative for a flick stamped at its touch-down). */
export function encodeEvents(evs: InputEv[]): string {
  let prev = 0;
  return evs
    .map((e) => {
      const t = Math.round(e.t);
      const s = `${e.k}${e.lane}${t - prev}`;
      prev = t;
      return s;
    })
    .join('.');
}

export function decodeEvents(s: string): InputEv[] {
  const out: InputEv[] = [];
  let prev = 0;
  for (const p of s.split('.')) {
    const m = /^([duf])([0-3])(-?\d+)$/.exec(p);
    if (!m) continue;
    prev += Number(m[3]);
    out.push({ k: m[1] as InputEv['k'], lane: Number(m[2]), t: prev });
  }
  return out;
}

const cache = new Map<number, Song>();
/** Songs are pure but not free to build; keep the last few. */
export function songFor(seed: number): Song {
  let s = cache.get(seed);
  if (!s) {
    s = makeSong(seed);
    if (cache.size > 6) cache.delete(cache.keys().next().value!);
    cache.set(seed, s);
  }
  return s;
}

export function chartFor(seed: number, level: Level): Chart {
  return makeChart(songFor(seed), level);
}

export function replay(seed: number, level: Level, events: InputEv[]): Result {
  return judgePlay(chartFor(seed, level), events);
}

export interface BotOpts {
  /** Standard deviation of press timing (ms). */
  jitter?: number;
  /** Constant timing bias (ms; positive = late). */
  bias?: number;
  /** Chance to skip a note entirely. */
  skip?: number;
  /** Chance to let go of a hold halfway. */
  drop?: number;
  seed?: number;
}

/** A player bot: presses every note (at its exact time unless told otherwise). Events come out in time order. */
export function botEvents(chart: Chart, o: BotOpts = {}): InputEv[] {
  const rng = new Rng(mixSeed(o.seed ?? 1, 0xb07));
  const gauss = () => {
    let s = 0;
    for (let i = 0; i < 4; i++) s += rng.next();
    return (s - 2) * 1.732;
  };
  const evs: InputEv[] = [];
  for (const n of chart.notes) {
    if (o.skip && rng.next() < o.skip) continue;
    const t = Math.round(n.t + (o.bias ?? 0) + (o.jitter ? gauss() * o.jitter : 0));
    evs.push({ k: 'd', lane: n.lane, t });
    if (n.kind === 'flick') evs.push({ k: 'f', lane: n.lane, t });
    const up = n.kind === 'hold' ? (o.drop && rng.next() < o.drop ? Math.round((n.t + n.end) / 2) : Math.round(n.end) + 15) : t + 50;
    evs.push({ k: 'u', lane: n.lane, t: up });
  }
  return evs
    .map((e, i) => [e, i] as const)
    .sort((a, b) => a[0].t - b[0].t || a[1] - b[1])
    .map((x) => x[0]);
}
