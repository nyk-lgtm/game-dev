import { DIRS, add, eq, key, neighbors, type Hex } from './hex';
import { PLAYER_ID, type Enemy, type GameState, type Tile } from './types';

export function tileAt(s: GameState, h: Hex): Tile | undefined {
  return s.tiles[key(h)];
}

export const inBounds = (s: GameState, h: Hex): boolean => tileAt(s, h) !== undefined;

/** Tiles the player may stand on. */
export function playerWalkable(t: Tile | undefined): boolean {
  return t === 'floor' || t === 'stairs';
}

/** Tiles enemies may stand on (they never enter the stairs). */
export function enemyWalkable(t: Tile | undefined): boolean {
  return t === 'floor';
}

/** Whether a projectile can pass through this tile (lava doesn't block, walls do). */
export function shotPasses(t: Tile | undefined): boolean {
  return t !== undefined && t !== 'wall';
}

export function enemyAt(s: GameState, h: Hex): Enemy | undefined {
  return s.enemies.find((e) => e.hp > 0 && eq(e.pos, h));
}

/** Id of the unit on a hex (PLAYER_ID for the player), or null. */
export function unitAt(s: GameState, h: Hex): number | null {
  if (eq(s.player.pos, h)) return PLAYER_ID;
  return enemyAt(s, h)?.id ?? null;
}

export function occupied(s: GameState, h: Hex): boolean {
  return eq(s.player.pos, h) || enemyAt(s, h) !== undefined;
}

export function legalMoves(s: GameState): Hex[] {
  if (s.status !== 'playing') return [];
  return neighbors(s.player.pos).filter((h) => playerWalkable(tileAt(s, h)) && !occupied(s, h));
}

/** Breadth-first step distances from `from` over tiles passing `ok` (units ignored). */
export function distanceField(
  s: GameState,
  from: Hex,
  ok: (t: Tile | undefined) => boolean,
): Map<string, number> {
  const dist = new Map<string, number>([[key(from), 0]]);
  const queue: Hex[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const d = dist.get(key(cur))!;
    for (const n of neighbors(cur)) {
      const k = key(n);
      if (dist.has(k) || !ok(tileAt(s, n))) continue;
      dist.set(k, d + 1);
      queue.push(n);
    }
  }
  return dist;
}

/** Hexes along a straight line from (excluding) `from`, until out of bounds, a wall, or `range`. */
export function ray(s: GameState, from: Hex, dir: number, range: number): Hex[] {
  const out: Hex[] = [];
  let cur = from;
  for (let i = 0; i < range; i++) {
    cur = add(cur, DIRS[dir]);
    if (!shotPasses(tileAt(s, cur))) break;
    out.push(cur);
  }
  return out;
}

export function allHexes(s: GameState): Hex[] {
  return Object.keys(s.tiles).map((k) => {
    const [q, r] = k.split(',').map(Number);
    return { q, r };
  });
}
