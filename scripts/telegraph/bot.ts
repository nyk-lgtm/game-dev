// A greedy one-move-lookahead bot that uses the exact preview. Used for
// balance probes and for generating test scenarios.
import {
  applyAction,
  distanceField,
  encodeAction,
  key,
  legalActions,
  newRun,
  playerWalkable,
  previewAction,
  type Action,
  type GameState,
} from '../../src/telegraph/core';

/**
 * `visits` (optional) counts how often the bot has stood on each hex this
 * floor; revisits are penalised so it can't dither forever in a standoff.
 */
export function greedyAction(s: GameState, visits?: Map<string, number>): Action {
  const acts = legalActions(s);
  if (acts[0].type === 'wait') return acts[0];
  const field = distanceField(s, s.stairs, playerWalkable);
  let best: Action = acts[0];
  let bestScore = -Infinity;
  for (const a of acts) {
    const o = previewAction(s, a);
    const at = a.type === 'move' ? a.to : s.player.pos;
    const score =
      -o.damageTaken * 100 + (o.dies ? -1000 : 0) + (o.kills.length + o.friendlyKills.length) * 8 + (o.wounded.length + o.friendlyWounds.length) * 3 -
      (field.get(key(at)) ?? 50) * 2 + (o.descends ? (s.enemies.length > 0 ? 5 : 40) : 0) -
      (a.type === 'bash' ? 4 : 0) -
      (visits?.get(key(at)) ?? 0) * 3;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

export function playGreedy(seed: number, maxTurns = 600) {
  let s = newRun(seed);
  let actions = '';
  let visits = new Map<string, number>();
  while (s.status === 'playing' && s.turn < maxTurns) {
    const a = greedyAction(s, visits);
    actions += encodeAction(s, a);
    const depth = s.depth;
    s = applyAction(s, a).state;
    if (s.depth !== depth) visits = new Map();
    const k = key(s.player.pos);
    visits.set(k, (visits.get(k) ?? 0) + 1);
  }
  return { state: s, actions };
}

