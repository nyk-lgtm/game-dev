import type { Hex } from '../../shared/hex';

/** Things that merge: plants (seed → … → spirit tree) and stones (stone → cairn → monolith). */
export type Family = 'plant' | 'stone';

export type Cell =
  | { kind: Family; tier: number }
  | { kind: 'wisp'; id: number }
  | null;

/** What the player can hold and place. */
export type HandPiece =
  | { kind: 'plant'; tier: number }
  | { kind: 'wisp' }
  /** Becomes whatever piece makes the best merge where it lands (else a stone). */
  | { kind: 'crystal' }
  /** Clears one occupied cell; a wisp it hits turns to stone. */
  | { kind: 'bolt' };

export interface Wisp {
  id: number;
  /** Where it will step next turn (shown on the board), or null if boxed in. */
  plan: Hex | null;
}

export interface GameState {
  seed: number;
  turn: number;
  score: number;
  /** Every board cell, keyed by hex key; null = empty. */
  board: Record<string, Cell>;
  wisps: Wisp[];
  nextWispId: number;
  current: HandPiece;
  stash: HandPiece | null;
  /** Index of the next piece to draw from the seeded bag. */
  draws: number;
  /** Highest plant tier reached (for the hub's best-score display). */
  bestTier: number;
  status: 'playing' | 'over';
}

export type Action = { type: 'place'; at: Hex } | { type: 'swap' };

export type GameEvent =
  | { type: 'place'; at: Hex; piece: HandPiece }
  | { type: 'crystal'; at: Hex; became: { kind: Family; tier: number } }
  | { type: 'merge'; at: Hex; from: Hex[]; kind: Family; tier: number; points: number }
  | { type: 'score'; at: Hex; points: number }
  | { type: 'bolt'; at: Hex; hit: Cell }
  | { type: 'wispMove'; id: number; from: Hex; to: Hex }
  | { type: 'wispTrapped'; id: number; at: Hex }
  | { type: 'swap' }
  | { type: 'gameOver' };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
