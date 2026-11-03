// Rewild bots. greedy: tries every card on every legal cell, simulates the
// season plus a couple of idle seasons, keeps the best. random: any legal move.
import { Rng, mixSeed } from '../../src/shared/rng';
import { GOALS, apply, census, clone, encode, newGame, placeError, seasonPoints, type Action, type GameState } from '../../src/rewild/core';

export interface Result { seed: number; s: GameState; actions: string }

/** Value of a mid-season state: end the season, then idle `look` more. */
function value(s: GameState, look: number): number {
  const t = clone(s);
  apply(t, { type: 'end' });
  for (let k = 0; k < look && !t.over; k++) apply(t, { type: 'end' });
  const v = t.score + (t.over ? 0 : seasonPoints(t.cells) * 2);
  const c = census(t.cells);
  // Partial credit for goals on the way, so the bot works toward them like a player would.
  let g = 0;
  for (const goal of t.goals) {
    if (goal.done) continue;
    const m = GOALS.find((d) => d.id === goal.id)!.measure(t);
    g += (goal.reward * Math.min(1, m / goal.target)) * 0.6;
  }
  return v + c.species.size * 3 + c.life * 0.2 + g;
}

export function legal(s: GameState): Action[] {
  const out: Action[] = [];
  s.hand.forEach((_, card) => s.cells.forEach((_, cell) => {
    if (placeError(s, card, cell) === null) out.push({ type: 'place', card, cell });
  }));
  return out;
}

/** Next action for the greedy bot: the best placement, or end the season. */
export function greedyMove(s: GameState, look = 2): Action {
  let best: Action = { type: 'end' };
  if (s.plays <= 0) return best;
  let bestV = value(s, look);
  for (const a of legal(s)) {
    const t = clone(s);
    apply(t, a);
    const v = value(t, look);
    if (v > bestV) { bestV = v; best = a; }
  }
  return best;
}

export function run(seed: number, who: 'greedy' | 'random' = 'greedy', look = 2): Result {
  const s = newGame(seed);
  const rng = new Rng(mixSeed(seed, 77));
  const toks: string[] = [];
  while (!s.over) {
    let a: Action;
    if (who === 'random') {
      const l = legal(s);
      a = l.length && s.plays > 0 ? rng.pick(l) : { type: 'end' };
    } else a = greedyMove(s, look);
    if (apply(s, a) === null) throw new Error('illegal ' + encode(a));
    toks.push(encode(a));
  }
  return { seed, s, actions: toks.join(',') };
}
