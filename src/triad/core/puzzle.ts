// Triad: a hex logic puzzle. Every cell holds one of three elements; fire burns
// leaf, leaf drinks water, water douses fire. A number on a cell says how many
// of its neighbors it beats. Puzzles are generated from a seed and are always
// solvable by single-clue deductions (no guessing), which also drives hints.
// Pure and deterministic: no DOM, no Math.random, no Date.

import { DIRS, key, type Hex } from '../../shared/hex';
import { Rng, mixSeed } from '../../shared/rng';

export const RULES_VERSION = 1;

export const FIRE = 0;
export const WATER = 1;
export const LEAF = 2;
export type Element = 0 | 1 | 2;
export const ELEMENT_NAMES = ['Fire', 'Water', 'Leaf'] as const;
/** What each element beats: fire→leaf, water→fire, leaf→water. */
export const prey = (e: number): Element => ((e + 2) % 3) as Element;
/** What beats each element. */
export const predator = (e: number): Element => ((e + 1) % 3) as Element;

export const ALL = 0b111;
export const bit = (e: number) => 1 << e;
export const single = (d: number): number => (d === 1 ? 0 : d === 2 ? 1 : d === 4 ? 2 : -1);

export interface Board {
  radius: number;
  cells: Hex[];
  adj: number[][];
}

const boards = new Map<number, Board>();
/** A hexagon of hexes, `radius` rings around the center, cells in reading order. */
export function makeBoard(radius: number): Board {
  const hit = boards.get(radius);
  if (hit) return hit;
  const cells: Hex[] = [];
  for (let r = -radius; r <= radius; r++)
    for (let q = -radius; q <= radius; q++) if (Math.abs(q + r) <= radius) cells.push({ q, r });
  const index = new Map(cells.map((h, i) => [key(h), i]));
  const adj = cells.map((h) => DIRS.map((d) => index.get(key({ q: h.q + d.q, r: h.r + d.r })) ?? -1).filter((j) => j >= 0));
  const b = { radius, cells, adj };
  boards.set(radius, b);
  return b;
}

export interface Puzzle {
  seed: number;
  radius: number;
  /** The unique answer. */
  solution: Element[];
  /** Pre-filled cells (-1 = blank). */
  given: number[];
  /** Clue numbers (-1 = none). */
  clue: number[];
}

/** How many of cell i's neighbors it beats, in a full assignment. */
export function beatsCount(b: Board, vals: ArrayLike<number>, i: number): number {
  const p = prey(vals[i]);
  let n = 0;
  for (const j of b.adj[i]) if (vals[j] === p) n++;
  return n;
}

export interface Step {
  /** The clue cell that forces this. */
  clue: number;
  /** The cell whose options shrank. */
  cell: number;
  /** Options left for it (bitmask). */
  left: number;
}

/**
 * What one clue alone allows: for the clue cell and each neighbor, the values
 * that appear in some assignment matching the clue. Exact for a single clue.
 */
export function clueSupport(b: Board, clue: number[], dom: number[], c: number): Map<number, number> {
  const n = clue[c];
  const out = new Map<number, number>([[c, 0]]);
  for (const j of b.adj[c]) out.set(j, 0);
  for (let s = 0; s < 3; s++) {
    if (!(dom[c] & bit(s))) continue;
    const p = bit(prey(s));
    let must = 0;
    let may = 0;
    for (const j of b.adj[c]) {
      if (dom[j] & p) may++;
      if (dom[j] === p) must++;
    }
    if (n < must || n > may) continue;
    out.set(c, out.get(c)! | bit(s));
    for (const j of b.adj[c]) {
      const d = dom[j];
      let sup = out.get(j)!;
      const canP = (d & p) !== 0;
      const other = d & ~p;
      if (canP && other) {
        // Undecided: it can be the prey if the count still has room, or not if the rest can make up n.
        if (n > must) sup |= p;
        if (n < may) sup |= other;
      } else sup |= d;
      out.set(j, sup);
    }
  }
  return out;
}

/**
 * Applies single-clue deductions until nothing changes. Mutates `dom`.
 * Returns false on a contradiction. `steps` collects every narrowing in order.
 */
export function propagate(b: Board, clue: number[], dom: number[], steps?: Step[]): boolean {
  const clues = clue.map((n, i) => (n >= 0 ? i : -1)).filter((i) => i >= 0);
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of clues) {
      for (const [j, sup] of clueSupport(b, clue, dom, c)) {
        const nd = dom[j] & sup;
        if (nd === dom[j]) continue;
        if (nd === 0) return false;
        dom[j] = nd;
        changed = true;
        steps?.push({ clue: c, cell: j, left: nd });
      }
    }
  }
  return true;
}

export const initialDomains = (p: { given: number[] }): number[] => p.given.map((g) => (g >= 0 ? bit(g) : ALL));

/** Solvable by deductions alone (and therefore unique)? */
export function deducible(b: Board, clue: number[], given: number[]): boolean {
  const dom = initialDomains({ given });
  return propagate(b, clue, dom) && dom.every((d) => single(d) >= 0);
}

export type Size = 'small' | 'medium' | 'large';
export const SIZES: Record<Size, { radius: number; name: string }> = {
  small: { radius: 2, name: 'Small' },
  medium: { radius: 3, name: 'Medium' },
  large: { radius: 4, name: 'Large' },
};

/** A puzzle for (seed, radius): random answer, then strip clues while it stays deducible. */
export function generate(seed: number, radius: number): Puzzle {
  const b = makeBoard(radius);
  const N = b.cells.length;
  const rng = new Rng(mixSeed(seed, 4000 + radius));
  for (let attempt = 0; attempt < 50; attempt++) {
    const solution = b.cells.map(() => rng.int(0, 2) as Element);
    // All three elements must appear, or the board is dull.
    if (new Set(solution).size < 3) continue;
    const clue = solution.map((_, i) => beatsCount(b, solution, i));
    const given = new Array(N).fill(-1);
    // Rotating every element (fire→water→leaf→fire) keeps every count, so at
    // least one cell must be given; add givens until the clues pin the rest.
    const order = rng.shuffle([...Array(N).keys()]);
    for (const i of order) {
      given[i] = solution[i];
      if (deducible(b, clue, given)) break;
    }
    if (!deducible(b, clue, given)) continue;
    // Strip clues, then spare givens, while deductions still finish the board.
    for (const i of rng.shuffle([...Array(N).keys()])) {
      const keep = clue[i];
      clue[i] = -1;
      if (!deducible(b, clue, given)) clue[i] = keep;
    }
    for (const i of rng.shuffle([...Array(N).keys()])) {
      if (given[i] < 0 || given.filter((g) => g >= 0).length <= 1) continue;
      const keep = given[i];
      given[i] = -1;
      if (!deducible(b, clue, given)) given[i] = keep;
    }
    return { seed, radius, solution, given, clue };
  }
  throw new Error(`triad: no puzzle for seed ${seed}`);
}

/** Rounds of deduction needed (a rough difficulty). */
export function depth(p: Puzzle): number {
  const b = makeBoard(p.radius);
  const dom = initialDomains(p);
  let rounds = 0;
  const clues = p.clue.map((n, i) => (n >= 0 ? i : -1)).filter((i) => i >= 0);
  for (let changed = true; changed; rounds++) {
    changed = false;
    const snap = dom.slice();
    for (const c of clues)
      for (const [j, sup] of clueSupport(b, p.clue, snap, c)) {
        const nd = dom[j] & sup;
        if (nd !== dom[j]) {
          dom[j] = nd;
          changed = true;
        }
      }
  }
  return rounds - 1;
}
