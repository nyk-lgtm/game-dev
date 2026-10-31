// Grove rules. Pure and deterministic: (state, action) -> (state, events).
//
// Place the piece in hand on an empty hex. Three or more touching identical
// pieces merge into one of the next tier where the last piece landed, and
// that can chain. Wisps wander one step per turn (their next step is shown);
// a wisp with no empty neighbor turns to stone. The game ends when the board
// is full.

import { DIRS, add, distance, key, neighbors, type Hex } from '../../shared/hex';
import { Rng, mixSeed } from '../../shared/rng';
import type { Action, Cell, Family, GameEvent, GameState, HandPiece, StepResult } from './types';

export const RADIUS = 3;

export const PLANT_NAMES = ['Seed', 'Sprout', 'Bush', 'Tree', 'Grove', 'Spirit Tree'];
export const STONE_NAMES = ['Stone', 'Cairn', 'Monolith'];
/** Points for creating each tier (by placing or merging). */
export const POINTS: Record<Family, number[]> = {
  plant: [5, 20, 100, 500, 1500, 5000],
  stone: [0, 250, 1500],
};
export const MAX_TIER: Record<Family, number> = { plant: 5, stone: 2 };

/** Every hex of the radius-3 hexagonal board (37 cells), in a fixed order. */
export const CELLS: Hex[] = (() => {
  const out: Hex[] = [];
  for (let q = -RADIUS; q <= RADIUS; q++)
    for (let r = -RADIUS; r <= RADIUS; r++) if (distance({ q, r }, { q: 0, r: 0 }) <= RADIUS) out.push({ q, r });
  return out;
})();

export const onBoard = (s: GameState, h: Hex): boolean => key(h) in s.board;
export const cellAt = (s: GameState, h: Hex): Cell => s.board[key(h)] ?? null;
const boardNeighbors = (s: GameState, h: Hex): Hex[] => neighbors(h).filter((n) => onBoard(s, n));
export const emptyCells = (s: GameState): Hex[] => CELLS.filter((h) => cellAt(s, h) === null);
const emptyNeighbors = (s: GameState, h: Hex): Hex[] => boardNeighbors(s, h).filter((n) => cellAt(s, n) === null);

export function nameOf(kind: Family, tier: number): string {
  return (kind === 'plant' ? PLANT_NAMES : STONE_NAMES)[tier];
}

// ---------- the bag ----------

/** The n-th piece of a game's sequence. Deterministic per (seed, n). */
export function drawPiece(seed: number, n: number): HandPiece {
  const r = new Rng(mixSeed(seed, n + 1)).next();
  if (r < 0.48) return { kind: 'plant', tier: 0 };
  if (r < 0.64) return { kind: 'plant', tier: 1 };
  if (r < 0.69) return { kind: 'plant', tier: 2 };
  if (r < 0.89) return { kind: 'wisp' };
  if (r < 0.94) return { kind: 'crystal' };
  return { kind: 'bolt' };
}

// ---------- merging ----------

/** Connected group of cells holding exactly `kind`/`tier`, starting from `at`. */
export function groupAt(s: GameState, at: Hex, kind: Family, tier: number): Hex[] {
  const same = (h: Hex) => {
    const c = cellAt(s, h);
    return c !== null && c.kind === kind && 'tier' in c && c.tier === tier;
  };
  const seen = new Set([key(at)]);
  const out = [at];
  for (let i = 0; i < out.length; i++) {
    for (const n of boardNeighbors(s, out[i])) {
      if (seen.has(key(n)) || !same(n)) continue;
      seen.add(key(n));
      out.push(n);
    }
  }
  return out;
}

/** Put a merging piece at `at` and resolve the merge chain there. */
function settle(s: GameState, at: Hex, kind: Family, tier: number, events: GameEvent[]): void {
  s.board[key(at)] = { kind, tier };
  for (;;) {
    const group = groupAt(s, at, kind, tier);
    if (group.length < 3 || tier >= MAX_TIER[kind]) return;
    for (const h of group) s.board[key(h)] = null;
    tier++;
    s.board[key(at)] = { kind, tier };
    // Bigger groups are worth more: 3 → x1, 4 → x1.5, 5 → x2, ...
    const points = Math.round((POINTS[kind][tier] * (group.length - 1)) / 2);
    s.score += points;
    if (kind === 'plant') s.bestTier = Math.max(s.bestTier, tier);
    events.push({ type: 'merge', at, from: group.filter((h) => h.q !== at.q || h.r !== at.r), kind, tier, points });
  }
}

