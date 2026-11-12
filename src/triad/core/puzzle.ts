// Triad: a hex logic puzzle. Every cell holds one of three elements; fire burns
// leaf, leaf drinks water, water douses fire. A number on a cell says how many
// of its neighbors it beats. In links mode, a mark on the edge between two
// neighbors also says they hold the same element. Puzzles are generated from a
// seed and are always solvable by single-clue deductions (no guessing), which
// also drives hints.
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
  /** Every pair of neighbors once, [lower, higher] cell index, in reading order. */
  edges: [number, number][];
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
  const edges: [number, number][] = [];
  adj.forEach((ns, i) => ns.forEach((j) => j > i && edges.push([i, j])));
  const b = { radius, cells, adj, edges };
  boards.set(radius, b);
  return b;
}

export interface Puzzle {
  seed: number;
  radius: number;
  level?: Level;
  /** The unique answer. */
  solution: Element[];
  /** Pre-filled cells (-1 = blank). */
  given: number[];
  /**
   * Clue numbers per cell (-1 = none). In links mode, followed by one entry per
   * board edge (`b.edges`, id = cells + edge index): -1 or SAME.
   */
  clue: number[];
  /** Links mode (absent: numbers only). */
  links?: true;
}

export type ClueMode = 'numbers' | 'links';
export const CLUE_MODES: Record<ClueMode, { name: string; text: string }> = {
  numbers: { name: 'Numbers', text: 'Numbers only.' },
  links: { name: 'Numbers + links', text: 'Some edges carry a link: the two hexes it joins hold the same element.' },
};

/** A link mark: the two hexes on either side hold the same element. */
export const SAME = 0;

/** Clue ids at or past the cell count are links (edge = id - cells). */
export const isLink = (b: Board, id: number): boolean => id >= b.cells.length;
export const linkCells = (b: Board, id: number): [number, number] => b.edges[id - b.cells.length];
/** The link ids touching cell i. */
export function linksAt(b: Board, clue: number[], i: number): number[] {
  const out: number[] = [];
  for (let id = b.cells.length; id < clue.length; id++) if (clue[id] >= 0 && linkCells(b, id).includes(i)) out.push(id);
  return out;
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
  if (isLink(b, c)) {
    // SAME: each side keeps only what the other side can still be.
    const [x, y] = linkCells(b, c);
    const both = dom[x] & dom[y];
    return new Map([
      [x, both],
      [y, both],
    ]);
  }
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
export function propagate(b: Board, clue: number[], dom: number[], steps?: Step[], fail?: { clue: number }): boolean {
  // Nothing to report: a work queue reaches the same fixpoint much faster.
  if (!steps && !fail) return settle(b, clue, dom, watchers(b, clue));
  const clues = clue.map((n, i) => (n >= 0 ? i : -1)).filter((i) => i >= 0);
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of clues) {
      for (const [j, sup] of clueSupport(b, clue, dom, c)) {
        const nd = dom[j] & sup;
        if (nd === dom[j]) continue;
        if (nd === 0) {
          if (fail) fail.clue = c;
          return false;
        }
        dom[j] = nd;
        changed = true;
        steps?.push({ clue: c, cell: j, left: nd });
      }
    }
  }
  return true;
}

/** The cells a clue reads: a number's hex and its neighbors, or a link's two hexes. */
export const clueCells = (b: Board, c: number): number[] => (isLink(b, c) ? linkCells(b, c) : [c, ...b.adj[c]]);

/** For each cell, the clues that read it. */
function watchers(b: Board, clue: number[]): number[][] {
  const w: number[][] = b.cells.map(() => []);
  for (let c = 0; c < clue.length; c++) if (clue[c] >= 0) for (const j of clueCells(b, c)) w[j].push(c);
  return w;
}

/**
 * Work-queue propagation: re-reads only clues whose cells changed. Without
 * `from` it reads every clue; with it, `dom` must already be settled except
 * for those cells. Same fixpoint (and same contradictions) as the sweep.
 */
