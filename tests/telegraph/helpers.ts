import { ENEMIES, COLS, ROWS, key, offsetToAxial, type Enemy, type EnemyKind, type GameState, type Hex, type Tile } from '../../src/telegraph/core';

/** An open board with the player at `player` and stairs far away in a corner. */
export function blankState(player: Hex, opts: { tiles?: [Hex, Tile][]; hp?: number } = {}): GameState {
  const tiles: Record<string, Tile> = {};
  for (let col = 0; col < COLS; col++)
    for (let row = 0; row < ROWS; row++) tiles[key(offsetToAxial(col, row))] = 'floor';
  const stairs = offsetToAxial(0, 0);
  tiles[key(stairs)] = 'stairs';
  for (const [h, t] of opts.tiles ?? []) tiles[key(h)] = t;
  return {
    seed: 1,
    depth: 1,
    turn: 0,
    cols: COLS,
    rows: ROWS,
    tiles,
    stairs,
    player: { pos: player, hp: opts.hp ?? 3, maxHp: 3, facing: 5, bashCd: 0 },
    enemies: [],
    bombs: [],
    nextId: 1,
    kills: 0,
    status: 'playing',
  };
}

export function addEnemy(s: GameState, kind: EnemyKind, pos: Hex, extra: Partial<Enemy> = {}): Enemy {
  const def = ENEMIES[kind];
  const e: Enemy = {
    id: s.nextId++,
    kind,
    pos,
    hp: def.maxHp,
    maxHp: def.maxHp,
    staggered: false,
    aim: null,
    reload: 0,
    facing: 2,
    ...extra,
  };
  s.enemies.push(e);
  return e;
}
