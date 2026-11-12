// A round of Ninefold: a seed and the shots taken. Shots are stored as
// "angle.power" in thousandths, so a saved round replays exactly.

import { HOLES, makeCourse, type Hole } from './course';
import { simulate, type Shot, type ShotResult } from './physics';

export const RULES_VERSION = 3;
/** Strokes after which the ball is picked up (penalties count). */
export const MAX_STROKES = 8;

export interface Round {
  seed: number;
  holes: Hole[];
  hole: number;
  ball: { x: number; y: number };
  /** Strokes per finished hole, plus the current hole's so far. */
  strokes: number[];
  actions: string[];
  over: boolean;
}

export function newRound(seed: number): Round {
  const holes = makeCourse(seed);
  return { seed, holes, hole: 0, ball: { ...holes[0].tee }, strokes: [0], actions: [], over: false };
}

export const encodeShot = (s: Shot): string => `${Math.round(s.angle * 1000)}.${Math.round(Math.max(0, Math.min(1, s.power)) * 1000)}`;
export function decodeShot(a: string): Shot | null {
  const m = /^(-?\d+)\.(\d+)$/.exec(a);
  return m ? { angle: Number(m[1]) / 1000, power: Number(m[2]) / 1000 } : null;
}

export interface PlayResult extends ShotResult {
  /** The hole just finished (sunk or picked up), if any. */
  finished: boolean;
  pickedUp: boolean;
}

/** Plays one shot (quantized exactly as saved) and advances the round. */
export function play(r: Round, action: string): PlayResult | null {
  if (r.over) return null;
  const shot = decodeShot(action);
  if (!shot) return null;
  const hole = r.holes[r.hole];
  const res = simulate(hole, r.ball, shot);
  r.actions.push(action);
  const h = r.hole;
  r.strokes[h] += res.outcome === 'water' ? 2 : 1;
  if (res.outcome === 'rest') r.ball = { x: res.x, y: res.y };
  // Water: back where you played from, one stroke penalty.
  const done = res.outcome === 'sunk';
  const pickedUp = !done && r.strokes[h] >= MAX_STROKES;
  if (pickedUp) r.strokes[h] = MAX_STROKES;
  if (done || pickedUp) {
    if (h + 1 >= HOLES) r.over = true;
    else {
      r.hole = h + 1;
      r.strokes.push(0);
      r.ball = { ...r.holes[r.hole].tee };
    }
  }
  return { ...res, finished: done || pickedUp, pickedUp };
}

export function replay(seed: number, actions: string[]): Round {
  const r = newRound(seed);
  for (const a of actions) if (!play(r, a)) break;
  return r;
}

export const parTotal = (r: Round, upTo = HOLES) => r.holes.slice(0, upTo).reduce((a, h) => a + h.par, 0);
/** Strokes on finished holes. */
export const finishedStrokes = (r: Round) => r.strokes.slice(0, r.over ? HOLES : r.hole).reduce((a, b) => a + b, 0);
/** Score against par over finished holes. */
export const toPar = (r: Round) => finishedStrokes(r) - parTotal(r, r.over ? HOLES : r.hole);
export const fmtPar = (d: number) => (d === 0 ? 'E' : d > 0 ? `+${d}` : `−${-d}`);

export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return 'Hole in one!';
  const d = strokes - par;
  return d <= -3 ? 'Albatross!' : d === -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : `${fmtPar(d)}`;
}
