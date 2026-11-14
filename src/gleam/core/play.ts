// Playing a puzzle: boards (a code per socket), actions and replays, the tap
// cycle, and hints that replay the deduction model's next step.

import { CODES_OF, COLOR_NAMES, TYPES, typeOf, type Puzzle } from './board';
import { Ctx, bit, codeOf, deduce, single, type Elim, type Reason } from './solve';
import { SIZES, type Size } from './gen';

/** The starting board: givens in place, everything else empty. */
export const blankBoard = (p: Puzzle): number[] => p.given.map((g) => Math.max(0, g));

/** Pieces of each type not on the board. */
export function piecesLeft(p: Puzzle, board: readonly number[]): number[] {
  const left = [...p.stock];
  for (const code of board) if (code > 0) left[typeOf(code)]--;
  return left;
}

/** What a tap on a ring turns it into. With a tray piece armed: that piece, then only turned
 *  (/ ↔ \). With none: an empty ring takes the first piece type left in the tray; a piece turns
 *  once (/ → \) and then comes off. Unchanged when the tray can't supply it. */
export function cycleCode(p: Puzzle, board: readonly number[], i: number, armed = -1): number {
  const cur = board[i];
  const left = piecesLeft(p, board);
  if (cur > 0) left[typeOf(cur)]++;
  if (armed >= 0) {
    if (cur > 0 && typeOf(cur) === armed) {
      const cs = CODES_OF[armed];
      return cs[(cs.indexOf(cur) + 1) % cs.length];
    }
    return left[armed] > 0 ? CODES_OF[armed][0] : cur;
  }
  if (cur === 0) {
    const t = left.findIndex((k) => k > 0);
    return t < 0 ? 0 : CODES_OF[t][0];
  }
  const cs = CODES_OF[typeOf(cur)];
  return cs.indexOf(cur) < cs.length - 1 ? cs[cs.indexOf(cur) + 1] : 0;
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

const PRIMARY = ['red', 'green', 'blue'];
/** The primary colours in a mask: ['red', 'blue']. */
const parts = (m: number) => PRIMARY.filter((_, b) => m & (1 << b));
const and = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const crystal = (p: Puzzle, c: number) => `the ${COLOR_NAMES[p.target[c]]} crystal`;
const plural = (k: number, w: string) => `${k} ${w}${k === 1 ? '' : 's'}`;

/** "red light", or "the white lamp's red light" when only a white lamp gives that colour. */
function light(p: Puzzle, m: number): string {
  const fromWhite = [1, 2, 4].every((b) => !(m & b) || p.lamps.every((l) => !(l.mask & b) || l.mask === 7));
  return `${fromWhite && p.lamps.some((l) => l.mask === 7) ? "the white lamp's " : ''}${and(parts(m))} light`;
}

/** One broken rule in plain cause → effect words. `board` names pieces the reason points at. */
export function reasonText(p: Puzzle, r: Reason, board: readonly number[] = p.given): string {
  switch (r.k) {
    case 'dark':
      return `${light(p, r.mask)} would hit a dark crystal`;
    case 'wrong': {
      const t = p.target[r.cell];
      return `${light(p, r.mask)} would reach ${crystal(p, r.cell)}${parts(t).length > 1 ? ` (${parts(t).join(' + ')} only)` : ''}`;
    }
    case 'unreach': {
      const miss = parts(r.mask);
      const who = miss.length === 3 ? 'light' : light(p, r.mask).replace(' and ', ' or ');
      return `${who} could no longer reach ${crystal(p, r.cell)}`;
    }
    case 'unlit': {
      const i = p.sockets.indexOf(r.cell);
      const code = i >= 0 ? (p.given[i] >= 0 ? p.given[i] : board[i]) : 0;
      if (i >= 0 && p.given[i] >= 0) return `the fixed ${PIECE_NAMES[code]} would sit in the dark`;
      if (code > 0) return `your ${PIECE_NAMES[code]} would sit in the dark`;
      return 'the circled ring would need a piece but get no light';
    }
    case 'over':
      return `the tray has only ${plural(p.stock[r.t], TYPES[r.t])}`;
    case 'short':
      return r.t >= 0
        ? `a ${TYPES[r.t]} would be left over, with no free ring in the light`
        : 'pieces would be left over, with too few free rings in the light';
    case 'deep':
      return `a step later, ${reasonText(p, r.inner, board)}`;
  }
}

/** Cells a reason points at (to highlight). */
export function reasonCells(r: Reason): number[] {
  if (r.k === 'deep') return reasonCells(r.inner);
  return 'cell' in r ? [r.cell] : [];
}

/** Longest hint (plain characters) that fits the page's 4-line message box at 360 px. */
export const HINT_MAX = 205;
const plain = (t: string) => t.replace(/<[^>]+>/g, '');
const or = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs.at(-1)}`);

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
      const flip = mine.find((x) => x.code > 0 && x.code !== code && typeOf(x.code) === typeOf(code));
      // Why not the other kind of piece: a splitter's own mirror, a mirror's splitter, else any other type.
      const prefer = code <= 2 ? [code + 2] : code <= 4 ? [code - 2] : [];
      const alt =
        mine.find((x) => prefer.includes(x.code)) ?? mine.find((x) => x.code > 0 && typeOf(x.code) !== typeOf(code));
      const clauses: [string, Elim | undefined][] = [
        ['left empty', empty],
        [alt ? `as a ${TYPES[typeOf(alt.code)]}` : '', alt],
        ['flipped', flip],
      ];
      // Same reason, one sentence; stop before the text outgrows the 4-line message box.
      const groups: { labels: string[]; text: string; e: Elim }[] = [];
      for (const [label, e] of clauses) {
        if (!e) continue;
        const t = reasonText(p, e.why, board);
        const g = groups.find((x) => x.text === t);
        if (g) g.labels.push(label);
        else groups.push({ labels: [label], text: t, e });
      }
      const head = `A <b>${PIECE_NAMES[code]}</b> goes here.`;
      const why: string[] = [];
      const used: Elim[] = [];
      for (const g of groups) {
        const line = `${or(g.labels).replace(/^./, (ch) => ch.toUpperCase())}, ${g.text}.`;
        if (why.length && plain([head, ...why, line].join(' ')).length > HINT_MAX) continue;
        why.push(line);
        used.push(g.e);
      }
      const cells = [...new Set(used.flatMap((x) => reasonCells(x.why)))];
      return { kind: 'place', socket: i, code, depth: depth[i], text: `${head} ${why.join(' ')}`, cells };
    }
  }
  // The model is stuck (it shouldn't be): show one piece of the answer.
  const i = p.solution.findIndex((c, k) => c > 0 && board[k] !== c);
  return { kind: 'place', socket: i, code: p.solution[i], depth: 3, text: `A <b>${PIECE_NAMES[p.solution[i]]}</b> goes here.`, cells: [] };
}
