// Compact game encoding: a placement is the board index of its cell as one
// character (CELL_CODES), a swap is "~". (seed, string) rebuilds any game.

import { eq } from '../../shared/hex';
import { CELLS, applyAction, newGame } from './rules';
import type { Action, GameState } from './types';

/** Bump whenever a rules change would make an old game replay differently. */
export const RULES_VERSION = 1;

const CELL_CODES = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJK'; // 37 cells

export function encodeAction(a: Action): string {
  if (a.type === 'swap') return '~';
  return CELL_CODES[CELLS.findIndex((h) => eq(h, a.at))];
}

export function decodeAction(c: string): Action {
  if (c === '~') return { type: 'swap' };
  const i = CELL_CODES.indexOf(c);
  if (c.length !== 1 || i < 0) throw new Error(`bad action code "${c}"`);
  return { type: 'place', at: CELLS[i] };
}

export function replay(seed: number, actions: string): GameState {
  let s = newGame(seed);
  for (const c of actions) s = applyAction(s, decodeAction(c)).state;
  return s;
}
