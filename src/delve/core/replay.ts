// Compact run encoding, one character per action.

import { applyAction, newGame } from './rules';
import type { Action, GameState, SpellId } from './types';

export const RULES_VERSION = 8;

const CODES: Record<string, Action> = {
  f: { type: 'forward' },
  b: { type: 'back' },
  l: { type: 'left' },
  r: { type: 'right' },
  q: { type: 'strafeL' },
  e: { type: 'strafeR' },
  u: { type: 'use' },
  w: { type: 'wait' },
  p: { type: 'potion' },
  m: { type: 'ether' },
  v: { type: 'read' },
  F: { type: 'cast', spell: 'fire' },
  I: { type: 'cast', spell: 'frost' },
  H: { type: 'cast', spell: 'heal' },
  B: { type: 'cast', spell: 'blink' },
  '1': { type: 'buy', slot: 0 },
  '2': { type: 'buy', slot: 1 },
  '3': { type: 'buy', slot: 2 },
  '4': { type: 'buy', slot: 3 },
  x: { type: 'leave' },
};

export function encodeAction(a: Action): string {
  for (const [k, v] of Object.entries(CODES)) {
    if (v.type !== a.type) continue;
    if (a.type === 'cast' && (v as { spell: SpellId }).spell !== a.spell) continue;
    if (a.type === 'buy' && (v as { slot: number }).slot !== a.slot) continue;
    return k;
  }
  throw new Error(`no code for ${JSON.stringify(a)}`);
}

export function decodeAction(c: string): Action {
  const a = CODES[c];
  if (!a || c.length !== 1) throw new Error(`bad action code "${c}"`);
  return a;
}

export function replay(seed: number, actions: string, plus = false): GameState {
  let s = newGame(seed, plus);
  for (const c of actions) s = applyAction(s, decodeAction(c)).state;
  return s;
}
