// Brink rules: sumo on a crumbling island.
//
// - Each side has six stones. On your turn move one stone one step to a
//   neighbouring tile.
// - Stepping into a stone shoves the whole line in front of it one step on, as
//   long as that line is at most two stones (either colour). Three can't be moved.
// - A stone shoved off the island, or into a hole, is lost. You can never step
//   off yourself.
// - From move CRUMBLE_START the island crumbles: after every move one tile
//   falls (the order is seeded and shown in advance), taking any stone on it.
// - Push TARGET enemy stones off to win.
//
// Pure and deterministic: a game is seed + moves, `replay(seed, moves)`.

import { mixSeed, Rng } from '../../shared/rng';
import { CELLS, MIRROR, N, NB, RING, cellAt, y2 } from './board';

/** Bump when old saves would replay differently. */
export const RULES_VERSION = 1;

export const EMPTY = 0;
export const LIGHT = 1;
export const DARK = 2;
export const HOLE = 3;
export type Side = 1 | 2;
export const other = (s: Side): Side => (3 - s) as Side;

/** Tunable numbers (scripts try others; the game uses these). */
export const TUNE = {
  /** Stones you must push off to win. */
  target: 3,
  /** Plies before the first tile falls. */
  crumbleStart: 6,
  /** 1: in each mirror pair, the starting side's tile falls first (balances the first move). */
  komi: 0,
  /** Rings (from the rim inward) the komi applies to: 3 = rim only, 1 = all. */
  komiRing: 1,
};

export interface State {
  seed: number;
  /** EMPTY / LIGHT / DARK / HOLE per cell. */
  cells: Int8Array;
  turn: Side;
  ply: number;
  /** Stones each side has lost, by side (index 0 unused). */
  lost: [number, number, number];
  /** Tiles in the order they fall, one after each ply from crumbleStart. */
  order: Int8Array;
  winner: 0 | Side;
  /** Who moved first (moves alternate from there). */
  first: Side;
}

/** Light starts at the bottom, dark at the top (mirror images). */
/**
 * Starting layouts for light (dark is the mirror image). The game uses the first:
 * a V of three in front, two behind, one at the back, two rows from the enemy.
 * Self-play probes compare the others (a wedge on the rim; a scrum in contact).
 */
export const SETUPS: number[][] = [
  [[-2, 2], [0, 1], [2, 0], [-1, 2], [1, 1], [0, 2]],
  [[0, 3], [-1, 3], [1, 2], [-1, 2], [1, 1], [0, 2]],
  [[0, 1], [1, 0], [-1, 1], [0, 2], [1, 1], [-1, 2]],
].map((cs) => cs.map(([q, r]) => cellAt(q, r)));
export let START_LIGHT: readonly number[] = SETUPS[0];
export let START_DARK: readonly number[] = START_LIGHT.map((c) => MIRROR[c]);
export function useSetup(k: number): void {
  START_LIGHT = SETUPS[k];
  START_DARK = START_LIGHT.map((c) => MIRROR[c]);
}

/**
 * The crumble order: the rim first, then the next ring in, and so on, each ring in
 * a seeded order of mirror pairs, so both sides lose ground evenly.
 */
export function crumbleOrder(seed: number, first: Side = LIGHT): Int8Array {
  const rng = new Rng(mixSeed(seed, 0xc4b1));
  const out: number[] = [];
  for (let ring = 3; ring >= 1; ring--) {
    // Pairs: the half of the ring on the light (lower) side, each with its mirror.
    const half = CELLS.map((_, i) => i).filter((i) => RING[i] === ring && (y2(CELLS[i]) > 0 || (y2(CELLS[i]) === 0 && CELLS[i].q < 0)));
    rng.shuffle(half);
    for (const c of half) {
      const coin = rng.next() < 0.5;
      // Komi: with `komi` set, each pair's first tile to fall is on the starting side.
      const firstSide = TUNE.komi && ring >= TUNE.komiRing ? first === LIGHT : coin;
      if (firstSide) out.push(c, MIRROR[c]);
      else out.push(MIRROR[c], c);
    }
  }
  out.push(cellAt(0, 0));
  return Int8Array.from(out);
}

