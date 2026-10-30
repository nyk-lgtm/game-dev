import type { Hex } from './hex';

export type Tile = 'floor' | 'wall' | 'lava' | 'stairs';

export type EnemyKind = 'brute' | 'archer' | 'guard' | 'bomber' | 'charger';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  pos: Hex;
  hp: number;
  maxHp: number;
  /** Bashed this turn: skips its next action and loses its aim. */
  staggered: boolean;
  /** Direction index (DIRS) of a readied shot or charge, or null. */
  aim: number | null;
  /** Turns until this enemy may aim or throw again. */
  reload: number;
  /** Direction index the enemy faces (guards block and strike on this side). */
  facing: number;
}

export interface Bomb {
  pos: Hex;
  by: number;
  /** Enemy phases left until it explodes (explodes when this reaches 0). */
  fuse: number;
}

export interface Player {
  pos: Hex;
  hp: number;
  maxHp: number;
  /** Direction index the player last moved or bashed in (for rendering). */
  facing: number;
  /** Turns until Bash is ready again (0 = ready). */
  bashCd: number;
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
  /** Lit bombs; each ticks down at the start of every enemy phase. */
  bombs: Bomb[];
  nextId: number;
  kills: number;
  status: 'playing' | 'dead';
}

export type Action = { type: 'move'; to: Hex } | { type: 'bash'; target: Hex } | { type: 'wait' };

export type AttackKind = 'stab' | 'lunge' | 'smash' | 'bash' | 'charge';

/** Target id 0 is the player; enemies use positive ids. */
export const PLAYER_ID = 0;

export type GameEvent =
  | { type: 'playerMove'; from: Hex; to: Hex }
  | { type: 'playerWait' }
  | { type: 'attack'; kind: AttackKind; by: number; target: number }
  | { type: 'damage'; target: number; amount: number; hp: number }
  | { type: 'death'; target: number }
  | { type: 'stagger'; target: number }
  | { type: 'blocked'; target: number }
  | { type: 'shot'; by: number; path: Hex[]; hit: number | null }
  | { type: 'aim'; by: number; dir: number }
  | { type: 'face'; id: number; dir: number }
  | { type: 'enemyMove'; id: number; from: Hex; to: Hex }
  | { type: 'push'; id: number; from: Hex; to: Hex }
  | { type: 'slam'; id: number; into: number | null; at: Hex }
  | { type: 'fall'; id: number }
  | { type: 'throw'; by: number; at: Hex }
  | { type: 'fuseTick' }
  | { type: 'explode'; at: Hex }
  | { type: 'charge'; id: number; from: Hex; to: Hex }
  | { type: 'descend'; depth: number; healed: boolean }
  | { type: 'playerDeath' };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
