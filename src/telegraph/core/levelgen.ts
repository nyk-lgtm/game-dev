// Procedural floor generation. Deterministic per (run seed, depth).

import { distanceField, playerWalkable } from './board';
import { ENEMIES, PYLON_REST, faceToward } from './enemies';
import { distance, eq, key, neighbors, offsetToAxial, type Hex } from '../../shared/hex';
import { Rng, mixSeed } from '../../shared/rng';
import type { Enemy, EnemyKind, GameState, Player, Tile } from './types';

export const COLS = 7;
export const ROWS = 9;
const MAX_ENEMIES = 11;
/** Start and stairs are at least this many steps apart (as the crow flies). */
export const MIN_APART = 7;
/** Salt for the start/stairs stream (separate from the layout's). */
const T_ENDS = 0x5e7a1;

export interface Floor {
  tiles: Record<string, Tile>;
  stairs: Hex;
  start: Hex;
  enemies: Omit<Enemy, 'id'>[];
}

/** The rim of the board: where starts and stairs go. */
const RIM: Hex[] = [];
for (let col = 0; col < COLS; col++)
  for (let row = 0; row < ROWS; row++)
    if (col === 0 || col === COLS - 1 || row === 0 || row === ROWS - 1) RIM.push(offsetToAxial(col, row));

/**
 * Where you arrive and where the stairs are on each floor: two rim hexes at
 * least MIN_APART apart, seeded per floor from their own stream. The stairs
 * never sit on the same hex as the floor before's (so they can't repeat
 * floor after floor), and you never arrive where you arrived last floor.
 */
export function floorEnds(seed: number, depth: number): Ends {
  let ends: Ends | null = null;
  for (let d = 1; d <= depth; d++) ends = pickEnds(new Rng(mixSeed(mixSeed(seed, T_ENDS), d)), ends);
  return ends!;
}

interface Ends {
  start: Hex;
  stairs: Hex;
}

function pickEnds(rng: Rng, prev: Ends | null): Ends {
  const start = rng.pick(RIM.filter((h) => !prev || (!eq(h, prev.start) && !eq(h, prev.stairs))));
  const far = RIM.filter((h) => distance(h, start) >= MIN_APART && !(prev && eq(h, prev.stairs)));
  return { start, stairs: rng.pick(far) };
}

export function generateFloor(seed: number, depth: number): Floor {
  const rng = new Rng(mixSeed(seed, depth));
  const ends = floorEnds(seed, depth);
  // Retry until we get a layout that satisfies all constraints.
  for (let attempt = 0; attempt < 200; attempt++) {
    const floor = tryFloor(rng, depth, ends.start, ends.stairs);
    if (floor) return floor;
  }
  throw new Error(`levelgen failed for seed ${seed} depth ${depth}`);
}

