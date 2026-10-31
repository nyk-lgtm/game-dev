import { expect } from 'vitest';
import {
  CELLS,
  MAX_TIER,
  Rng,
  cellAt,
  drawPiece,
  emptyCells,
  key,
  newGame,
  wispPlan,
  wispPos,
  type Action,
  type Cell,
  type GameState,
  type HandPiece,
  type Hex,
  type StepResult,
} from '../../src/grove/core';

export interface BlankOpts {
  seed?: number;
  current?: HandPiece;
  stash?: HandPiece | null;
  draws?: number;
  cells?: [Hex, Cell][];
}

/** An empty board (all 37 cells null), no wisps, with the given hand. */
export function blankState(opts: BlankOpts = {}): GameState {
  const s = newGame(opts.seed ?? 1);
  for (const h of CELLS) s.board[key(h)] = null;
  s.wisps = [];
  s.nextWispId = 1;
  s.turn = 0;
  s.score = 0;
  s.bestTier = 0;
  s.current = opts.current ?? { kind: 'plant', tier: 0 };
  s.stash = opts.stash ?? null;
  s.draws = opts.draws ?? 1;
  for (const [h, c] of opts.cells ?? []) s.board[key(h)] = c;
  return s;
}

export const plant = (tier: number): Cell => ({ kind: 'plant', tier });
export const stone = (tier: number): Cell => ({ kind: 'stone', tier });

/** Put a wisp on the board and register it (plan defaults to null). */
export function addWisp(s: GameState, at: Hex, plan: Hex | null = null): number {
  const id = s.nextWispId++;
  s.board[key(at)] = { kind: 'wisp', id };
  s.wisps.push({ id, plan });
  return id;
}

/** Fill every cell with a Monolith (never merges) except the given hexes. */
export function fillMonoliths(s: GameState, except: Hex[] = []): void {
  const skip = new Set(except.map(key));
  for (const h of CELLS) if (!skip.has(key(h))) s.board[key(h)] = stone(2);
}

/** Smallest seed >= 1 whose draw number `n` satisfies `pred`. */
export function seedWhereDraw(n: number, pred: (p: HandPiece) => boolean): number {
  for (let seed = 1; seed < 100_000; seed++) if (pred(drawPiece(seed, n))) return seed;
  throw new Error('no seed found');
}

export const place = (at: Hex): Action => ({ type: 'place', at });
export const swap: Action = { type: 'swap' };

export function countOf(s: GameState, pred: (c: Cell) => boolean): number {
  return CELLS.filter((h) => pred(cellAt(s, h))).length;
}

/** Independent re-implementation of "empty neighbor with most empty neighbors, first DIRS index wins". */
export function bestEmptyNeighbor(s: GameState, at: Hex): Hex | null {
  const D = [
    [1, -1],
    [1, 0],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [0, -1],
  ];
  const empty = (q: number, r: number) => key({ q, r }) in s.board && s.board[key({ q, r })] === null;
  let best: Hex | null = null;
  let bestRoom = -1;
  for (const [dq, dr] of D) {
    const n = { q: at.q + dq, r: at.r + dr };
    if (!empty(n.q, n.r)) continue;
    const room = D.filter(([a, b]) => empty(n.q + a, n.r + b)).length;
    if (room > bestRoom) {
      bestRoom = room;
      best = n;
    }
  }
  return best;
}

/** A random legal action, biased to placements (~10% swaps). Null if none exists. */
export function randomAction(s: GameState, rng: Rng, swapChance = 0.1): Action | null {
  if (s.status !== 'playing') return null;
  if (rng.next() < swapChance) return { type: 'swap' };
  const targets = s.current.kind === 'bolt' ? CELLS : emptyCells(s);
  if (targets.length === 0) return { type: 'swap' };
  return { type: 'place', at: rng.pick(targets) };
}

/** Structural invariants that must hold in every reachable state. */
export function checkInvariants(s: GameState): void {
  const keys = new Set(CELLS.map(key));
  expect(Object.keys(s.board).length).toBe(37);
  for (const k of Object.keys(s.board)) expect(keys.has(k)).toBe(true);
  const wispCells: { id: number; at: Hex }[] = [];
  for (const h of CELLS) {
    const c = cellAt(s, h);
    if (c === null) continue;
    if (c.kind === 'wisp') wispCells.push({ id: c.id, at: h });
    else {
      expect(c.tier).toBeGreaterThanOrEqual(0);
      expect(c.tier).toBeLessThanOrEqual(MAX_TIER[c.kind]);
    }
  }
  expect(wispCells.length).toBe(s.wisps.length);
  for (const w of s.wisps) {
    expect(wispCells.filter((c) => c.id === w.id).length).toBe(1);
    const at = wispPos(s, w.id)!;
    expect(w.plan).toEqual(wispPlan(s, at));
  }
  expect(new Set(s.wisps.map((w) => w.id)).size).toBe(s.wisps.length);
  if (s.current.kind === 'plant') expect(s.current.tier).toBeLessThanOrEqual(MAX_TIER.plant);
  if (s.status === 'over') expect(emptyCells(s).length).toBe(0);
}

export const mergeEvents = (r: StepResult) => r.events.filter((e) => e.type === 'merge');
