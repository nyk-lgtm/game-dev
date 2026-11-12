// The quarry face: a 6×7 grid of flat-topped hexes in columns, odd columns
// half a hex lower ("odd-q"). Cell i = row·W + col, row 0 at the top. Tiles fall
// straight down their column; new ones come from the seeded letter bag.

export const W = 6;
export const H = 7;
export const N = W * H;

export const col = (i: number) => i % W;
export const row = (i: number) => Math.floor(i / W);
export const at = (c: number, r: number) => r * W + c;

/** The six neighbors of every cell. */
export const NEIGHBORS: readonly number[][] = Array.from({ length: N }, (_, i) => {
  const c = col(i);
  const r = row(i);
  const odd = c % 2 === 1;
  const cand: [number, number][] = [
    [c, r - 1],
    [c, r + 1],
    [c - 1, odd ? r : r - 1],
    [c - 1, odd ? r + 1 : r],
    [c + 1, odd ? r : r - 1],
    [c + 1, odd ? r + 1 : r],
  ];
  return cand.filter(([x, y]) => x >= 0 && x < W && y >= 0 && y < H).map(([x, y]) => at(x, y));
});

export const adjacent = (a: number, b: number) => NEIGHBORS[a].includes(b);

export interface Tile {
  /** Unique within a run, so the UI can follow a tile as it falls. */
  id: number;
  /** 'a'-'z' ('q' is the Qu tile), '*' a blank, '' a rock. */
  ch: string;
  /** Doubles the word (stacks: two gold tiles triple it). */
  gold?: boolean;
  /** Words left before this tile blows. */
  fuse?: number;
  /** Rock hit points (1, or 2 for granite). */
  rock?: number;
}

export const isRock = (t: Tile) => !!t.rock;

/** Letter values, by rarity. */
export const VALUES: Record<string, number> = {
  a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 3, h: 3, i: 1, j: 8, k: 5, l: 2, m: 3,
  n: 1, o: 1, p: 3, q: 8, r: 1, s: 1, t: 1, u: 2, v: 5, w: 4, x: 8, y: 4, z: 9, '*': 0,
};

/** How often each letter comes out of the bag (per mille-ish). */
export const WEIGHTS: Record<string, number> = {
  e: 110, a: 85, i: 75, o: 70, u: 33,
  t: 68, n: 64, r: 64, s: 52, l: 50, d: 40, c: 36, h: 30, m: 30, p: 30,
  g: 26, b: 21, f: 19, y: 19, w: 15, k: 12, v: 12, x: 5, z: 5, j: 4, q: 5,
};
export const VOWELS = 'aeiou';
const isVowel = (ch: string) => VOWELS.includes(ch);
const RARE = 'jqxz';
const LETTERS = Object.keys(WEIGHTS);
const VOWEL_LIST = LETTERS.filter(isVowel);
const CONSONANTS = LETTERS.filter((c) => !isVowel(c));

/** What a tile spells ('qu' for the Qu tile). */
export const spell = (t: Tile) => (t.ch === 'q' ? 'qu' : t.ch);
/** How a tile is printed. */
export const face = (t: Tile) => (t.ch === 'q' ? 'Qu' : t.ch === '*' ? '?' : t.ch.toUpperCase());

function weighted(xs: string[], roll: number): string {
  let total = 0;
  for (const x of xs) total += WEIGHTS[x];
  let k = roll * total;
  for (const x of xs) {
    k -= WEIGHTS[x];
    if (k < 0) return x;
  }
  return xs[xs.length - 1];
}

/**
 * Picks a letter that keeps the face playable: about 35-50% vowels, no more
 * than one of each of J, Q, X, Z, at most three of any letter (two of S).
 */
export function pickLetter(board: (Tile | null)[], rolls: () => number): string {
  const count: Record<string, number> = {};
  let letters = 0;
  let vowels = 0;
  for (const t of board) {
    if (!t || t.rock || t.ch === '*') continue;
    letters++;
    count[t.ch] = (count[t.ch] ?? 0) + 1;
    if (isVowel(t.ch)) vowels++;
  }
  const share = letters ? vowels / (letters + 1) : 0.4;
  let pool = share < 0.34 ? VOWEL_LIST : share > 0.48 ? CONSONANTS : LETTERS;
  const full = (ch: string) => (count[ch] ?? 0) >= (RARE.includes(ch) ? 1 : ch === 's' ? 2 : 3);
  const open = pool.filter((ch) => !full(ch));
  if (open.length) pool = open;
  return weighted(pool, rolls());
}

/**
 * Drops the remaining tiles of each column to the bottom and fills the gaps
 * above, column by column from the left, lowest gap first.
 */
export function settle(board: (Tile | null)[], fresh: (board: (Tile | null)[], col: number) => Tile): Tile[] {
  for (let c = 0; c < W; c++) {
    const stack: Tile[] = [];
    for (let r = H - 1; r >= 0; r--) {
      const t = board[at(c, r)];
      if (t) stack.push(t);
    }
    for (let r = H - 1, k = 0; r >= 0; r--, k++) board[at(c, r)] = k < stack.length ? stack[k] : null;
    for (let r = H - 1 - stack.length; r >= 0; r--) board[at(c, r)] = fresh(board, c);
  }
  return board as Tile[];
}
