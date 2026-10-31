// Enemy definitions. Each kind is data (stats, spawn cost) plus behavior:
// `act` runs during the enemy phase; `release` (optional) resolves a readied
// telegraph (shot, charge) at the start of the next enemy phase. Adding a new
// enemy = adding an entry here (plus its look in src/render/draw.ts).

import { distanceField, enemyAt, enemyWalkable, occupied, ray, shotPasses, tileAt, unitAt } from './board';
import { damageUnit, frontArc, shieldBlocks } from './combat';
import { DIRS, add, distance, eq, isAdjacent, key, lineDir, neighbors, type Hex } from '../../shared/hex';
import { PLAYER_ID, type Enemy, type EnemyKind, type GameEvent, type GameState, type Tile } from './types';

export const ARCHER_RANGE = 5;
export const ARCHER_MIN_RANGE = 2;
export const CHARGE_RANGE = 6;
export const BOMB_MIN_RANGE = 2;
export const BOMB_MAX_RANGE = 4;
/** Bombs explode on the second enemy phase after landing: two moves to get clear. */
export const BOMB_FUSE = 2;

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
  release?(s: GameState, e: Enemy, events: GameEvent[]): void;
}

// ---------- shared behavior helpers ----------

function moveEnemy(e: Enemy, to: Hex, events: GameEvent[]): void {
  events.push({ type: 'enemyMove', id: e.id, from: e.pos, to });
  e.pos = to;
}

function canStep(s: GameState, h: Hex): boolean {
  return enemyWalkable(tileAt(s, h)) && !occupied(s, h);
}

function pathField(s: GameState): Map<string, number> {
  return distanceField(s, s.player.pos, (t) => enemyWalkable(t) || t === 'stairs');
}

/** Step to the neighbor (from `options`) that most shortens the walk to the player. */
function stepToward(s: GameState, e: Enemy, events: GameEvent[], options = neighbors(e.pos)): boolean {
  const field = pathField(s);
  let best: Hex | null = null;
  let bestD = field.get(key(e.pos)) ?? Infinity;
  for (const n of options) {
    if (!canStep(s, n)) continue;
    const d = field.get(key(n)) ?? Infinity;
    if (d < bestD) {
      bestD = d;
      best = n;
    }
  }
  if (best) moveEnemy(e, best, events);
  return best !== null;
}

/** Move to the best-scoring neighbor (or stay, which wins ties). */
function reposition(s: GameState, e: Enemy, events: GameEvent[], score: (h: Hex) => number): void {
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
}

/**
 * Direction from `from` straight at the player if the player is within
 * [min, max] and every hex in between passes `ok` and is empty; else -1.
 */
function lineTo(s: GameState, from: Hex, min: number, max: number, ok: (t: Tile | undefined) => boolean): number {
  const p = s.player.pos;
  const d = distance(from, p);
  if (d < min || d > max) return -1;
  const dir = lineDir(from, p);
  if (dir < 0) return -1;
  let cur = from;
  for (let i = 1; i < d; i++) {
    cur = add(cur, DIRS[dir]);
    if (!ok(tileAt(s, cur)) || occupied(s, cur)) return -1;
  }
  return dir;
}

/** Direction whose neighbor is closest to `target` (first wins ties). */
export function faceToward(from: Hex, target: Hex): number {
  let best = 0;
  let bestD = Infinity;
  DIRS.forEach((d, i) => {
    const dd = distance(add(from, d), target);
    if (dd < bestD) {
      bestD = dd;
      best = i;
    }
  });
  return best;
}

function smash(s: GameState, e: Enemy, events: GameEvent[]): void {
  events.push({ type: 'attack', kind: 'smash', by: e.id, target: PLAYER_ID });
  damageUnit(s, PLAYER_ID, 1, events);
}

/** Reload bookkeeping: returns whether the enemy may aim/throw this action. */
function ready(e: Enemy): boolean {
  const ok = e.reload === 0;
  if (e.reload > 0) e.reload--;
  return ok;
}

export function hasShot(s: GameState, from: Hex): number {
  return lineTo(s, from, ARCHER_MIN_RANGE, ARCHER_RANGE, shotPasses);
}

export function hasCharge(s: GameState, from: Hex): number {
  return lineTo(s, from, 2, CHARGE_RANGE, (t) => t === 'floor');
}

/** Hexes a readied shot will fly through (up to the first wall). */
export function shotPath(s: GameState, e: Enemy): Hex[] {
  return e.aim === null ? [] : ray(s, e.pos, e.aim, ARCHER_RANGE);
}

/**
 * Where a readied charge goes: until a blocking unit (included), lava
 * (included) or an obstacle. `blocks` decides which hexes hold a blocker.
 */
export function chargePath(
  s: GameState,
  e: Enemy,
  blocks: (h: Hex) => boolean = (h) => unitAt(s, h) !== null,
): Hex[] {
  if (e.aim === null) return [];
  const out: Hex[] = [];
  let cur = e.pos;
  for (;;) {
    cur = add(cur, DIRS[e.aim]);
    const t = tileAt(s, cur);
    if (blocks(cur)) {
      out.push(cur);
      break;
    }
    if (t === 'floor') out.push(cur);
    else {
      if (t === 'lava') out.push(cur);
      break;
    }
  }
  return out;
}

