import type { Hex } from './hex';

export type Tile = 'floor' | 'wall' | 'lava' | 'stairs';

export type EnemyKind = 'brute' | 'archer';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Hex;
  hp: number;
  maxHp: number;
  /** Damaged by the player this turn: skips its next action and loses its aim. */
  staggered: boolean;
  /** Direction index (DIRS) of a readied shot, or null. */
  aim: number | null;
  /** Turns until this enemy may aim again. */
  reload: number;
}

export interface Player {
  pos: Hex;
  hp: number;
  maxHp: number;
  /** Direction index the player last moved in (for rendering). */
  facing: number;
}

export interface GameState {
  seed: number;
  depth: number;
  turn: number;
  cols: number;
  rows: number;
  tiles: Record<string, Tile>;
  stairs: Hex;
  player: Player;
  enemies: Enemy[];
  nextId: number;
  kills: number;
  status: 'playing' | 'dead';
}

export type Action = { type: 'move'; to: Hex } | { type: 'wait' };

export type AttackKind = 'stab' | 'lunge' | 'smash' | 'arrow';

/** Target id 0 is the player; enemies use positive ids. */
export const PLAYER_ID = 0;

export type GameEvent =
  | { type: 'playerMove'; from: Hex; to: Hex }
  | { type: 'playerWait' }
  | { type: 'attack'; kind: AttackKind; by: number; target: number }
  | { type: 'damage'; target: number; amount: number; hp: number }
  | { type: 'death'; target: number }
  | { type: 'stagger'; target: number }
  | { type: 'shot'; by: number; path: Hex[]; hit: number | null }
  | { type: 'aim'; by: number; dir: number }
  | { type: 'enemyMove'; id: number; from: Hex; to: Hex }
  | { type: 'descend'; depth: number; healed: boolean }
  | { type: 'playerDeath' };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
