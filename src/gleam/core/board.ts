// Gleam board: a square grid of tiles. Lamps shine coloured beams (R/G/B bits,
// mixed additively); pieces go only on sockets; crystals swallow light and must
// glow their exact colour (a target of 0 is a dark crystal that must stay unlit).
// Pure and deterministic (no DOM, randomness or clock).

/** Directions of travel: up, right, down, left. */
export const DR = [-1, 0, 1, 0];
export const DC = [0, 1, 0, -1];

/** Tile kinds. */
export const FLOOR = 0;
export const WALL = 1;
export const SOCKET = 2;
export const LAMP = 3;
export const CRYSTAL = 4;

/** Socket contents. 0 empty, 1 mirror /, 2 mirror \, 3 splitter /, 4 splitter \, 5-7 red/green/blue filter. */
export const EMPTY = 0;
export const CODES = 8;
/** Piece types (the tray): mirror, splitter, red / green / blue filter. */
export const TYPES = ['mirror', 'splitter', 'red filter', 'green filter', 'blue filter'] as const;
export const NTYPES = TYPES.length;
/** Type of a code (-1 for empty). */
export const typeOf = (code: number): number => (code === 0 ? -1 : code <= 2 ? 0 : code <= 4 ? 1 : code - 3);
/** Codes of each type, in tap order. */
export const CODES_OF: number[][] = [[1, 2], [3, 4], [5], [6], [7]];

/** '/' turns up↔right and down↔left; '\' turns up↔left and down↔right. */
export const SLASH = [1, 0, 3, 2];
export const BACK = [3, 2, 1, 0];

export const COLOR_NAMES = ['no', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

export interface Lamp {
  cell: number;
  dir: number;
  mask: number;
}

export interface Puzzle {
  seed: number;
  size: string;
  n: number;
  /** Tile kind per cell. */
  kind: number[];
  /** Target colour per cell (crystals), -1 elsewhere; 0 = dark crystal. */
  target: number[];
  lamps: Lamp[];
  /** Socket cells, in reading order. Actions and boards index into this list. */
  sockets: number[];
  /** Pre-placed, locked code per socket, or -1. */
  given: number[];
  /** Pieces in the tray (given ones included), per type. */
  stock: number[];
  /** The one answer: a code per socket. */
  solution: number[];
}

/** What a socket-state array sends out of a cell, per piece code: [dir, maskFilter] pairs. */
export function outs(code: number, d: number, m: number, emit: (d: number, m: number) => void): void {
  switch (code) {
    case 0:
      emit(d, m);
      break;
    case 1:
      emit(SLASH[d], m);
      break;
    case 2:
      emit(BACK[d], m);
      break;
    case 3:
      emit(d, m);
      emit(SLASH[d], m);
      break;
    case 4:
      emit(d, m);
      emit(BACK[d], m);
      break;
    default:
      if (m & (1 << (code - 5))) emit(d, m & (1 << (code - 5)));
  }
}

export interface Light {
  /** Light on each half of each cell: index cell*4+side (side = direction from the centre), OR of masks. */
  half: Uint8Array;
  /** Same halves, split by flow: light leaving the centre through that side / coming in through it. */
  outw: Uint8Array;
  inw: Uint8Array;
  /** Colour that reached each crystal cell. */
  got: Uint8Array;
  /** Any light seen in a cell (OR of masks). */
  lit: Uint8Array;
  /** Beams that leave the board: cell*4+side of the cell they leave from. */
  escapes: number[];
}

/** Traces the actual light for a full board (a code per socket; -1 counts as empty). */
export function trace(p: Puzzle, board: readonly number[]): Light {
  const N = p.n * p.n;
  const at = new Int8Array(N).fill(-1);
  p.sockets.forEach((c, i) => (at[c] = Math.max(0, board[i] ?? 0)));
  const seen = new Uint8Array(N * 4);
  const half = new Uint8Array(N * 4);
  const outw = new Uint8Array(N * 4);
  const inw = new Uint8Array(N * 4);
  const got = new Uint8Array(N);
  const lit = new Uint8Array(N);
  const escapes: number[] = [];
  const stack: number[] = [];
  const n = p.n;
  const send = (c: number, d: number, m: number) => {
    half[c * 4 + d] |= m;
    outw[c * 4 + d] |= m;
    lit[c] |= m;
    const r = Math.floor(c / n) + DR[d];
    const q = (c % n) + DC[d];
    if (r < 0 || r >= n || q < 0 || q >= n) {
      escapes.push(c * 4 + d);
      return;
    }
    stack.push(r * n + q, d, m);
  };
  for (const l of p.lamps) send(l.cell, l.dir, l.mask);
  while (stack.length) {
    const m0 = stack.pop()!;
    const d = stack.pop()!;
    const c = stack.pop()!;
    const m = m0 & ~seen[c * 4 + d];
    if (!m) continue;
    seen[c * 4 + d] |= m;
    const k = p.kind[c];
    if (k === WALL || k === LAMP) continue;
    half[c * 4 + ((d + 2) & 3)] |= m;
    inw[c * 4 + ((d + 2) & 3)] |= m;
    lit[c] |= m;
    if (k === CRYSTAL) {
      got[c] |= m;
      continue;
    }
    outs(k === SOCKET ? at[c] : 0, d, m, (d2, m2) => send(c, d2, m2));
  }
  // Escaped beams were pushed once per mask arrival; keep them unique.
  return { half, outw, inw, got, lit, escapes: [...new Set(escapes)] };
}

export interface Status {
  light: Light;
  /** Crystals glowing their exact colour / all crystals with a colour. */
  done: number;
  targets: number;
  /** Crystal cells with a colour they must not have (extra light), and dark crystals that are lit. */
  wrong: number[];
  /** Placed pieces that sit in the dark. */
  unlit: number[];
  /** Pieces left in the tray, per type (negative = too many placed). */
  left: number[];
  solved: boolean;
}

export function status(p: Puzzle, board: readonly number[]): Status {
  const light = trace(p, board);
  let done = 0;
  let targets = 0;
  const wrong: number[] = [];
  p.target.forEach((t, c) => {
    if (t < 0) return;
    const g = light.got[c];
    if (t > 0) targets++;
    if (g & ~t) wrong.push(c);
    else if (t > 0 && g === t) done++;
  });
  const left = [...p.stock];
  const unlit: number[] = [];
  p.sockets.forEach((c, i) => {
    const code = board[i] ?? 0;
    if (code <= 0) return;
    left[typeOf(code)]--;
    if (!light.lit[c]) unlit.push(c);
  });
  const solved = done === targets && wrong.length === 0 && unlit.length === 0 && left.every((x) => x === 0);
  return { light, done, targets, wrong, unlit, left, solved };
}
