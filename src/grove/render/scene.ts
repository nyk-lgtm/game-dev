// What is on screen. During animations it lags behind the game state and is
// stepped forward event by event; when idle it is rebuilt from the state.

import type { Cell, GameState } from '../core';
import type { Drawable } from './draw';

export interface Sprite {
  piece: Drawable;
  q: number;
  r: number;
  alpha: number;
  scale: number;
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
  board: Record<string, Cell>;
  sprites: Sprite[];
  /** Cell key -> pop-in progress 0..1 (absent = settled). */
  pops: Map<string, number>;
  floaters: Floater[];
  flash: { q: number; r: number; t: number } | null;
}

export function sceneFromState(s: GameState, prev?: Scene): Scene {
  return {
    board: { ...s.board },
    sprites: [],
    pops: new Map(),
    floaters: prev?.floaters ?? [],
    flash: null,
  };
}
