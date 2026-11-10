// The board: a 9x11 field of flat-top hexes (odd-q offset rows), a portal at
// the top and the core at the bottom. Enemies follow a flow field (distance to
// the core) that is rebuilt whenever towers change, so your towers are the
// maze. Placement may never seal the path.

import { DIRS, distance, offsetToAxial, toPixel, type Hex } from '../../shared/hex';
import { Rng, mixSeed } from '../../shared/rng';

export const COLS = 9;
export const ROWS = 11;
export const N = COLS * ROWS;
/** Distance between neighboring cell centers in world units (hex size 1). */
export const CELL = Math.sqrt(3);

export type Ground = 'open' | 'rock' | 'ley' | 'portal' | 'core';

export const idx = (col: number, row: number) => row * COLS + col;
export const HEXES: Hex[] = [];
export const POS: { x: number; y: number }[] = [];
for (let row = 0; row < ROWS; row++)
  for (let col = 0; col < COLS; col++) {
    const h = offsetToAxial(col, row);
    HEXES.push(h);
    POS.push(toPixel(h, 1));
  }
const INDEX = new Map(HEXES.map((h, i) => [`${h.q},${h.r}`, i]));
/** Neighbors in DIRS order (a fixed order keeps pathing deterministic). */
export const ADJ: number[][] = HEXES.map((h) =>
  DIRS.map((d) => INDEX.get(`${h.q + d.q},${h.r + d.r}`) ?? -1).filter((j) => j >= 0),
);
export const cellDistance = (a: number, b: number) => distance(HEXES[a], HEXES[b]);

export const PORTAL = idx(4, 0);
export const CORE = idx(4, ROWS - 1);

export function makeMap(seed: number): Ground[] {
  const rng = new Rng(mixSeed(seed, 311));
  for (let attempt = 0; attempt < 50; attempt++) {
    const g: Ground[] = new Array(N).fill('open');
    g[PORTAL] = 'portal';
    g[CORE] = 'core';
    // Rocks: a few clusters, never next to the portal or the core.
    const clusters = rng.int(3, 5);
    for (let c = 0; c < clusters; c++) {
      let at = rng.int(0, N - 1);
      const size = rng.int(1, 3);
      for (let k = 0; k < size; k++) {
        if (g[at] === 'open' && cellDistance(at, PORTAL) > 1 && cellDistance(at, CORE) > 1) g[at] = 'rock';
        at = rng.pick(ADJ[at]);
      }
    }
    // Ley lines: towers built on them hit harder.
    let ley = 0;
    for (let t = 0; t < 40 && ley < 4; t++) {
      const i = rng.int(COLS, N - COLS - 1);
      if (g[i] === 'open') {
        g[i] = 'ley';
        ley++;
      }
    }
    if (flowField(g, new Set()).dist[PORTAL] < Infinity) return g;
  }
  const g: Ground[] = new Array(N).fill('open');
  g[PORTAL] = 'portal';
  g[CORE] = 'core';
  return g;
}

export interface Field {
  /** Steps to the core (Infinity if cut off). */
  dist: number[];
}

/** BFS distance to the core over cells that are not rock and not built on. */
export function flowField(ground: Ground[], blocked: Set<number>): Field {
  const dist = new Array(N).fill(Infinity);
  dist[CORE] = 0;
  const q = [CORE];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    for (const j of ADJ[i]) {
      if (dist[j] !== Infinity || ground[j] === 'rock' || blocked.has(j)) continue;
      dist[j] = dist[i] + 1;
      q.push(j);
    }
  }
  return { dist };
}

/** Flyers ignore the maze: plain hex distance to the core. */
export const FLY_DIST = HEXES.map((_, i) => cellDistance(i, CORE));

/** The next cell on the way to the core (lowest distance; ties by DIRS order). */
export function nextCell(dist: number[], i: number): number {
  let best = -1;
  for (const j of ADJ[i]) if (dist[j] < dist[i] && (best < 0 || dist[j] < dist[best])) best = j;
  return best;
}
