// The visual model: what is on screen right now. During animations it drifts
// away from the game state (units mid-move, flashing, fading); when idle it is
// rebuilt from the state.

import { PLAYER_ID, type EnemyKind, type GameState } from '../core';

export interface VisUnit {
  id: number;
  kind: 'player' | EnemyKind;
  q: number;
  r: number;
  hp: number;
  maxHp: number;
  alpha: number;
  scale: number;
  /** 0..1 white flash after being hit. */
  flash: number;
  /** Bump offset in hex units (attack lunges). */
  bq: number;
  br: number;
  staggered: boolean;
  aim: number | null;
  reload: number;
  facing: number;
}

export interface Floater {
  text: string;
  color: string;
  q: number;
  r: number;
  age: number;
  life: number;
}

export interface Scene {
  state: GameState;
  units: Map<number, VisUnit>;
  projectile: { q: number; r: number; dir: number } | null;
  floaters: Floater[];
  /** Screen shake strength in px, decays over time. */
  shake: number;
  /** Red damage vignette 0..1, decays. */
  hurt: number;
  /** Black fade 0..1 (floor transitions). */
  fade: number;
}

export function sceneFromState(s: GameState, prev?: Scene): Scene {
  const units = new Map<number, VisUnit>();
  const base = { alpha: 1, scale: 1, flash: 0, bq: 0, br: 0 };
  units.set(PLAYER_ID, {
    ...base,
    id: PLAYER_ID,
    kind: 'player',
    q: s.player.pos.q,
    r: s.player.pos.r,
    hp: s.player.hp,
    maxHp: s.player.maxHp,
    staggered: false,
    aim: null,
    reload: 0,
    facing: s.player.facing,
  });
  for (const e of s.enemies) {
    if (e.hp <= 0) continue;
    units.set(e.id, {
      ...base,
      id: e.id,
      kind: e.kind,
      q: e.pos.q,
      r: e.pos.r,
      hp: e.hp,
      maxHp: e.maxHp,
      staggered: e.staggered,
      aim: e.aim,
      reload: e.reload,
      facing: e.aim ?? 2,
    });
  }
  return {
    state: s,
    units,
    projectile: null,
    floaters: prev?.floaters ?? [],
    shake: prev?.shake ?? 0,
    hurt: prev?.hurt ?? 0,
    fade: 0,
  };
}
