// Brink board geometry: a hexagon of 37 flat-top hexes (radius 3), stored as
// cell indices 0..36 in reading order (top to bottom, then left to right).
// `NB[i * 6 + d]` is the neighbour of cell i in direction d (shared DIRS), or -1
// off the island. Pure tables, built once.

import { DIRS, type Hex } from '../../shared/hex';

export const RADIUS = 3;

/** Vertical position in half rows (2r + q): bigger is lower on screen. */
export const y2 = (h: Hex): number => 2 * h.r + h.q;

const all: Hex[] = [];
for (let q = -RADIUS; q <= RADIUS; q++)
  for (let r = -RADIUS; r <= RADIUS; r++) if (Math.abs(q + r) <= RADIUS) all.push({ q, r });
all.sort((a, b) => y2(a) - y2(b) || a.q - b.q);

export const CELLS: readonly Hex[] = all;
export const N = CELLS.length;

const index = new Map(CELLS.map((h, i) => [`${h.q},${h.r}`, i]));
export const cellAt = (q: number, r: number): number => index.get(`${q},${r}`) ?? -1;

export const NB = new Int8Array(N * 6);
for (let i = 0; i < N; i++)
  for (let d = 0; d < 6; d++) NB[i * 6 + d] = cellAt(CELLS[i].q + DIRS[d].q, CELLS[i].r + DIRS[d].r);

/** The cell opposite through the centre (180° turn): the other side's mirror image. */
export const MIRROR = Int8Array.from(CELLS, (h) => cellAt(-h.q, -h.r));

/** Ring: 0 for the centre, 3 for the rim. */
export const RING = Int8Array.from(CELLS, (h) => Math.max(Math.abs(h.q), Math.abs(h.r), Math.abs(h.q + h.r)));

export const opposite = (d: number): number => (d + 3) % 6;

/** Step from a to an adjacent b: its direction, or -1. */
export function dirTo(a: number, b: number): number {
  for (let d = 0; d < 6; d++) if (NB[a * 6 + d] === b) return d;
  return -1;
}
