// Runs are a seed plus a list of build actions; battles are deterministic, so
// replaying the actions rebuilds the exact run (saves and bug reports).
//
// Tokens, comma separated:
//   B<i>[slot]   buy shop offer i (to slot, or auto-place)
//   M<slot><slot> move / swap
//   S<slot>      sell
//   R            reroll
//   F            toggle freeze
//   G            fight: start the battle and run it to the end
// slot: L<row><col> (loom) or b<i> (bench)

import { buy, move, newGame, reroll, sell, startBattle, tick, toggleFreeze } from './state';
import type { GameState, Slot } from './types';

export const RULES_VERSION = 1;

export type Action =
  | { t: 'buy'; i: number; to?: Slot }
  | { t: 'move'; from: Slot; to: Slot }
  | { t: 'sell'; at: Slot }
  | { t: 'reroll' }
  | { t: 'freeze' }
  | { t: 'fight' };

export function slotCode(s: Slot): string {
  if (s.area === 'loom') return `L${s.row}${s.col}`;
  if (s.area === 'bench') return `b${s.i}`;
  return `s${s.i}`;
}

function parseSlot(code: string): Slot {
  if (code[0] === 'L') return { area: 'loom', row: +code[1], col: +code[2] };
  if (code[0] === 'b') return { area: 'bench', i: +code[1] };
  throw new Error(`bad slot ${code}`);
}

export function encode(a: Action): string {
  switch (a.t) {
    case 'buy':
      return `B${a.i}${a.to ? slotCode(a.to) : ''}`;
    case 'move':
      return `M${slotCode(a.from)}${slotCode(a.to)}`;
    case 'sell':
      return `S${slotCode(a.at)}`;
    case 'reroll':
      return 'R';
    case 'freeze':
      return 'F';
    case 'fight':
      return 'G';
  }
}

const SLOT = '(L\\d\\d|b\\d)';
const RE = new RegExp(`^(?:B(\\d)${SLOT}?|M${SLOT}${SLOT}|S${SLOT}|R|F|G)$`);

export function decode(tok: string): Action {
  const m = RE.exec(tok);
  if (!m) throw new Error(`bad action ${tok}`);
  if (tok[0] === 'B') return { t: 'buy', i: +m[1], to: m[2] ? parseSlot(m[2]) : undefined };
  if (tok[0] === 'M') return { t: 'move', from: parseSlot(m[3]), to: parseSlot(m[4]) };
  if (tok[0] === 'S') return { t: 'sell', at: parseSlot(m[5]) };
  if (tok === 'R') return { t: 'reroll' };
  if (tok === 'F') return { t: 'freeze' };
  return { t: 'fight' };
}

/** Apply one build action. Returns false if it wasn't legal (state unchanged). */
export function apply(s: GameState, a: Action): boolean {
  switch (a.t) {
    case 'buy':
      return buy(s, a.i, a.to) !== null;
    case 'move':
      return move(s, a.from, a.to);
    case 'sell':
      return sell(s, a.at);
    case 'reroll':
      return reroll(s);
    case 'freeze':
      return toggleFreeze(s);
    case 'fight':
      return startBattle(s);
  }
}

/** Run a started battle to its end (at most 10 minutes of game time). */
export function finishBattle(s: GameState): void {
  for (let n = 0; s.phase === 'battle' && n < 60 * 600; n++) tick(s);
}

export function replay(seed: number, actions: string): GameState {
  const s = newGame(seed);
  for (const tok of actions.split(',').filter(Boolean)) {
    if (!apply(s, decode(tok))) throw new Error(`illegal action ${tok}`);
    if (s.phase === 'battle') finishBattle(s);
  }
  return s;
}
