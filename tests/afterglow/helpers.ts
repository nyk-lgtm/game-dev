import {
  DT,
  choose,
  createWorld,
  recomputeStats,
  spawnEnemy,
  step,
  takeChest,
  waiting,
  type Enemy,
  type EnemyKind,
  type World,
} from '../../src/afterglow/core';

/**
 * A calm test world: no weapons, no enemies, no director spawns, and the player
 * parked at the origin facing up. Individual tests add what they need.
 */
export function calmWorld(seed = 1, character = 'spark'): World {
  const w = createWorld(seed, character);
  w.weapons = [];
  w.enemies = [];
  // The director accumulates spawns in spawnAcc; a hugely negative value
  // keeps regular spawns off for the whole test.
  w.spawnAcc = -1e9;
  return w;
}

/** Player that effectively cannot die. */
export function makeImmortal(w: World): void {
  w.base.maxHp = 1e9;
  recomputeStats(w);
  w.player.hp = 1e9;
}

export function put(w: World, kind: EnemyKind, x: number, y: number, hp?: number): Enemy {
  const e = spawnEnemy(w, kind, x, y);
  if (hp !== undefined) {
    e.hp = hp;
    e.maxHp = hp;
  }
  return e;
}

export function stepN(w: World, n: number, ix = 0, iy = 0): void {
  for (let i = 0; i < n; i++) step(w, ix, iy);
}

export const secondsToSteps = (s: number) => Math.ceil(s / DT);

/** Resolve any pending level-ups (first option) and chests. */
export function resolveWaiting(w: World): void {
  while (waiting(w)) {
    if (w.pendingLevels > 0) choose(w, 0);
    else takeChest(w);
  }
}

export const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
