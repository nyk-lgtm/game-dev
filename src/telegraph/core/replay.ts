// Compact run encoding: a move is the direction digit 0-5, a bash is the
// direction letter a-f, a wait is "w".
// A whole run is (seed, action string), which is enough to rebuild the exact
// state because the rules are deterministic.

import { DIRS, add, dirIndex } from '../../shared/hex';
import { newRun } from './levelgen';
import { applyAction } from './resolve';
import type { Action, GameState } from './types';

/**
 * Bump whenever a rules change would make an old (seed, actions) pair replay
 * differently. Saved runs from another version are discarded.
 */
export const RULES_VERSION = 2;

const BASH_CODES = 'abcdef';

export function encodeAction(s: GameState, a: Action): string {
  if (a.type === 'wait') return 'w';
  if (a.type === 'bash') return BASH_CODES[dirIndex(s.player.pos, a.target)];
  return String(dirIndex(s.player.pos, a.to));
}

export function decodeAction(s: GameState, c: string): Action {
  if (c === 'w') return { type: 'wait' };
  const b = BASH_CODES.indexOf(c);
  if (b >= 0) return { type: 'bash', target: add(s.player.pos, DIRS[b]) };
  if (!/^[0-5]$/.test(c)) throw new Error(`bad action code "${c}"`);
  return { type: 'move', to: add(s.player.pos, DIRS[Number(c)]) };
}

export function replay(seed: number, actions: string): GameState {
  let s = newRun(seed);
  for (const c of actions) s = applyAction(s, decodeAction(s, c)).state;
  return s;
}