function settle(b: Board, clue: number[], dom: number[], watch: number[][], from?: number[]): boolean {
  const queued = new Uint8Array(clue.length);
  const queue: number[] = [];
  const push = (c: number) => {
    if (!queued[c]) {
      queued[c] = 1;
      queue.push(c);
    }
  };
  if (from) for (const j of from) watch[j].forEach(push);
  else for (let c = 0; c < clue.length; c++) if (clue[c] >= 0) push(c);
  while (queue.length) {
    const c = queue.pop()!;
    queued[c] = 0;
    for (const [j, sup] of clueSupport(b, clue, dom, c)) {
      const nd = dom[j] & sup;
      if (nd === dom[j]) continue;
      if (nd === 0) return false;
      dom[j] = nd;
      watch[j].forEach(push);
    }
  }
  return true;
}

export const initialDomains = (p: { given: number[] }): number[] => p.given.map((g) => (g >= 0 ? bit(g) : ALL));

/** A "what if" deduction: assuming `not` in `cell` makes the clue at `clue` impossible. */
export interface Trial {
  cell: number;
  not: number;
  clue: number;
}

/**
 * Single-clue deductions plus "what if" trials: a value is ruled out when
 * assuming it lets single-clue deductions break some clue. Mutates `dom`.
 * `explain` = false skips finding which clue broke (trials get clue -1), which
 * is much faster; the trials themselves are the same.
 */
export function propagateDeep(b: Board, clue: number[], dom: number[], trials?: Trial[], explain = true): boolean {
  const watch = watchers(b, clue);
  if (!settle(b, clue, dom, watch)) return false;
  for (let changed = true; changed; ) {
    changed = false;
    for (let i = 0; i < dom.length; i++) {
      for (let v = 0; v < 3; v++) {
        if (single(dom[i]) >= 0 || !(dom[i] & bit(v))) continue;
        const t = dom.slice();
        t[i] = bit(v);
        const fail = { clue: -1 };
        if (explain ? propagate(b, clue, t, undefined, fail) : settle(b, clue, t, watch, [i])) continue;
        // Ruled out: apply it and the single-clue deductions it unlocks, then keep scanning.
        dom[i] &= ~bit(v);
        trials?.push({ cell: i, not: v, clue: fail.clue });
        if (!settle(b, clue, dom, watch, [i])) return false;
        changed = true;
      }
    }
  }
  return true;
}

/** Solvable by deductions alone (and therefore unique)? `deep` allows "what if" trials. */
export function deducible(b: Board, clue: number[], given: number[], deep = false): boolean {
  const dom = initialDomains({ given });
  return (deep ? propagateDeep(b, clue, dom) : propagate(b, clue, dom)) && dom.every((d) => single(d) >= 0);
}

export type Level = 'easy' | 'normal' | 'hard';
export const LEVELS: Record<Level, { name: string; text: string }> = {
  easy: { name: 'Easy', text: 'More numbers to go on.' },
  normal: { name: 'Normal', text: 'Every step follows from one number.' },
  hard: { name: 'Hard', text: 'Fewer numbers; some steps need a "what if".' },
};

export type Size = 'small' | 'medium' | 'large';
export const SIZES: Record<Size, { radius: number; name: string }> = {
  small: { radius: 2, name: 'Small' },
  medium: { radius: 3, name: 'Medium' },
  large: { radius: 4, name: 'Large' },
};

/**
 * A puzzle for (seed, radius, level, mode): random answer, then strip clues
 * while it stays deducible. Easy keeps at least 80% of the hexes numbered; Hard
 * may need "what if" trials. (Normal is the original generator, unchanged.)
 * Links mode starts from every number plus a SAME link on every edge whose two
 * hexes match, and strips both; numbers mode is byte-for-byte the old generator.
 */
