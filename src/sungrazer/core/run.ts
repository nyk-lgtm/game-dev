// A Sungrazer run is a seed, a mode and the ticks at which the button changed
// (press, release, press, …), so replay(seed, mode, inputs) rebuilds it exactly.

import { newRun, step, type Ev, type Run } from './sim';
import { MODE_IDS, TPS, type Mode } from './world';

export const RULES_VERSION = 4;
/** Replays stop here whatever happens (a run can't really last this long). */
export const MAX_TICKS = TPS * 60 * 30;

/** Is the button held at tick t, given toggle ticks? */
export function heldAt(inputs: number[], t: number): boolean {
  let n = 0;
  while (n < inputs.length && inputs[n] <= t) n++;
  return n % 2 === 1;
}

/** Plays inputs from a fresh run until it ends, or until `until` ticks have run. */
export function replay(seed: number, mode: Mode, inputs: number[], until = MAX_TICKS, out?: Ev[]): Run {
  const r = newRun(seed, mode);
  let i = 0, held = false;
  while (r.alive && r.tick < until) {
    while (i < inputs.length && inputs[i] <= r.tick) {
      held = !held;
      i++;
    }
    step(r, held, out);
  }
  return r;
}

export const encodeInputs = (inputs: number[]) => inputs.join('.');
export function decodeInputs(s: string): number[] {
  const out: number[] = [];
  for (const p of s.split('.')) {
    if (!p) continue;
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || (out.length && n < out[out.length - 1])) break;
    out.push(n);
  }
  return out;
}
export const isMode = (m: string | null): m is Mode => !!m && (MODE_IDS as string[]).includes(m);
export const finalScore = (r: Run) => Math.floor(r.score);