// ---------- definitions ----------

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  brute: {
    kind: 'brute',
    name: 'Brute',
    maxHp: 2,
    cost: 2,
    minDepth: 1,
    blurb: 'Smashes you if you end your turn next to it. Otherwise walks toward you.',
    act(s, e, events) {
      if (isAdjacent(e.pos, s.player.pos)) smash(s, e, events);
      else stepToward(s, e, events);
    },
  },

  guard: {
    kind: 'guard',
    name: 'Guard',
    maxHp: 2,
    cost: 3,
    minDepth: 2,
    blurb:
      'Shield blocks stabs, lunges and arrows from the 3 hexes it faces; it only smashes those 3. Turns slowly — get behind it.',
    act(s, e, events) {
      const p = s.player.pos;
      if (frontArc(e).some((h) => eq(h, p))) {
        smash(s, e, events);
        return;
      }
      const want = faceToward(e.pos, p);
      if (want !== e.facing) {
        // Turn one step toward the player, the short way round.
        const cw = (want - e.facing + 6) % 6;
        e.facing = (e.facing + (cw <= 3 ? 1 : 5)) % 6;
        events.push({ type: 'face', id: e.id, dir: e.facing });
        return;
      }
      stepToward(s, e, events, frontArc(e));
    },
  },

  archer: {
    kind: 'archer',
    name: 'Archer',
    maxHp: 1,
    cost: 3,
    minDepth: 2,
    blurb:
      'Aims down a line, then fires next turn, hitting the first thing in it — enemies too. Rests a turn after firing.',
    act(s, e, events) {
      const p = s.player.pos;
      if (ready(e) && !isAdjacent(e.pos, p)) {
        const dir = hasShot(s, e.pos);
        if (dir >= 0) {
          e.aim = dir;
          e.facing = dir;
          events.push({ type: 'aim', by: e.id, dir });
          return;
        }
      }
      // Reposition: prefer a hex with a clear shot, at a comfortable range.
      reposition(s, e, events, (h) => (hasShot(s, h) >= 0 ? 10 : 0) - Math.abs(distance(h, p) - 3));
    },
    release(s, e, events) {
      const full = shotPath(s, e);
      e.aim = null;
      // Firing uses this turn; the next turn it repositions instead of aiming.
      e.reload = 1;
      const i = full.findIndex((h) => occupied(s, h));
      const path = i >= 0 ? full.slice(0, i + 1) : full;
      if (i < 0) {
        events.push({ type: 'shot', by: e.id, path, hit: null });
        return;
      }
      const victim = unitAt(s, full[i])!;
      events.push({ type: 'shot', by: e.id, path, hit: victim });
      const ve = enemyAt(s, full[i]);
      if (ve && shieldBlocks(ve, i === 0 ? e.pos : full[i - 1])) {
        events.push({ type: 'blocked', target: ve.id });
        return;
      }
      damageUnit(s, victim, 1, events);
    },
  },

  bomber: {
    kind: 'bomber',
    name: 'Bomber',
    maxHp: 1,
    cost: 3,
    minDepth: 3,
    blurb:
      'Lobs a bomb at your hex from 2–4 away. Two turns later it blasts that hex and the 6 around it — enemies too.',
    act(s, e, events) {
      const p = s.player.pos;
      const d = distance(e.pos, p);
      if (ready(e) && d >= BOMB_MIN_RANGE && d <= BOMB_MAX_RANGE) {
        s.bombs.push({ pos: p, by: e.id, fuse: BOMB_FUSE });
        e.reload = 2;
        events.push({ type: 'throw', by: e.id, at: p });
        return;
      }
      reposition(s, e, events, (h) => -Math.abs(distance(h, p) - 3));
    },
  },

  charger: {
    kind: 'charger',
    name: 'Charger',
    maxHp: 2,
    cost: 4,
    minDepth: 4,
    blurb:
      'Lines up on you, then next turn charges until it rams something (1 damage). Dies in lava. Rests after. Never aims from next to you.',
    act(s, e, events) {
      const p = s.player.pos;
      if (ready(e)) {
        const dir = hasCharge(s, e.pos);
        if (dir >= 0) {
          e.aim = dir;
          e.facing = dir;
          events.push({ type: 'aim', by: e.id, dir });
          return;
        }
      }
      reposition(s, e, events, (h) => (hasCharge(s, h) >= 0 ? 10 : 0) - Math.abs(distance(h, p) - 3));
    },
    release(s, e, events) {
      const path = chargePath(s, e);
      e.aim = null;
      e.reload = 1;
      const last = path.at(-1);
      const hit = last ? unitAt(s, last) : null;
      const end = hit !== null ? path.at(-2) ?? e.pos : last ?? e.pos;
      if (!eq(end, e.pos)) {
        events.push({ type: 'charge', id: e.id, from: e.pos, to: end });
        e.pos = end;
      }
      if (tileAt(s, e.pos) === 'lava') {
        events.push({ type: 'fall', id: e.id });
        damageUnit(s, e.id, e.hp, events);
        return;
      }
      if (hit !== null) {
        events.push({ type: 'attack', kind: 'charge', by: e.id, target: hit });
        damageUnit(s, hit, 1, events);
      }
    },
  },
};

/** Every unit within 1 of the bomb takes 1 damage. */
export function explode(s: GameState, at: Hex, events: GameEvent[]): void {
  events.push({ type: 'explode', at });
  for (const h of [at, ...neighbors(at)]) {
    const u = unitAt(s, h);
    if (u !== null) damageUnit(s, u, 1, events);
  }
}