export function generate(seed: number, radius: number, level: Level = 'normal', mode: ClueMode = 'numbers'): Puzzle {
  const deep = false;
  const links = mode === 'links';
  // Easy keeps 80% of the hexes numbered (links mode: numbers + links >= 110%).
  const minClues = level === 'easy' ? (links ? 1.1 : 0.8) : 0;
  const b = makeBoard(radius);
  const N = b.cells.length;
  const rng = new Rng(mixSeed(seed, (links ? 4100 : 4000) + radius));
  for (let attempt = 0; attempt < 50; attempt++) {
    const solution = b.cells.map(() => rng.int(0, 2) as Element);
    // All three elements must appear, or the board is dull.
    if (new Set(solution).size < 3) continue;
    const clue = solution.map((_, i) => beatsCount(b, solution, i));
    if (links) for (const [x, y] of b.edges) clue.push(solution[x] === solution[y] ? SAME : -1);
    const M = clue.length;
    const given = new Array(N).fill(-1);
    // Rotating every element (fire→water→leaf→fire) keeps every count, so at
    // least one cell must be given; add givens until the clues pin the rest.
    const order = rng.shuffle([...Array(N).keys()]);
    for (const i of order) {
      given[i] = solution[i];
      if (deducible(b, clue, given, deep)) break;
    }
    if (!deducible(b, clue, given, deep)) continue;
    // Strip clues, then spare givens, while deductions still finish the board.
    // Links mode strips numbers and links in one shuffled order, so some numbers
    // give way to links (links end up ~40% of the clues).
    for (const i of rng.shuffle([...Array(M).keys()])) {
      if (clue[i] < 0) continue;
      if (clue.filter((c) => c >= 0).length <= minClues * N) continue;
      const keep = clue[i];
      clue[i] = -1;
      if (!deducible(b, clue, given, deep)) clue[i] = keep;
    }
    for (const i of rng.shuffle([...Array(N).keys()])) {
      // Easy keeps its givens.
      if (level === 'easy' || given[i] < 0 || given.filter((g) => g >= 0).length <= 1) continue;
      const keep = given[i];
      given[i] = -1;
      if (!deducible(b, clue, given, deep)) given[i] = keep;
    }
    if (level === 'hard') {
      // Hard: from the normal puzzle, strip more while a few "what if" steps still finish it.
      const cap = 2 + 2 * radius;
      const ok = () => {
        const dom = initialDomains({ given });
        const trials: Trial[] = [];
        return propagateDeep(b, clue, dom, trials, false) && dom.every((d) => single(d) >= 0) && trials.length <= cap;
      };
      for (const i of rng.shuffle([...Array(M).keys()])) {
        if (clue[i] < 0) continue;
        const keep = clue[i];
        clue[i] = -1;
        if (!ok()) clue[i] = keep;
      }
      for (const i of rng.shuffle([...Array(N).keys()])) {
        if (given[i] < 0 || given.filter((g) => g >= 0).length <= 1) continue;
        const keep = given[i];
        given[i] = -1;
        if (!ok()) given[i] = keep;
      }
      // A Hard puzzle should actually need a "what if" or two; otherwise try another answer.
      const trials: Trial[] = [];
      propagateDeep(b, clue, initialDomains({ given }), trials, false);
      if (trials.length < (radius > 2 ? 2 : 1) && attempt < 30) continue;
    }
    const p: Puzzle = level === 'normal' ? { seed, radius, solution, given, clue } : { seed, radius, level, solution, given, clue };
    if (links) p.links = true;
    return p;
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

/**
 * The guided first puzzle: seven hexes, solved in three taught steps. Cells in
 * reading order: 0 1 / 2 3 4 / 5 6 (3 is the middle).
 */
export const TUTORIAL: Puzzle = {
  seed: 0,
  radius: 1,
  solution: [LEAF, FIRE, WATER, LEAF, LEAF, WATER, FIRE],
  given: [-1, FIRE, -1, -1, -1, -1, -1],
  clue: [-1, 3, -1, 2, -1, -1, 2],
};

export interface TutorialStep {
  /** The number being read. */
  focus: number;
  /** The hexes this step fills. */
  cells: number[];
  text: string;
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    focus: 1,
    cells: [0, 3, 4],
    text: 'The ringed <b>Fire</b> is given. Its <b>3</b> means it beats 3 of its neighbors. It only <i>has</i> 3 neighbors, and fire beats leaf, so all three are <b>Leaf</b>. Fill them in: tap a hex, then Leaf.',
  },
  {
    focus: 6,
    cells: [6],
    text: 'The bottom <b>2</b> touches two Leaves. Which element beats exactly 2 of its neighbors here? Water beats fire and leaf beats water, so neither can make 2. Only <b>Fire</b> (burning both Leaves).',
  },
  {
    focus: 3,
    cells: [2, 5],
    text: 'The middle hex is a Leaf that beats <b>2</b>. Leaf drinks water, and none of its filled neighbors is water, so its two empty neighbors must both be <b>Water</b>.',
  },
];
