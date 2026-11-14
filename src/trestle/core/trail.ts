// The trail: the tutorials, then a fixed run of generated levels picked and
// ordered offline so the difficulty rises steadily and the types rotate
// (pool.ts, made by scripts/trestle/pool.ts), then live levels at full
// difficulty. Level n is the same for everyone. `judge` replays a build.

import { costOf, replayBuild } from './build';
import { dailyName, makeLevel, solutionSig, trailName, trailSeed, isLantern, type LevelType } from './gen';
import { starsFor, type Level } from './level';
import { mixSeed } from '../../shared/rng';
import { POOL } from './pool';
import { WON, runSim, type Outcome } from './sim';
import { TUTORIALS } from './tutorials';

export const DAILY_D = 0.55;

/** The type rotation for live levels past the pool (islands and spires can't get hard enough to follow it). */
const ROTATION: LevelType[] = ['plain', 'wall', 'hooks', 'arch', 'gap', 'boat', 'convoy'];

/** Of a few candidates, the one whose difficulty is nearest the target (ties: the first). */
function nearest(cands: Level[], target: number): Level {
  return cands.reduce((best, l) => (Math.abs((l.diff ?? 0) - target) < Math.abs((best.diff ?? 0) - target) ? l : best));
}

/** Difficulty wanted from live level k (past the pool): on from where the pool ends, rising slowly to 0.95. */
export const liveTarget = (k: number) => Math.min(0.95, (POOL.at(-1)?.diff ?? 0.85) + 0.004 * (k - POOL.length));

/** Level n of the trail (1-based). */
export function trailLevel(n: number): Level {
  if (n <= TUTORIALS.length) return TUTORIALS[n - 1];
  const k = n - TUTORIALS.length;
  if (k <= POOL.length) return { ...POOL[k - 1], id: `n${n}` };
  // Live levels: two candidates of this slot's type at d 0.85 and 1, the one nearest the rising target.
  const type = ROTATION[k % ROTATION.length];
  const cands = [0.85, 1].map((d, i) => makeLevel(mixSeed(trailSeed(k), i), d, undefined, type));
  return { ...nearest(cands, liveTarget(k)), id: `n${n}`, name: trailName(k, isLantern(type)) };
}

/** Difficulty a daily aims for (between the pool's middle levels). */
export const DAILY_TARGET = 0.5;

/** A generated level from a seed (the daily, bug reports); a daily picks, of two (d, d + 0.3), the one nearest mid difficulty and gets its own name. */
export function seedLevel(seed: number, d: number, id: string, daily = false): Level {
  let l: Level;
  if (daily) {
    // Two candidates; one whose answer has the same shape as a trail level's is passed over when the other isn't.
    const cands = [0, 0.3].map((up, i) => makeLevel(i ? mixSeed(seed, i) : seed, Math.min(1, d + up)));
    const sigs = new Set(POOL.map(solutionSig));
    const fresh = cands.filter((c) => !sigs.has(solutionSig(c)));
    l = nearest(fresh.length ? fresh : cands, DAILY_TARGET);
  } else l = makeLevel(seed, d);
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
