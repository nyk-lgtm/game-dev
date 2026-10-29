// Enemy definitions. Each kind is data (stats, spawn cost) plus an `act`
// function that runs during the enemy phase. Adding a new enemy = adding an
// entry here.

import { distanceField, enemyAt, enemyWalkable, occupied, ray, tileAt } from './board';
import { distance, isAdjacent, key, lineDir, neighbors, type Hex } from './hex';
import { PLAYER_ID, type Enemy, type EnemyKind, type GameEvent, type GameState } from './types';

export const ARCHER_RANGE = 5;
export const ARCHER_MIN_RANGE = 2;

export interface EnemyDef {
  kind: EnemyKind;
  name: string;
  maxHp: number;
  /** Spawn budget cost. */
  cost: number;
  /** First depth this enemy can appear on. */
  minDepth: number;
  blurb: string;
  act(s: GameState, e: Enemy, events: GameEvent[]): void;
}

function damagePlayer(s: GameState, amount: number, events: GameEvent[]): void {
  s.player.hp = Math.max(0, s.player.hp - amount);
  events.push({ type: 'damage', target: PLAYER_ID, amount, hp: s.player.hp });
}

function moveEnemy(e: Enemy, to: Hex, events: GameEvent[]): void {
  events.push({ type: 'enemyMove', id: e.id, from: e.pos, to });
  e.pos = to;
}

function canStep(s: GameState, h: Hex): boolean {
  return enemyWalkable(tileAt(s, h)) && !occupied(s, h);
}

/** True if `from` has a clear straight shot at the player within archer range. */
export function hasShot(s: GameState, from: Hex): number {
  const p = s.player.pos;
  const d = distance(from, p);
  if (d < ARCHER_MIN_RANGE || d > ARCHER_RANGE) return -1;
  const dir = lineDir(from, p);
  if (dir < 0) return -1;
  const path = ray(s, from, dir, d);
  if (path.length !== d) return -1; // wall in the way
  for (let i = 0; i < path.length - 1; i++) if (occupied(s, path[i])) return -1;
  return dir;
}

/** Hexes a readied shot will fly through (up to the first wall). */
export function shotPath(s: GameState, e: Enemy): Hex[] {
  return e.aim === null ? [] : ray(s, e.pos, e.aim, ARCHER_RANGE);
}

/**
 * The danger zone of a readied shot: its path, cut after the first enemy
 * standing in it (that enemy will take the arrow). The player is not a
 * blocker here, since the player moves before the shot resolves.
 */
export function shotDanger(s: GameState, e: Enemy): Hex[] {
  const path = shotPath(s, e);
  const i = path.findIndex((h) => enemyAt(s, h) !== undefined);
  return i < 0 ? path : path.slice(0, i + 1);
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  brute: {
    kind: 'brute',
    name: 'Brute',
    maxHp: 2,
    cost: 2,
    minDepth: 1,
    blurb: 'Smashes you if you end your turn next to it. Otherwise walks toward you.',
    act(s, e, events) {
      if (isAdjacent(e.pos, s.player.pos)) {
        events.push({ type: 'attack', kind: 'smash', by: e.id, target: PLAYER_ID });
        damagePlayer(s, 1, events);
        return;
      }
      const field = distanceField(s, s.player.pos, (t) => enemyWalkable(t) || t === 'stairs');
      const here = field.get(key(e.pos)) ?? Infinity;
      let best: Hex | null = null;
      let bestD = here;
      for (const n of neighbors(e.pos)) {
        if (!canStep(s, n)) continue;
        const d = field.get(key(n)) ?? Infinity;
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
      if (best) moveEnemy(e, best, events);
    },
  },
  archer: {
    kind: 'archer',
    name: 'Archer',
    maxHp: 1,
    cost: 3,
    minDepth: 2,
    blurb:
      'Aims down a straight line, then fires next turn. The arrow hits the first thing in the line — including other enemies. Needs a turn to reload.',
    act(s, e, events) {
      const p = s.player.pos;
      const canAim = e.reload === 0;
      if (e.reload > 0) e.reload--;
      if (!isAdjacent(e.pos, p) && canAim) {
        const dir = hasShot(s, e.pos);
        if (dir >= 0) {
          e.aim = dir;
          events.push({ type: 'aim', by: e.id, dir });
          return;
        }
      }
      // Reposition: prefer a hex with a clear shot, at a comfortable range.
      const score = (h: Hex): number =>
        (hasShot(s, h) >= 0 ? 10 : 0) - Math.abs(distance(h, p) - 3);
      let best: Hex = e.pos;
      let bestScore = score(e.pos);
      for (const n of neighbors(e.pos)) {
        if (!canStep(s, n)) continue;
        const sc = score(n);
        if (sc > bestScore) {
          bestScore = sc;
          best = n;
        }
      }
      if (best !== e.pos) moveEnemy(e, best, events);
    },
  },
};

/** Fire a readied shot. The first unit along the path takes 1 damage. */
export function fireShot(s: GameState, e: Enemy, events: GameEvent[]): void {
  const full = shotPath(s, e);
  e.aim = null;
  // Skips aiming this phase and the next one.
  e.reload = 2;
  let hitIdx = -1;
  for (let i = 0; i < full.length; i++) {
    if (occupied(s, full[i])) {
      hitIdx = i;
      break;
    }
  }
  const path = hitIdx >= 0 ? full.slice(0, hitIdx + 1) : full;
  if (hitIdx < 0) {
    events.push({ type: 'shot', by: e.id, path, hit: null });
    return;
  }
  const h = full[hitIdx];
  const victim = enemyAt(s, h);
  if (victim) {
    events.push({ type: 'shot', by: e.id, path, hit: victim.id });
    victim.hp = Math.max(0, victim.hp - 1);
    events.push({ type: 'damage', target: victim.id, amount: 1, hp: victim.hp });
    if (victim.hp === 0) {
      events.push({ type: 'death', target: victim.id });
      s.kills++;
    }
  } else {
    events.push({ type: 'shot', by: e.id, path, hit: PLAYER_ID });
    damagePlayer(s, 1, events);
  }
}
