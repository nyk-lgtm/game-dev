// A greedy one-move-lookahead bot that uses the exact preview. Used for
// balance probes and for generating test scenarios.
import {
  applyAction,
  distanceField,
  encodeAction,
  key,
  legalMoves,
  newRun,
  playerWalkable,
  previewAction,
  type Action,
  type GameState,
} from '../src/core';

export function greedyAction(s: GameState): Action {
  const moves = legalMoves(s);
  if (moves.length === 0) return { type: 'wait' };
  const field = distanceField(s, s.stairs, playerWalkable);
  let best: Action = { type: 'move', to: moves[0] };
  let bestScore = -Infinity;
  for (const to of moves) {
    const a: Action = { type: 'move', to };
    const o = previewAction(s, a);
    const score =
      -o.damageTaken * 100 + (o.dies ? -1000 : 0) + o.kills.length * 8 + o.wounded.length * 3 -
      (field.get(key(to)) ?? 50) * 2 + (o.descends ? (s.enemies.length > 0 ? 5 : 40) : 0);
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

