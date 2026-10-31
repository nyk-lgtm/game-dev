// A greedy one-move-lookahead Grove bot using the exact preview, for balance
// probes and fuzzing. Ties broken toward cells next to similar pieces.
import {
  CELLS,
  applyAction,
  cellAt,
  encodeAction,
  isLegal,
  neighbors,
  newGame,
  previewAction,
  type Action,
  type GameState,
} from '../../src/grove/core';

function closeness(s: GameState, a: Extract<Action, { type: 'place' }>): number {
  const p = s.current;
  if (p.kind !== 'plant') return 0;
  let n = 0;
  for (const h of neighbors(a.at)) {
    const c = cellAt(s, h);
    if (c && c.kind === 'plant' && c.tier === p.tier) n += 2;
    else if (c) n -= 0.2;
  }
  return n;
}

export function greedyAction(s: GameState): Action {
  let best: Action = { type: 'swap' };
  let bestScore = -Infinity;
  for (const at of CELLS) {
    const a: Action = { type: 'place', at };
    if (!isLegal(s, a)) continue;
    if (s.current.kind === 'bolt' && cellAt(s, at) === null) continue;
    const o = previewAction(s, a);
    const score = o.points + o.trapped * 30 + closeness(s, a) - (o.over ? 1e6 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

export function playGreedy(seed: number, maxTurns = 2000) {
  let s = newGame(seed);
  let actions = '';
  let swaps = 0;
  while (s.status === 'playing' && s.turn < maxTurns) {
    let a = greedyAction(s);
    if (a.type === 'swap' && ++swaps > 3) a = { type: 'place', at: CELLS.find((h) => isLegal(s, { type: 'place', at: h }))! };
    else if (a.type === 'place') swaps = 0;
    actions += encodeAction(a);
    s = applyAction(s, a).state;
  }
  return { state: s, actions };
}
