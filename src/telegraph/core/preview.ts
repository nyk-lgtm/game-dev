// Read-only helpers the UI uses to explain the board: threat overlays and
// exact outcome previews (by simulating the real rules).

import { enemyAt, tileAt } from './board';
import { frontArc } from './combat';
import { chargePath, hookPath, shotPath, zapRays } from './enemies';
import { distance, eq, key, neighbors, type Hex } from '../../shared/hex';
import { applyAction, legalActions } from './resolve';
import { PLAYER_ID, type Action, type GameEvent, type GameState } from './types';

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
  /** Enemies your own blow (stab, lunge, bash, a shove's slam) kills or wounds. */
  kills: number[];
  wounded: number[];
  /** Enemies the enemies' own attacks kill or wound this turn (arrows, zaps, charges, bombs). */
  friendlyKills: number[];
  friendlyWounds: number[];
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
  /**
   * Safe this turn, but a bomb will cover where you end up and no line of
   * moves gets you out before it goes off without being hit (by it or
   * anything else): a bomb trap.
   */
  trapped: boolean;
}

/** Events only the player's half of a turn makes; anything else means the enemy phase has begun. */
const PLAYER_PHASE = new Set<GameEvent['type']>([
  'playerMove',
  'playerWait',
  'attack',
  'damage',
  'death',
  'blocked',
  'push',
  'slam',
  'fall',
  'stagger',
]);

export function previewAction(s: GameState, a: Action): Outcome {
  const { state, events } = applyAction(s, a);
  const out: Outcome = {
    damageTaken: 0,
    kills: [],
    wounded: [],
    friendlyKills: [],
    friendlyWounds: [],
    descends: false,
    healed: false,
    dies: false,
    hookedTo: null,
    hurtBy: [],
    next: [],
    trapped: false,
  };
  // Who the next damage comes from: the last attacker, shooter or bomb.
  let source: ThreatSource | null = null;
  // Blows struck before the enemy phase are yours; after it, the enemies hit each other.
  let enemyTurn = false;
  for (const ev of events) {
    if (!enemyTurn && (!PLAYER_PHASE.has(ev.type) || (ev.type === 'attack' && ev.by !== PLAYER_ID))) enemyTurn = true;
    if (ev.type === 'attack') source = { by: ev.by, kind: ev.kind === 'charge' || ev.kind === 'zap' ? ev.kind : 'smash' };
    else if (ev.type === 'shot') source = { by: ev.by, kind: 'shot' };
    else if (ev.type === 'explode') source = { by: s.bombs.find((b) => eq(b.pos, ev.at))?.by ?? -1, kind: 'bomb', fuse: 1 };
    if (ev.type === 'damage') {
      if (ev.target === PLAYER_ID) {
        out.damageTaken += ev.amount;
        const src = source;
        if (src && !out.hurtBy.some((h) => h.by === src.by && h.kind === src.kind)) out.hurtBy.push(src);
      } else if (ev.hp > 0) {
        const list = enemyTurn ? out.friendlyWounds : out.wounded;
        if (!list.includes(ev.target)) list.push(ev.target);
      }
    } else if (ev.type === 'death') (enemyTurn ? out.friendlyKills : out.kills).push(ev.target);
    else if (ev.type === 'descend') {
      out.descends = true;
      out.healed = ev.healed;
    } else if (ev.type === 'playerDeath') out.dies = true;
    else if (ev.type === 'hook' && ev.target === PLAYER_ID) out.hookedTo = ev.to;
  }
  // Each enemy is listed once: killed beats wounded, your blow beats theirs.
  const dead = [...out.kills, ...out.friendlyKills];
  out.wounded = out.wounded.filter((id) => !dead.includes(id));
  out.friendlyWounds = out.friendlyWounds.filter((id) => !dead.includes(id) && !out.wounded.includes(id));
  if (!out.dies && !out.descends && out.damageTaken === 0) {
    out.next = threatsAt(threats(state), state.player.pos);
    out.trapped = bombTrapped(state);
  }
  return out;
}

/**
 * True if a bomb covers the player's hex and every line of moves until it
 * goes off (its fuse: 1 or 2 turns) gets the player hurt, by the blast or
 * anything else. Taking the stairs is a way out. Exact: it plays the real
 * rules forward.
 */
export function bombTrapped(s: GameState): boolean {
  if (s.status !== 'playing') return false;
  const fuses = s.bombs.filter((b) => distance(b.pos, s.player.pos) <= 1).map((b) => b.fuse);
  if (fuses.length === 0) return false;
  return !escapes(s, Math.min(2, Math.max(...fuses)));
}

/** Some line of `turns` actions from `s` takes no damage (or reaches the stairs). */
function escapes(s: GameState, turns: number): boolean {
  for (const a of legalActions(s)) {
    const { state, events } = applyAction(s, a);
    if (events.some((e) => e.type === 'descend')) return true;
    if (state.player.hp < s.player.hp || state.status !== 'playing') continue;
    if (turns <= 1 || escapes(state, turns - 1)) return true;
  }
  return false;
}
