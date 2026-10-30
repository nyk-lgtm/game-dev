// Procedural floor generation. Deterministic per (run seed, depth).

import { distanceField, playerWalkable } from './board';
import { ENEMIES, faceToward } from './enemies';
import { distance, key, neighbors, offsetToAxial, type Hex } from './hex';
import { Rng, mixSeed } from './rng';
import type { Enemy, EnemyKind, GameState, Player, Tile } from './types';

export const COLS = 7;
export const ROWS = 9;
const START = offsetToAxial(3, ROWS - 1);
const MAX_ENEMIES = 12;

export interface Floor {
  tiles: Record<string, Tile>;
  stairs: Hex;
  start: Hex;
  enemies: Omit<Enemy, 'id'>[];
}

export function generateFloor(seed: number, depth: number): Floor {
  const rng = new Rng(mixSeed(seed, depth));
  // Retry until we get a layout that satisfies all constraints.
  for (let attempt = 0; attempt < 200; attempt++) {
    const floor = tryFloor(rng, depth);
    if (floor) return floor;
  }
  throw new Error(`levelgen failed for seed ${seed} depth ${depth}`);
}

function tryFloor(rng: Rng, depth: number): Floor | null {
  const tiles: Record<string, Tile> = {};
  const cells: Hex[] = [];
  for (let col = 0; col < COLS; col++) {
    for (let row = 0; row < ROWS; row++) {
      const h = offsetToAxial(col, row);
      tiles[key(h)] = 'floor';
      cells.push(h);
    }
  }
  const stairs = offsetToAxial(rng.int(1, COLS - 2), 0);
  tiles[key(stairs)] = 'stairs';

  const protectedHex = (h: Hex) => distance(h, START) <= 1 || distance(h, stairs) <= 1;

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
  const field = distanceField(shell, START, playerWalkable);
  const toStairs = field.get(key(stairs));
  if (toStairs === undefined || toStairs < ROWS - 2) return null;
  for (const h of cells) {
    if (tiles[key(h)] === 'floor' && !field.has(key(h))) tiles[key(h)] = 'wall';
  }

  // Enemies: spend a depth-scaled budget.
  const spots = rng.shuffle(
    cells.filter((h) => tiles[key(h)] === 'floor' && distance(h, START) >= 4),
  );
  // Prefer spots not adjacent to each other.
  const enemies: Omit<Enemy, 'id'>[] = [];
  let budget = 1 + 3 * depth;
  const kinds = (Object.keys(ENEMIES) as EnemyKind[]).filter((k) => ENEMIES[k].minDepth <= depth);
  while (budget > 0 && enemies.length < MAX_ENEMIES) {
    const affordable = kinds.filter((k) => ENEMIES[k].cost <= budget);
    if (affordable.length === 0) break;
    const kind = rng.pick(affordable);
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
      reload: 0,
      facing: faceToward(pos, START),
    });
    budget -= def.cost;
  }
  if (enemies.length === 0) return null;

  return { tiles, stairs, start: START, enemies };
}

/** Load a generated floor into a state (keeps player HP and run data). */
export function enterFloor(s: GameState, depth: number): void {
  const f = generateFloor(s.seed, depth);
  s.depth = depth;
  s.tiles = f.tiles;
  s.stairs = f.stairs;
  s.player.pos = f.start;
  s.player.facing = 5;
  s.enemies = f.enemies.map((e) => ({ ...e, id: s.nextId++ }));
  s.bombs = [];
}

export function newRun(seed: number): GameState {
  const player: Player = { pos: START, hp: 3, maxHp: 3, facing: 5, bashCd: 0 };
  const s: GameState = {
    seed,
    depth: 0,
    turn: 0,
    cols: COLS,
    rows: ROWS,
    tiles: {},
    stairs: START,
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