/** Score of settling (kind, tier) at an empty hex, without changing `s`. */
function trySettle(s: GameState, at: Hex, kind: Family, tier: number): { merges: number; score: number } {
  const t: GameState = { ...s, board: { ...s.board }, score: 0 };
  const ev: GameEvent[] = [];
  settle(t, at, kind, tier, ev);
  return { merges: ev.length, score: t.score };
}

/** What a crystal becomes at `at`: the best-scoring merge, or a plain stone if nothing merges. */
export function crystalChoice(s: GameState, at: Hex): { kind: Family; tier: number } {
  let best: { kind: Family; tier: number } | null = null;
  let bestScore = -1;
  for (const kind of ['plant', 'stone'] as Family[]) {
    for (let tier = MAX_TIER[kind]; tier >= 0; tier--) {
      const r = trySettle(s, at, kind, tier);
      if (r.merges > 0 && r.score > bestScore) {
        bestScore = r.score;
        best = { kind, tier };
      }
    }
  }
  return best ?? { kind: 'stone', tier: 0 };
}

// ---------- wisps ----------

/** A wisp steps to the empty neighbor with the most empty space around it (first direction wins ties). */
export function wispPlan(s: GameState, at: Hex): Hex | null {
  let best: Hex | null = null;
  let bestRoom = -1;
  for (const d of DIRS) {
    const n = add(at, d);
    if (!onBoard(s, n) || cellAt(s, n) !== null) continue;
    const room = emptyNeighbors(s, n).length;
    if (room > bestRoom) {
      bestRoom = room;
      best = n;
    }
  }
  return best;
}

export function wispPos(s: GameState, id: number): Hex | null {
  for (const h of CELLS) {
    const c = cellAt(s, h);
    if (c?.kind === 'wisp' && c.id === id) return h;
  }
  return null;
}

function replan(s: GameState): void {
  for (const w of s.wisps) {
    const at = wispPos(s, w.id);
    w.plan = at ? wispPlan(s, at) : null;
  }
}

function wispPhase(s: GameState, events: GameEvent[]): void {
  // 1. Each wisp (oldest first) takes its planned step if it's still free,
  //    otherwise the best step from where things stand now.
  for (const w of s.wisps) {
    const from = wispPos(s, w.id);
    if (!from) continue;
    const to = w.plan && cellAt(s, w.plan) === null ? w.plan : wispPlan(s, from);
    if (!to) continue;
    s.board[key(from)] = null;
    s.board[key(to)] = { kind: 'wisp', id: w.id };
    events.push({ type: 'wispMove', id: w.id, from, to });
  }
  // 2. Wisps with nowhere to go turn to stone; the newest stone of a group merges.
  const trapped = s.wisps
    .map((w) => ({ w, at: wispPos(s, w.id)! }))
    .filter(({ at }) => emptyNeighbors(s, at).length === 0);
  for (const { w, at } of trapped) {
    s.board[key(at)] = { kind: 'stone', tier: 0 };
    events.push({ type: 'wispTrapped', id: w.id, at });
  }
  const gone = new Set(trapped.map((t) => t.w.id));
  s.wisps = s.wisps.filter((w) => !gone.has(w.id));
  for (const { at } of [...trapped].reverse()) {
    const c = cellAt(s, at);
    if (c?.kind === 'stone' && c.tier === 0) settle(s, at, 'stone', 0, events);
  }
}

// ---------- turns ----------

export function isLegal(s: GameState, a: Action): boolean {
  if (s.status !== 'playing') return false;
  if (a.type === 'swap') return true;
  if (!onBoard(s, a.at)) return false;
  // A bolt can target anything (on an empty hex it just fizzles); everything else needs an empty hex.
  return s.current.kind === 'bolt' || cellAt(s, a.at) === null;
}

