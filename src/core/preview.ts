// Read-only helpers the UI uses to explain the board: threat overlays and
// exact outcome previews (by simulating the real rules).

import { neighbors, key, type Hex } from './hex';
import { tileAt } from './board';
import { shotDanger } from './enemies';
import { applyAction } from './resolve';
import { PLAYER_ID, type Action, type GameState } from './types';

export interface Threats {
  /** Hexes next to a brute: ending your turn here gets you smashed. */
  melee: Set<string>;
  /** Readied shot lines, per shooter. */
  shots: { by: number; path: Hex[] }[];
}

export function threats(s: GameState): Threats {
  const melee = new Set<string>();
  const shots: Threats['shots'] = [];
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    if (e.kind === 'brute') {
      for (const n of neighbors(e.pos)) if (tileAt(s, n) !== undefined) melee.add(key(n));
    }
    if (e.aim !== null) shots.push({ by: e.id, path: shotDanger(s, e) });
  }
  return { melee, shots };
}

export interface Outcome {
  damageTaken: number;
  kills: number[];
  wounded: number[];
  descends: boolean;
  /** Descending with the floor cleared restores 1 HP. */
  healed: boolean;
  dies: boolean;
}

export function previewAction(s: GameState, a: Action): Outcome {
  const { events } = applyAction(s, a);
  const out: Outcome = { damageTaken: 0, kills: [], wounded: [], descends: false, healed: false, dies: false };
  for (const ev of events) {
    if (ev.type === 'damage') {
      if (ev.target === PLAYER_ID) out.damageTaken += ev.amount;
      else if (ev.hp > 0 && !out.wounded.includes(ev.target)) out.wounded.push(ev.target);
    } else if (ev.type === 'death') out.kills.push(ev.target);
    else if (ev.type === 'descend') {
      out.descends = true;
      out.healed = ev.healed;
    }
    else if (ev.type === 'playerDeath') out.dies = true;
  }
  return out;
}
