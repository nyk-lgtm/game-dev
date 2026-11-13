// The trail: the tutorials, then generated levels that slowly get harder.
// Level n is the same for everyone. `judge` replays a build and scores it.

import { costOf, replayBuild } from './build';
import { diffOf, makeLevel, trailSeed } from './gen';
import { starsFor, type Level } from './level';
import { WON, runSim, type Outcome } from './sim';
import { TUTORIALS } from './tutorials';

export const DAILY_D = 0.55;

/** Level n of the trail (1-based). */
export function trailLevel(n: number): Level {
  if (n <= TUTORIALS.length) return TUTORIALS[n - 1];
  const k = n - TUTORIALS.length;
  // Every third level of the trail is a lantern level.
  return { ...makeLevel(trailSeed(k), diffOf(k - 1), undefined, k % 3 === 2 ? 'reach' : 'cross'), id: `n${n}` };
}

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
