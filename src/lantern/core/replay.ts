// Compact game encoding: a step is its direction digit 0-7, "w" wait,
// "p" potion, "r" rest, and S/L/C/P buy sword/leather/chain/potion.

import { applyAction, newGame } from './rules';
import type { Action, GameState } from './types';

/** Bump whenever a rules change would make an old game replay differently. */
export const RULES_VERSION = 1;

const BUY: Record<string, 'sword' | 'leather' | 'chain' | 'potion'> = { S: 'sword', L: 'leather', C: 'chain', P: 'potion' };

export function encodeAction(a: Action): string {
  switch (a.type) {
    case 'step':
      return String(a.dir);
    case 'wait':
      return 'w';
    case 'potion':
      return 'p';
    case 'rest':
      return 'r';
    case 'buy':
      return Object.keys(BUY).find((k) => BUY[k] === a.item)!;
  }
}

export function decodeAction(c: string): Action {
  if (/^[0-7]$/.test(c)) return { type: 'step', dir: Number(c) };
  if (c === 'w') return { type: 'wait' };
  if (c === 'p') return { type: 'potion' };
  if (c === 'r') return { type: 'rest' };
  if (c.length === 1 && BUY[c]) return { type: 'buy', item: BUY[c] };
  throw new Error(`bad action code "${c}"`);
}

export function replay(seed: number, actions: string): GameState {
  let s = newGame(seed);
  for (const c of actions) s = applyAction(s, decodeAction(c)).state;
  return s;
}