export function newGame(seed: number, first: Side = LIGHT): State {
  const cells = new Int8Array(N);
  for (const c of START_LIGHT) cells[c] = LIGHT;
  for (const c of START_DARK) cells[c] = DARK;
  return { seed, cells, turn: first, ply: 0, lost: [0, 0, 0], order: crumbleOrder(seed, first), winner: 0, first };
}

export function clone(s: State): State {
  return { ...s, cells: s.cells.slice(), lost: [0, s.lost[1], s.lost[2]] };
}

// ------------------------------------------------------------------ moves

/** A move is `from * 64 + to` (neighbours): a step to an empty tile, or onto a stone (a shove). */
export const moveOf = (from: number, to: number): number => from * 64 + to;
export const moveCell = (m: number): number => m >> 6;
export const moveTo = (m: number): number => m & 63;

/** Direction from a to b along a straight line, or -1 (precomputed). */
const LINE = new Int8Array(N * N).fill(-1);
for (let i = 0; i < N; i++)
  for (let d = 0; d < 6; d++) for (let k = NB[i * 6 + d]; k >= 0; k = NB[k * 6 + d]) LINE[i * N + k] = d;
export const moveDir = (m: number): number => LINE[moveCell(m) * N + moveTo(m)];

/** Stones in the line starting at `cell` going `dir` if at most two (a shove can move them), else -1. */
export function lineCount(cells: Int8Array, cell: number, dir: number): number {
  let n = 0;
  let k = cell;
  while (k >= 0 && (cells[k] === LIGHT || cells[k] === DARK)) {
    if (++n > 2) return -1;
    k = NB[k * 6 + dir];
  }
  return n;
}

/** Pushes every legal move of the stone at i (in direction order). */
export function stoneMoves(cells: Int8Array, i: number, out: number[]): void {
  for (let d = 0; d < 6; d++) {
    const k = NB[i * 6 + d];
    if (k < 0) continue;
    if (cells[k] === EMPTY) out.push(i * 64 + k);
    else if (cells[k] !== HOLE && lineCount(cells, k, d) > 0) out.push(i * 64 + k);
  }
}

/** Legal moves for the side to move (none once the game is over). */
export function legalMoves(s: State, out: number[] = []): number[] {
  out.length = 0;
  if (s.winner) return out;
  const c = s.cells;
  for (let i = 0; i < N; i++) if (c[i] === s.turn) stoneMoves(c, i, out);
  return out;
}

export function isLegal(s: State, m: number): boolean {
  if (s.winner || !Number.isInteger(m) || m < 0) return false;
  const i = moveCell(m);
  if (i >= N || s.cells[i] !== s.turn) return false;
  const out: number[] = [];
  stoneMoves(s.cells, i, out);
  return out.includes(m);
}

/** Is the move a shove (onto a stone)? */
export const isShove = (s: State, m: number): boolean => {
  const v = s.cells[moveTo(m)];
  return v === LIGHT || v === DARK;
};

/** Which tile falls after the ply numbered `ply` (0-based), or -1. */
export function crumbleAfter(s: State, ply: number): number {
  const k = ply - TUNE.crumbleStart;
  return k >= 0 && k < s.order.length ? s.order[k] : -1;
}

/** Plies from now until tile `cell` falls (1 = right after this move), or Infinity. */
export function fallsIn(s: State, cell: number): number {
  const k = s.order.indexOf(cell);
  if (k < 0) return Infinity;
  const ply = k + TUNE.crumbleStart;
  return ply < s.ply ? Infinity : ply - s.ply + 1;
}

export interface MoveEvents {
  /** Stones that slid: [from, to] (to = -1: over the edge or into a hole). */
  slid: [number, number][];
  /** A stone that went over: the side that lost it, and the cell it left. */
  shovedOff: { side: Side; from: number; intoHole: boolean } | null;
  /** The tile that crumbled after the move, and the stone (side) it took. */
  crumbled: number;
  crumbleTook: 0 | Side;
}

/**
 * Plays a legal move in place (no checks) and returns what happened. One stone at
 * most goes over per shove, one per crumble, so a win is never simultaneous.
 */
