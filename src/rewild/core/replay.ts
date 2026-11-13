// A run is a seed plus its actions: P<card>.<cell> place, R reroll, E end the season.

import { apply, newGame } from './rules';
import type { Action, GameState } from './types';

export const RULES_VERSION = 7;

export function encode(a: Action): string {
  if (a.type === 'place') return `P${a.card}.${a.cell}`;
  return a.type === 'reroll' ? 'R' : 'E';
}

export function decode(tok: string): Action | null {
  if (tok === 'R') return { type: 'reroll' };
  if (tok === 'E') return { type: 'end' };
  const m = /^P(\d)\.(\d+)$/.exec(tok);
  return m ? { type: 'place', card: +m[1], cell: +m[2] } : null;
}

export const encodeAll = (as: Action[]) => as.map(encode).join(',');

export function decodeAll(str: string): Action[] {
  if (!str) return [];
  return str.split(',').map((t) => {
    const a = decode(t);
    if (!a) throw new Error(`bad action "${t}"`);
    return a;
  });
}

export function replay(seed: number, actions: string | Action[]): GameState {
  const s = newGame(seed);
  const list = typeof actions === 'string' ? decodeAll(actions) : actions;
  list.forEach((a, k) => {
    if (apply(s, a) === null) throw new Error(`illegal action #${k} ${encode(a)}`);
  });
  return s;
}
