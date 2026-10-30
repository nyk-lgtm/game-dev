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
} from '../src/core';

export function greedyAction(s: GameState): Action {
  const acts = legalActions(s);
  if (acts[0].type === 'wait') return acts[0];
  const field = distanceField(s, s.stairs, playerWalkable);
  let best: Action = acts[0];
  let bestScore = -Infinity;
  for (const a of acts) {
    const o = previewAction(s, a);
    const at = a.type === 'move' ? a.to : s.player.pos;
    const score =
      -o.damageTaken * 100 + (o.dies ? -1000 : 0) + o.kills.length * 8 + o.wounded.length * 3 -
      (field.get(key(at)) ?? 50) * 2 + (o.descends ? (s.enemies.length > 0 ? 5 : 40) : 0) -
      (a.type === 'bash' ? 4 : 0);
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
  while (s.status === 'playing' && s.turn < maxTurns) {
    const a = greedyAction(s);
    actions += encodeAction(s, a);
    s = applyAction(s, a).state;
  }
  return { state: s, actions };
}