export function play(s: State, m: number): MoveEvents {
  const c = s.cells;
  const from = moveCell(m);
  const to0 = moveTo(m);
  const dir = moveDir(m);
  const ev: MoveEvents = { slid: [], shovedOff: null, crumbled: -1, crumbleTook: 0 };
  // Walk to the end of the shoved line, then shift from the far end back; the
  // mover ends where the first shoved stone stood.
  const line: number[] = [from];
  let k = to0;
  while (k >= 0 && (c[k] === LIGHT || c[k] === DARK)) {
    line.push(k);
    k = NB[k * 6 + dir];
  }
  const end = k >= 0 && c[k] === EMPTY ? k : -1;
  if (line.length === 1) {
    // A plain step.
    c[to0] = c[from];
    c[from] = EMPTY;
    ev.slid.push([from, to0]);
  } else for (let j = line.length - 1; j >= 0; j--) {
    const at = line[j];
    const to = j === line.length - 1 ? end : line[j + 1];
    const who = c[at] as Side;
    ev.slid.push([at, to]);
    if (to < 0) {
      s.lost[who]++;
      ev.shovedOff = { side: who, from: at, intoHole: NB[at * 6 + dir] >= 0 };
    } else c[to] = who;
    c[at] = EMPTY;
  }
  const mover = s.turn;
  s.ply++;
  s.turn = other(mover);
  if (s.lost[other(mover)] >= TUNE.target) s.winner = mover;
  else if (s.lost[mover] >= TUNE.target) s.winner = other(mover);
  if (s.winner) return ev;
  const t = crumbleAfter(s, s.ply - 1);
  if (t >= 0) {
    ev.crumbled = t;
    if (c[t] === LIGHT || c[t] === DARK) {
      const who = c[t] as Side;
      ev.crumbleTook = who;
      s.lost[who]++;
      if (s.lost[who] >= TUNE.target) s.winner = other(who);
    }
    c[t] = HOLE;
  }
  // A side with no move passes (rare: every stone hemmed in by holes and triples).
  if (!s.winner && !hasMove(s)) {
    s.turn = other(s.turn);
    if (!hasMove(s)) s.winner = s.lost[LIGHT] < s.lost[DARK] ? LIGHT : s.lost[DARK] < s.lost[LIGHT] ? DARK : other(mover);
  }
  return ev;
}

function hasMove(s: State): boolean {
  const out: number[] = [];
  for (let i = 0; i < N && !out.length; i++) if (s.cells[i] === s.turn) stoneMoves(s.cells, i, out);
  return out.length > 0;
}

/** A copy with the move played. */
export function after(s: State, m: number): State {
  const t = clone(s);
  play(t, m);
  return t;
}

// ------------------------------------------------------------------ records

export const encodeMove = (m: number): string => `${moveCell(m)}.${moveTo(m)}`;
export function decodeMove(t: string): number {
  const [a, b] = t.split('.').map(Number);
  return Number.isInteger(a) && Number.isInteger(b) && a >= 0 && a < N && b >= 0 && b < N ? a * 64 + b : -1;
}

/** Rebuilds a game from its seed and moves; stops at the first illegal move. */
export function replay(seed: number, moves: readonly (number | string)[], first: Side = LIGHT): State {
  const s = newGame(seed, first);
  for (const x of moves) {
    const m = typeof x === 'string' ? decodeMove(x) : x;
    if (!isLegal(s, m)) break;
    play(s, m);
  }
  return s;
}

/** Stones on the island for a side. */
export function count(s: State, side: Side): number {
  let n = 0;
  for (let i = 0; i < N; i++) if (s.cells[i] === side) n++;
  return n;
}

/** Compact text for tests and tools: `.` empty, `L`/`D` stones, `#` hole, in cell order. */
export const boardText = (s: State): string => Array.from(s.cells, (v) => '.LD#'[v]).join('');

/** ASCII picture of the island (columns are q, rows are half-row steps). */
export function picture(s: State): string {
  const lines: string[] = [];
  for (let yy = -6; yy <= 6; yy++) {
    let row = '';
    for (let q = -3; q <= 3; q++) {
      if ((yy - q) % 2 !== 0) {
        row += '   ';
        continue;
      }
      const c = cellAt(q, (yy - q) / 2);
      row += c < 0 ? '   ' : ` ${'.LD#'[s.cells[c]]} `;
    }
    lines.push(row.replace(/\s+$/, ''));
  }
  return lines.join('\n');
}
