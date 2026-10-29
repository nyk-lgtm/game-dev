// Compact run encoding: each move is the direction digit 0-5, a wait is "w".
// A whole run is (seed, action string), which is enough to rebuild the exact
// state because the rules are deterministic.

import { DIRS, add, dirIndex } from './hex';
import { newRun } from './levelgen';
import { applyAction } from './resolve';
import type { Action, GameState } from './types';

export function encodeAction(s: GameState, a: Action): string {
  return a.type === 'wait' ? 'w' : String(dirIndex(s.player.pos, a.to));
}

export function decodeAction(s: GameState, c: string): Action {
  if (c === 'w') return { type: 'wait' };
  const d = Number(c);
  if (!(d >= 0 && d < 6)) throw new Error(`bad action code "${c}"`);
  return { type: 'move', to: add(s.player.pos, DIRS[d]) };
}

export function replay(seed: number, actions: string): GameState {
  let s = newRun(seed);
  for (const c of actions) s = applyAction(s, decodeAction(s, c)).state;
  return s;
}
