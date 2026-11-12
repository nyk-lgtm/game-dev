// Read-only helpers the UI uses to explain the board: threat overlays and
// exact outcome previews (by simulating the real rules).

import { enemyAt, tileAt } from './board';
import { frontArc } from './combat';
import { chargePath, hookPath, shotPath, zapRays } from './enemies';
import { eq, key, neighbors, type Hex } from '../../shared/hex';
import { applyAction } from './resolve';
import { PLAYER_ID, type Action, type GameState } from './types';

export interface Threats {
  /** Hexes where ending your turn gets you smashed. */
  melee: Set<string>;
  /** Who smashes each of those hexes (enemy ids). */
  meleeBy: Map<string, number[]>;
  /** Readied shot, charge, hook and zap lines, per enemy (a pylon has one per ray). */
  lines: { by: number; kind: 'shot' | 'charge' | 'hook' | 'zap'; path: Hex[] }[];
  /** Bomb blast areas (center first); `fuse` 1 means it explodes this coming enemy turn. */
  blasts: { fuse: number; hexes: Hex[]; by: number }[];
}

export function threats(s: GameState): Threats {
  const melee = new Set<string>();
  const meleeBy = new Map<string, number[]>();
  const smashes = (e: { id: number }, hexes: Hex[]) => {
    for (const n of hexes) {
      if (!onBoard(n)) continue;
      melee.add(key(n));
      meleeBy.set(key(n), [...(meleeBy.get(key(n)) ?? []), e.id]);
    }
  };
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
    if (e.kind === 'brute') smashes(e, neighbors(e.pos));
    if (e.kind === 'guard') smashes(e, frontArc(e));
    // A grappler that just threw its hook can't smash this turn (it's busy reeling in).
    if (e.kind === 'grappler' && e.aim === null) smashes(e, neighbors(e.pos));
    if (e.aim === null) continue;
    if (e.kind === 'archer') {
      // The arrow stops at the first enemy in the line (it takes the hit).
      const path = shotPath(s, e);
      const i = path.findIndex(staysPut);
      lines.push({ by: e.id, kind: 'shot', path: i < 0 ? path : path.slice(0, i + 1) });
    } else if (e.kind === 'charger') {
      lines.push({ by: e.id, kind: 'charge', path: chargePath(s, e, (h) => !eq(h, e.pos) && staysPut(h)) });
    } else if (e.kind === 'grappler') {
      // The hook catches the first enemy still standing in the line.
      const path = hookPath(s, e);
      const i = path.findIndex(staysPut);
      lines.push({ by: e.id, kind: 'hook', path: i < 0 ? path : path.slice(0, i + 1) });
    } else if (e.kind === 'pylon') {
      for (const path of zapRays(s, e)) lines.push({ by: e.id, kind: 'zap', path });
    }
  }
  const blasts = s.bombs.map((b) => ({ fuse: b.fuse, by: b.by, hexes: [b.pos, ...neighbors(b.pos)].filter(onBoard) }));
  return { melee, meleeBy, lines, blasts };
}

export type ThreatKind = 'smash' | 'shot' | 'charge' | 'hook' | 'zap' | 'bomb';

export interface ThreatSource {
  by: number;
  kind: ThreatKind;
  /** For a bomb: enemy turns until it goes off (1 = this coming one). */
  fuse?: number;
}

/**
 * Every telegraphed threat that covers hex `h` and who makes it (a bomb's
 * `by` is its thrower, who may be dead by now).
 */
export function threatsAt(t: Threats, h: Hex): ThreatSource[] {
  const out: ThreatSource[] = [];
  for (const by of t.meleeBy.get(key(h)) ?? []) out.push({ by, kind: 'smash' });
  for (const l of t.lines) {
    if (l.path.some((p) => eq(p, h)) && !out.some((o) => o.by === l.by)) out.push({ by: l.by, kind: l.kind });
  }
  for (const b of t.blasts) if (b.hexes.some((p) => eq(p, h))) out.push({ by: b.by, kind: 'bomb', fuse: b.fuse });
  return out;
}

export interface Outcome {
  damageTaken: number;
  kills: number[];
  wounded: number[];
  descends: boolean;
  /** Descending with the floor cleared restores 1 HP. */
  healed: boolean;
  dies: boolean;
  /** Where the player stands after the enemy turn, if a hook drags them there. */
  hookedTo: Hex | null;
  /** What hurts the player this turn, and who (a bomb counts as its thrower). */
  hurtBy: ThreatSource[];
  /**
   * When the action is safe this turn: the telegraphs that will cover where
   * you end up once the enemies have acted (a pylon that starts charging, a
   * bomb lobbed at you, an archer taking aim), so "Safe" never hides them.
   */
  next: ThreatSource[];
}

export function previewAction(s: GameState, a: Action): Outcome {
  const { state, events } = applyAction(s, a);
  const out: Outcome = {
    damageTaken: 0,
    kills: [],
    wounded: [],
    descends: false,
    healed: false,
    dies: false,
    hookedTo: null,
    hurtBy: [],
    next: [],
  };
  // Who the next damage comes from: the last attacker, shooter or bomb.
  let source: ThreatSource | null = null;
  for (const ev of events) {
    if (ev.type === 'attack') source = { by: ev.by, kind: ev.kind === 'charge' || ev.kind === 'zap' ? ev.kind : 'smash' };
    else if (ev.type === 'shot') source = { by: ev.by, kind: 'shot' };
    else if (ev.type === 'explode') source = { by: s.bombs.find((b) => eq(b.pos, ev.at))?.by ?? -1, kind: 'bomb', fuse: 1 };
    if (ev.type === 'damage') {
      if (ev.target === PLAYER_ID) {
        out.damageTaken += ev.amount;
        const src = source;
        if (src && !out.hurtBy.some((h) => h.by === src.by && h.kind === src.kind)) out.hurtBy.push(src);
      }
      else if (ev.hp > 0 && !out.wounded.includes(ev.target)) out.wounded.push(ev.target);
    } else if (ev.type === 'death') out.kills.push(ev.target);
    else if (ev.type === 'descend') {
      out.descends = true;
      out.healed = ev.healed;
    } else if (ev.type === 'playerDeath') out.dies = true;
    else if (ev.type === 'hook' && ev.target === PLAYER_ID) out.hookedTo = ev.to;
  }
  out.wounded = out.wounded.filter((id) => !out.kills.includes(id));
  if (!out.dies && !out.descends && out.damageTaken === 0) out.next = threatsAt(threats(state), state.player.pos);
  return out;
}
