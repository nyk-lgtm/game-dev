// Playing a puzzle: boards (a code per socket), actions and replays, the tap
// cycle, and hints that replay the deduction model's next step.

import { CODES_OF, COLOR_NAMES, NTYPES, TYPES, typeOf, type Puzzle } from './board';
import { Ctx, bit, codeOf, deduce, single, type Reason } from './solve';
import { SIZES, type Size } from './gen';

/** The starting board: givens in place, everything else empty. */
export const blankBoard = (p: Puzzle): number[] => p.given.map((g) => Math.max(0, g));

/** Pieces of each type not on the board. */
export function piecesLeft(p: Puzzle, board: readonly number[]): number[] {
  const left = [...p.stock];
  for (const code of board) if (code > 0) left[typeOf(code)]--;
  return left;
}

/** What a tap on a socket turns it into: the next orientation, then the next type with pieces left, then empty. */
export function cycleCode(p: Puzzle, board: readonly number[], i: number): number {
  const cur = board[i];
  const left = piecesLeft(p, board);
  if (cur > 0) left[typeOf(cur)]++;
  const opts = [0];
  for (let t = 0; t < NTYPES; t++) if (left[t] > 0) opts.push(...CODES_OF[t]);
  const k = opts.indexOf(cur);
  return opts[(k + 1) % opts.length];
}

// ---------------------------------------------------------------- actions
// A run is a string of tokens: `<socket base 36><code>` sets a socket, `H<socket><code>`
// sets it from a hint, `M<socket><socket>` swaps two sockets (a drag), `U` undoes the last
// change, `R` clears every placed piece.

export const setToken = (i: number, code: number, hint = false): string => `${hint ? 'H' : ''}${i.toString(36)}${code}`;

export interface Replayed {
  board: number[];
  hints: number;
  /** Boards before each change still on the undo stack. */
  undo: number[][];
}

/** Rebuilds a board from actions; bad or illegal tokens are skipped. */
export function replay(p: Puzzle, a: string): Replayed {
  let board = blankBoard(p);
  const undo: number[][] = [];
  let hints = 0;
  for (let k = 0; k < a.length; ) {
    const ch = a[k];
    if (ch === 'U') {
      k++;
      if (undo.length) board = undo.pop()!;
      continue;
    }
    if (ch === 'R') {
      k++;
      undo.push(board);
      board = blankBoard(p);
      continue;
    }
    if (ch === 'M') {
      // Move (swap) the pieces on two sockets.
      const i = parseInt(a[k + 1], 36);
      const j = parseInt(a[k + 2], 36);
      k += 3;
      const ok = (x: number) => x >= 0 && x < p.sockets.length && p.given[x] < 0;
      if (!ok(i) || !ok(j) || i === j || board[i] === board[j]) continue;
      undo.push(board);
      board = [...board];
      [board[i], board[j]] = [board[j], board[i]];
      continue;
    }
    const hint = ch === 'H';
    if (hint) k++;
    const i = parseInt(a[k], 36);
    const code = Number(a[k + 1]);
    k += 2;
    if (!(i >= 0 && i < p.sockets.length) || !(code >= 0 && code < 8) || p.given[i] >= 0) continue;
    const next = setCode(p, board, i, code);
    if (!next) continue;
    undo.push(board);
    board = next;
    if (hint) hints++;
  }
  return { board, hints, undo };
}

/** The board with socket i set to code, or null if that breaks the tray (or changes nothing). */
export function setCode(p: Puzzle, board: readonly number[], i: number, code: number): number[] | null {
  if (p.given[i] >= 0 || board[i] === code) return null;
  if (code > 0) {
    const left = piecesLeft(p, board);
    if (board[i] > 0) left[typeOf(board[i])]++;
    if (left[typeOf(code)] <= 0) return null;
  }
  const next = [...board];
  next[i] = code;
  return next;
}

// ---------------------------------------------------------------- hints

