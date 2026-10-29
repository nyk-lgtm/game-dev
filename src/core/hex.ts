// Axial hex coordinates, flat-top orientation.
// Board storage uses "odd-q" offset (col,row) for a rectangular layout;
// all rules work in axial (q,r).

export interface Hex {
  q: number;
  r: number;
}

/** Six neighbor directions, clockwise starting east-ish (flat-top). */
export const DIRS: readonly Hex[] = [
  { q: 1, r: -1 },
  { q: 1, r: 0 },
  { q: 0, r: 1 },
  { q: -1, r: 1 },
  { q: -1, r: 0 },
  { q: 0, r: -1 },
];

export const hex = (q: number, r: number): Hex => ({ q, r });

export const key = (h: Hex): string => `${h.q},${h.r}`;

export const add = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });

export const sub = (a: Hex, b: Hex): Hex => ({ q: a.q - b.q, r: a.r - b.r });

export const scale = (a: Hex, k: number): Hex => ({ q: a.q * k, r: a.r * k });

export const eq = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

export function distance(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export const neighbors = (h: Hex): Hex[] => DIRS.map((d) => add(h, d));

export const isAdjacent = (a: Hex, b: Hex): boolean => distance(a, b) === 1;

/** Index into DIRS of the unit step from a to b, or -1 if not adjacent. */
export function dirIndex(a: Hex, b: Hex): number {
  const d = sub(b, a);
  return DIRS.findIndex((x) => x.q === d.q && x.r === d.r);
}

/**
 * If b lies on one of the six straight lines from a, returns that direction
 * index; otherwise -1. Returns -1 when a equals b.
 */
export function lineDir(a: Hex, b: Hex): number {
  const n = distance(a, b);
  if (n === 0) return -1;
  const d = sub(b, a);
  if (d.q % n !== 0 || d.r % n !== 0) return -1;
  return DIRS.findIndex((x) => x.q === d.q / n && x.r === d.r / n);
}

export function offsetToAxial(col: number, row: number): Hex {
  return { q: col, r: row - (col - (col & 1)) / 2 };
}

export function axialToOffset(h: Hex): { col: number; row: number } {
  return { col: h.q, row: h.r + (h.q - (h.q & 1)) / 2 };
}

const SQRT3 = Math.sqrt(3);

/** Center of a hex in pixels for a given hex "size" (center-to-corner). */
export function toPixel(h: Hex, size: number): { x: number; y: number } {
  return { x: size * 1.5 * h.q, y: size * SQRT3 * (h.r + h.q / 2) };
}

export function fromPixel(x: number, y: number, size: number): Hex {
  const q = ((2 / 3) * x) / size;
  const r = ((-1 / 3) * x + (SQRT3 / 3) * y) / size;
  return round(q, r);
}

function round(fq: number, fr: number): Hex {
  const fs = -fq - fr;
  let q = Math.round(fq);
  let r = Math.round(fr);
  const s = Math.round(fs);
  const dq = Math.abs(q - fq);
  const dr = Math.abs(r - fr);
  const ds = Math.abs(s - fs);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q: q + 0, r: r + 0 };
}
