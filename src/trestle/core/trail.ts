// The trail: the tutorials, then a fixed run of generated levels picked and
// ordered offline so the difficulty rises steadily and the types rotate
// (pool.ts, made by scripts/trestle/pool.ts), then live levels at full
// difficulty. Level n is the same for everyone. `judge` replays a build.

import { costOf, replayBuild } from './build';
import { dailyName, makeLevel, trailName, trailSeed, isLantern, type LevelType } from './gen';
import { starsFor, type Level } from './level';
import { POOL } from './pool';
import { WON, runSim, type Outcome } from './sim';
import { TUTORIALS } from './tutorials';

export const DAILY_D = 0.55;

/** The type rotation for live levels past the pool. */
const ROTATION: LevelType[] = ['plain', 'wall', 'hooks', 'arch', 'gap', 'boat', 'spire', 'convoy', 'island'];

/** Level n of the trail (1-based). */
export function trailLevel(n: number): Level {
  if (n <= TUTORIALS.length) return TUTORIALS[n - 1];
  const k = n - TUTORIALS.length;
  if (k <= POOL.length) return { ...POOL[k - 1], id: `n${n}` };
  const type = ROTATION[k % ROTATION.length];
  const l = makeLevel(trailSeed(k), 1, undefined, type);
  return { ...l, id: `n${n}`, name: trailName(k, isLantern(type)) };
}

/** A generated level from a seed (the daily, bug reports); dailies get their own names. */
export function seedLevel(seed: number, d: number, id: string, daily = false): Level {
  const l = makeLevel(seed, d);
  return { ...l, id, ...(daily ? { name: dailyName(seed, isLantern(l.type as LevelType)) } : {}) };
}

/** How many trail levels are hand-picked (tutorials + pool). */
export const PICKED = TUTORIALS.length + POOL.length;

export interface Verdict {
  outcome: Outcome;
  cost: number;
  parts: number;
  /** 0 when not cleared (or over budget). */
  stars: number;
  overBudget: boolean;
}

/** Replays a build and runs it: what the page would show after Go. */
export function judge(l: Level, actions: string): Verdict {
  const ms = replayBuild(l, actions).members;
  const r = runSim(l, ms);
  const cost = costOf(ms);
  const won = WON.has(r.outcome);
  return { outcome: r.outcome, cost, parts: ms.length, stars: won ? starsFor(l, cost, ms.length) : 0, overBudget: cost > l.budget };
}
