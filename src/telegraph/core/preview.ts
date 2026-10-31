// Read-only helpers the UI uses to explain the board: threat overlays and
// exact outcome previews (by simulating the real rules).

import { enemyAt, tileAt } from './board';
import { frontArc } from './combat';
import { chargePath, shotPath } from './enemies';
import { eq, key, neighbors, type Hex } from '../../shared/hex';
import { applyAction } from './resolve';
import { PLAYER_ID, type Action, type GameState } from './types';

export interface Threats {
  /** Hexes where ending your turn gets you smashed. */
  melee: Set<string>;
  /** Readied shot and charge lines, per enemy. */
  lines: { by: number; kind: 'shot' | 'charge'; path: Hex[] }[];
  /** Bomb blast areas (center first); `fuse` 1 means it explodes this coming enemy turn. */
  blasts: { fuse: number; hexes: Hex[] }[];
}

export function threats(s: GameState): Threats {
  const melee = new Set<string>();
  const lines: Threats['lines'] = [];
  const onBoard = (h: Hex) => tileAt(s, h) !== undefined;
  // Lines resolve after the player moves and after bombs go off, and aimed
  // chargers leave their hex before later shots fly. So only enemies that will
  // still be standing there block a line; the player never does.
  const boom = new Set(s.bombs.filter((b) => b.fuse <= 1).flatMap((b) => [b.pos, ...neighbors(b.pos)]).map(key));
  const staysPut = (h: Hex) => {
    const e = enemyAt(s, h);
    if (!e) return false;
    if (e.kind === 'charger' && e.aim !== null) return false;
    return !(e.hp <= 1 && boom.has(key(h)));
  };
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    if (e.kind === 'brute') for (const n of neighbors(e.pos)) if (onBoard(n)) melee.add(key(n));
    if (e.kind === 'guard') for (const n of frontArc(e)) if (onBoard(n)) melee.add(key(n));
    if (e.aim === null) continue;
    if (e.kind === 'archer') {
      // The arrow stops at the first enemy in the line (it takes the hit).
      const path = shotPath(s, e);
      const i = path.findIndex(staysPut);
      lines.push({ by: e.id, kind: 'shot', path: i < 0 ? path : path.slice(0, i + 1) });
    } else if (e.kind === 'charger') {
      lines.push({ by: e.id, kind: 'charge', path: chargePath(s, e, (h) => !eq(h, e.pos) && staysPut(h)) });
    }
  }
  const blasts = s.bombs.map((b) => ({ fuse: b.fuse, hexes: [b.pos, ...neighbors(b.pos)].filter(onBoard) }));
  return { melee, lines, blasts };
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
    } else if (ev.type === 'playerDeath') out.dies = true;
  }
  out.wounded = out.wounded.filter((id) => !out.kills.includes(id));
  return out;
}