export function applyAction(prev: GameState, a: Action): StepResult {
  if (!isLegal(prev, a)) throw new Error(`illegal action ${JSON.stringify(a)}`);
  const s: GameState = structuredClone(prev);
  const events: GameEvent[] = [];

  if (a.type === 'swap') {
    if (s.stash) [s.current, s.stash] = [s.stash, s.current];
    else {
      s.stash = s.current;
      s.current = drawPiece(s.seed, s.draws++);
    }
    events.push({ type: 'swap' });
    return { state: s, events };
  }

  s.turn++;
  const at = a.at;
  const piece = s.current;
  events.push({ type: 'place', at, piece });
  switch (piece.kind) {
    case 'plant':
      s.score += POINTS.plant[piece.tier];
      s.bestTier = Math.max(s.bestTier, piece.tier);
      events.push({ type: 'score', at, points: POINTS.plant[piece.tier] });
      settle(s, at, 'plant', piece.tier, events);
      break;
    case 'crystal': {
      const became = crystalChoice(s, at);
      events.push({ type: 'crystal', at, became });
      settle(s, at, became.kind, became.tier, events);
      break;
    }
    case 'wisp':
      s.board[key(at)] = { kind: 'wisp', id: s.nextWispId };
      s.wisps.push({ id: s.nextWispId++, plan: null });
      break;
    case 'bolt': {
      const hit = cellAt(s, at);
      events.push({ type: 'bolt', at, hit });
      if (hit?.kind === 'wisp') {
        s.wisps = s.wisps.filter((w) => w.id !== hit.id);
        settle(s, at, 'stone', 0, events);
      } else s.board[key(at)] = null;
      break;
    }
  }

  // A freshly placed wisp waits a turn before it starts to wander.
  const placedWisp = piece.kind === 'wisp' ? s.wisps.at(-1)!.id : -1;
  const movers = s.wisps.filter((w) => w.id !== placedWisp);
  const resting = s.wisps.filter((w) => w.id === placedWisp);
  s.wisps = movers;
  wispPhase(s, events);
  for (const w of resting) {
    const p = wispPos(s, w.id);
    if (p && emptyNeighbors(s, p).length === 0) {
      // Dropped into a dead end: stone at once.
      s.board[key(p)] = { kind: 'stone', tier: 0 };
      events.push({ type: 'wispTrapped', id: w.id, at: p });
      settle(s, p, 'stone', 0, events);
    } else s.wisps.push(w);
  }
  s.wisps.sort((x, y) => x.id - y.id);
  replan(s);

  s.current = drawPiece(s.seed, s.draws++);
  if (emptyCells(s).length === 0 && s.current.kind !== 'bolt' && s.stash?.kind !== 'bolt') {
    s.status = 'over';
    events.push({ type: 'gameOver' });
  }
  return { state: s, events };
}

/** A new game: a few scattered starting pieces that don't already merge. */
export function newGame(seed: number): GameState {
  const board: Record<string, Cell> = {};
  for (const h of CELLS) board[key(h)] = null;
  const s: GameState = {
    seed,
    turn: 0,
    score: 0,
    board,
    wisps: [],
    nextWispId: 1,
    current: { kind: 'plant', tier: 0 },
    stash: null,
    draws: 0,
    bestTier: 0,
    status: 'playing',
  };
  const rng = new Rng(mixSeed(seed, 0));
  const starters: Cell[] = [
    { kind: 'plant', tier: 0 },
    { kind: 'plant', tier: 0 },
    { kind: 'plant', tier: 0 },
    { kind: 'plant', tier: 1 },
    { kind: 'plant', tier: 1 },
    { kind: 'stone', tier: 0 },
  ];
  for (const c of starters) {
    for (let tries = 0; tries < 50; tries++) {
      const h = rng.pick(CELLS);
      if (cellAt(s, h) !== null) continue;
      s.board[key(h)] = c;
      if (c && c.kind !== 'wisp' && groupAt(s, h, c.kind, c.tier).length >= 3) {
        s.board[key(h)] = null;
        continue;
      }
      break;
    }
  }
  s.current = drawPiece(seed, s.draws++);
  return s;
}

/** The piece after the current one (shown as "next"). */
export const upcoming = (s: GameState): HandPiece => drawPiece(s.seed, s.draws);
