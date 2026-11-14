// Trestle levels: a grid of build points, rock (axis-aligned boxes), fixed
// anchor pegs and a goal: roll the beetle's cart across, or hold a lantern up
// at a ring. Pure data; gen.ts makes them from a seed, tutorials.ts by hand.

export const RULES_VERSION = 4;

/** Grid size in points: x 0..COLS-1, y 0..ROWS-1 (y grows downward). */
export const COLS = 13;
export const ROWS = 12;
/** The water line (anything below has fallen). */
export const WATER = 11.4;

export interface Rock {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Look only: a bank with grass on top, a stone spire, a cliff wall, a fallen
   *  log over the gap, a stony floor close under the road, a lane kept clear for boats
   *  (no building there, but nothing collides with it). */
  kind: 'bank' | 'rock' | 'wall' | 'log' | 'floor' | 'clear';
}

export type Goal =
  | {
      kind: 'cross';
      /** The anchors at the two bank edges, where the road starts and ends. */
      from: number;
      to: number;
      /** Where the cart's middle starts (on the left bank) and the flag it must pass. */
      startX: number;
      startY: number;
      goalX: number;
      /** Cart mass (the beetle's load), and how many carts roll in a row (default 1). */
      cart: number;
      carts?: number;
    }
  | {
      kind: 'reach';
      /** Grid points that must each carry a lantern. */
      rings: number[];
      /** Mass of each lantern. */
      weight: number;
    };

export interface Level {
  /** "t3" for a tutorial, "s<seed>" for a generated level. */
  id: string;
  name: string;
  terrain: Rock[];
  /** Fixed pegs (grid point indices). */
  anchors: number[];
  goal: Goal;
  budget: number;
  /** The surveyor's own build: its cost and part count set the stars. */
  par: number;
  parParts: number;
  /** One line shown when the level opens. */
  tip?: string;
  /** The surveyor's build (actions), proof that the level can be done. */
  ref?: string;
  /** Wind push per unit of catch at full gust (+ blows to the right); absent = calm. */
  wind?: number;
  /** Generated levels: the layout type (see gen.ts) and a 0..1 difficulty from the surveyor. */
  type?: string;
  diff?: number;
}

export const pt = (x: number, y: number) => y * COLS + x;
/** The lantern rings of a reach level (none for a crossing). */
export const ringsOf = (l: Level): number[] => (l.goal.kind === 'reach' ? l.goal.rings : []);
export const px = (p: number) => p % COLS;
export const py = (p: number) => Math.floor(p / COLS);

/** Inside or on the edge of a rock: no pegs may go there (anchors excepted). */
export function inRock(l: Level, x: number, y: number): boolean {
  for (const r of l.terrain) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return true;
  return false;
}

/** Strictly inside a rock. */
export function deepInRock(l: Level, x: number, y: number): boolean {
  for (const r of l.terrain) if (x > r.x0 + 1e-6 && x < r.x1 - 1e-6 && y > r.y0 + 1e-6 && y < r.y1 - 1e-6) return true;
  return false;
}

/** A point where a peg may stand: on the grid, out of the rock (or an anchor). */
export function buildable(l: Level, p: number): boolean {
  if (p < 0 || p >= COLS * ROWS) return false;
  if (l.anchors.includes(p)) return true;
  return !inRock(l, px(p), py(p));
}

/** Stars for a cleared build: one for clearing within budget, two at par cost, three at par cost and parts. */
export function starsFor(l: Level, cost: number, parts: number): number {
  if (cost > l.budget) return 0;
  if (cost > l.par) return 1;
  return parts <= l.parParts ? 3 : 2;
}
