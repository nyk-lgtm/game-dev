// A run is a seed plus actions stamped with the tick they happened on:
// `<tick>:B<cell>.<tower>` build, `U<cell>` upgrade, `S<cell>` sell, `W` send wave.

import { TOWER_IDS } from './content';
import { act, newGame, step, type Action, type State } from './sim';

export const RULES_VERSION = 5;

export interface Stamped {
  tick: number;
  a: Action;
}

export function encode(tick: number, a: Action): string {
  switch (a.t) {
    case 'build':
      return `${tick}:B${a.cell}.${TOWER_IDS.indexOf(a.tower)}`;
    case 'up':
      return `${tick}:U${a.cell}`;
    case 'spec':
      return `${tick}:X${a.cell}.${a.pick}`;
    case 'sell':
      return `${tick}:S${a.cell}`;
    case 'wave':
      return `${tick}:W`;
  }
}

export function decode(tok: string): Stamped | null {
  const x = /^(\d+):X(\d+)\.([01])$/.exec(tok);
  if (x) return { tick: +x[1], a: { t: 'spec', cell: +x[2], pick: +x[3] } };
  const m = /^(\d+):(?:B(\d+)\.(\d)|U(\d+)|S(\d+)|(W))$/.exec(tok);
  if (!m) return null;
  const tick = +m[1];
  if (m[2] !== undefined) {
    const tower = TOWER_IDS[+m[3]];
    return tower ? { tick, a: { t: 'build', cell: +m[2], tower } } : null;
  }
  if (m[4] !== undefined) return { tick, a: { t: 'up', cell: +m[4] } };
  if (m[5] !== undefined) return { tick, a: { t: 'sell', cell: +m[5] } };
  return { tick, a: { t: 'wave' } };
}

/** Rebuild a run: step to each action's tick and apply it. Throws on an illegal action. */
export function replay(seed: number, actions: string, untilTick = -1): State {
  const s = newGame(seed);
  const toks = actions ? actions.split(',') : [];
  for (const tok of toks) {
    const st = decode(tok);
    if (!st) throw new Error(`bad action ${tok}`);
    while (s.tick < st.tick && s.status === 'playing') step(s);
    if (!act(s, st.a)) throw new Error(`illegal action ${tok}`);
  }
  while (s.tick < untilTick && s.status === 'playing') step(s);
  return s;
}