function tryFloor(rng: Rng, depth: number, start: Hex, stairs: Hex): Floor | null {
  const tiles: Record<string, Tile> = {};
  const cells: Hex[] = [];
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const h = offsetToAxial(col, row);
      tiles[key(h)] = 'floor';
      cells.push(h);
    }
  }
  tiles[key(stairs)] = 'stairs';

  const protectedHex = (h: Hex) => distance(h, start) <= 1 || distance(h, stairs) <= 1;

  // Walls: scattered pillars, sometimes pairs.
  const wallCount = rng.int(3, 6);
  for (let i = 0; i < wallCount; i++) {
    const h = rng.pick(cells);
    if (protectedHex(h) || tiles[key(h)] !== 'floor') continue;
    tiles[key(h)] = 'wall';
    if (rng.next() < 0.35) {
      const n = rng.pick(neighbors(h));
      if (tiles[key(n)] === 'floor' && !protectedHex(n)) tiles[key(n)] = 'wall';
    }
  }

  // Lava: a few small blobs.
  const blobs = rng.int(1, 3);
  for (let i = 0; i < blobs; i++) {
    let h = rng.pick(cells);
    const size = rng.int(1, 3);
    for (let j = 0; j < size; j++) {
      if (tiles[key(h)] === 'floor' && !protectedHex(h)) tiles[key(h)] = 'lava';
      const n = rng.pick(neighbors(h));
      if (tiles[key(n)] !== undefined) h = n;
    }
  }

  // Connectivity: stairs reachable, unreachable floor becomes wall.
  const shell = { tiles } as GameState;
  const field = distanceField(shell, start, playerWalkable);
  const toStairs = field.get(key(stairs));
  if (toStairs === undefined || toStairs < MIN_APART) return null;
  for (const h of cells) {
    if (tiles[key(h)] === 'floor' && !field.has(key(h))) tiles[key(h)] = 'wall';
  }

  // Enemies: each floor fields a squad of a few kinds (so floors have a
  // character: a firing line, a bomb pit, a hook-and-smash trap), always
  // including any kind that first appears on this depth. Spend a depth-scaled
  // budget on the squad, one of each kind first.
  const spots = rng.shuffle(
    cells.filter((h) => tiles[key(h)] === 'floor' && distance(h, start) >= 4),
  );
  const enemies: Omit<Enemy, 'id'>[] = [];
  let budget = floorBudget(depth);
  const squad = pickSquad(rng, depth);
  const count = (k: EnemyKind) => enemies.filter((e) => e.kind === k).length;
  const canAdd = (k: EnemyKind) => ENEMIES[k].cost <= budget && count(k) < (ENEMIES[k].max ?? MAX_ENEMIES);
  while (budget > 0 && enemies.length < MAX_ENEMIES) {
    // Brutes fill in around the squad once each squad kind has shown up.
    const pool = squad.includes('brute') || squad.some((k) => count(k) === 0) ? squad : [...squad, 'brute' as const];
    const affordable = pool.filter(canAdd);
    if (affordable.length === 0) break;
    const missing = affordable.filter((k) => count(k) === 0);
    const kind = missing.length ? missing[0] : rng.pick(affordable);
    // Prefer spots not adjacent to each other.
    const idx = spots.findIndex((h) => enemies.every((e) => distance(e.pos, h) >= 2));
    const pos = idx >= 0 ? spots.splice(idx, 1)[0] : spots.shift();
    if (!pos) break;
    const def = ENEMIES[kind];
    enemies.push({
      kind,
      pos,
      hp: def.maxHp,
      maxHp: def.maxHp,
      staggered: false,
      aim: null,
      // Pylons start out of step with each other.
      reload: kind === 'pylon' ? rng.int(0, PYLON_REST) : 0,
      facing: faceToward(pos, start),
    });
    budget -= def.cost;
  }
  if (enemies.length === 0) return null;

  return { tiles, stairs, start, enemies };
}

/**
 * Spawn budget per depth. Depth 1 is the tutorial floor; depth 2 gets a
 * little extra (depth 3 lost its +2 in rules v6, when starts and stairs
 * moved onto the whole rim: bot deaths there rose from ~16% to ~23%); past
 * depth 8 it grows by 2 a floor instead of 3, so deep floors stay crowded but
 * not packed wall to wall.
 */
export function floorBudget(depth: number): number {
  if (depth <= 1) return 4;
  if (depth <= 8) return 3 * depth + (depth === 2 ? 2 : 0);
  return 24 + 2 * (depth - 8);
}

/** Kinds that may spawn on a floor: brutes alone on depth 1, then 2-3 kinds. */
export function pickSquad(rng: Rng, depth: number): EnemyKind[] {
  const unlocked = (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => ENEMIES[k].minDepth <= depth);
  const fresh = unlocked.filter((k) => ENEMIES[k].minDepth === depth);
  const rest = rng.shuffle(unlocked.filter((k) => !fresh.includes(k)));
  const size = depth <= 1 ? 1 : depth < 5 ? 2 : 3;
  return [...fresh, ...rest].slice(0, Math.max(size, fresh.length));
}

/** Load a generated floor into a state (keeps player HP and run data). */
export function enterFloor(s: GameState, depth: number): void {
  const f = generateFloor(s.seed, depth);
  s.depth = depth;
  s.tiles = f.tiles;
  s.stairs = f.stairs;
  s.player.pos = f.start;
  s.player.facing = faceToward(f.start, f.stairs);
  s.enemies = f.enemies.map((e) => ({ ...e, id: s.nextId++ }));
  s.bombs = [];
}

export function newRun(seed: number): GameState {
  const player: Player = { pos: { q: 0, r: 0 }, hp: 3, maxHp: 3, facing: 5, bashCd: 0 };
  const s: GameState = {
    seed,
    depth: 0,
    turn: 0,
    cols: COLS,
    rows: ROWS,
    tiles: {},
    stairs: { q: 0, r: 0 },
    player,
    enemies: [],
    bombs: [],
    nextId: 1,
    kills: 0,
    status: 'playing',
  };
  enterFloor(s, 1);
  return s;
}