export const PIECE_NAMES = ['nothing', '⟋ mirror', '⟍ mirror', '⟋ splitter', '⟍ splitter', 'red filter', 'green filter', 'blue filter'];

const colour = (m: number) => COLOR_NAMES[m];

/** One reason in plain words. */
export function reasonText(p: Puzzle, r: Reason): string {
  switch (r.k) {
    case 'dark':
      return 'light would touch a dark crystal';
    case 'wrong':
      return `${colour(r.mask)} light would reach the ${colour(p.target[r.cell])} crystal`;
    case 'unreach':
      return `the ${colour(p.target[r.cell])} crystal could no longer get its ${colour(r.mask)}`;
    case 'unlit':
      return 'a piece would be left in the dark';
    case 'over':
      return r.t >= 0 ? `there ${p.stock[r.t] === 1 ? 'is' : 'are'} only ${p.stock[r.t]} ${TYPES[r.t]}${p.stock[r.t] === 1 ? '' : 's'}` : 'the tray would run out';
    case 'short':
      return 'not every piece could still find a lit ring';
    case 'deep':
      return `a step later, ${reasonText(p, r.inner)}`;
  }
}

/** Cells a reason points at (to highlight). */
export function reasonCells(r: Reason): number[] {
  if (r.k === 'deep') return reasonCells(r.inner);
  return 'cell' in r ? [r.cell] : [];
}

export type Hint =
  | { kind: 'done' }
  | { kind: 'wrong'; socket: number }
  | { kind: 'place'; socket: number; code: number; depth: number; text: string; cells: number[] };

/** The next step: a placed piece that isn't in the answer, else the first piece the deduction model
 *  pins down from the pieces already right (with why the socket can't stay empty). */
export function nextHint(p: Puzzle, board: readonly number[]): Hint {
  const wrong = board.findIndex((c, i) => c > 0 && c !== p.solution[i] && p.given[i] < 0);
  if (wrong >= 0) return { kind: 'wrong', socket: wrong };
  if (board.every((c, i) => c === p.solution[i])) return { kind: 'done' };
  const ctx = new Ctx(p);
  const dom0 = ctx.initial();
  board.forEach((c, i) => c > 0 && (dom0[i] = bit(c)));
  const d = deduce(p, Math.max(2, SIZES[p.size as Size]?.maxDepth ?? 2), dom0, ctx);
  const dom = dom0.slice();
  const depth = new Array(board.length).fill(0);
  for (const e of d.log) {
    dom[e.socket] &= ~bit(e.code);
    // The check also drops piece types that are used up (unlogged); do the same here.
    ctx.check(dom);
    depth[e.socket] = Math.max(depth[e.socket], e.depth);
    const i = dom.findIndex((x, k) => board[k] === 0 && p.given[k] < 0 && single(x) && codeOf(x) > 0);
    if (i >= 0) {
      const code = codeOf(dom[i]);
      const mine = d.log.filter((x) => x.socket === i);
      const empty = mine.find((x) => x.code === 0);
      const other = mine.find((x) => x.code > 0 && typeOf(x.code) === typeOf(code));
      const parts: string[] = [];
      if (empty) parts.push(`Left empty, ${reasonText(p, empty.why)}.`);
      if (other) parts.push(`${code <= 4 ? 'Turned the other way' : `As a ${PIECE_NAMES[other.code]}`}, ${reasonText(p, other.why)}.`);
      const cells = [...new Set([empty, other].flatMap((x) => (x ? reasonCells(x.why) : [])))];
      return { kind: 'place', socket: i, code, depth: depth[i], text: `This ring takes a <b>${PIECE_NAMES[code]}</b>. ${parts.join(' ')}`, cells };
    }
  }
  // The model is stuck (it shouldn't be): show one piece of the answer.
  const i = p.solution.findIndex((c, k) => c > 0 && board[k] !== c);
  return { kind: 'place', socket: i, code: p.solution[i], depth: 3, text: `This ring takes a <b>${PIECE_NAMES[p.solution[i]]}</b>.`, cells: [] };
}
