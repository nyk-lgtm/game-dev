// Arenas. The open grid has nothing in it; Monoliths scatters glowing pillars
// across the (endless) plane. Pillars come from a hash of the run seed and a
// coarse cell, so they cost nothing to store and are identical on replay.
// They block the player, regular enemies and enemy shots: cover from spitters.

import { mixSeed } from '../../shared/rng';
import type { World } from './types';

export interface ArenaDef {
  id: string;
  name: string;
  text: string;
}

export const ARENAS: ArenaDef[] = [
  { id: 'open', name: 'Open grid', text: 'Nowhere to hide, nothing in your way.' },
  { id: 'monoliths', name: 'Monoliths', text: 'Pillars block you and the swarm, and stop enemy shots. Use them as cover.' },
];

export interface Pillar {
  x: number;
  y: number;
  r: number;
}

export const PILLAR_CELL = 360;
/** No pillars this close to where the run starts. */
const CLEAR_START = 170;

function hash01(seed: number, a: number, b: number, k: number): number {
  return mixSeed(mixSeed(seed ^ 0x5bd1e995, (a * 73856093) ^ (b * 19349663)), k) / 4294967296;
}

/** The pillars of one grid cell (0-2 of them). */
export function cellPillars(seed: number, cx: number, cy: number, out: Pillar[]): void {
  const n = hash01(seed, cx, cy, 1);
  const count = n < 0.35 ? 0 : n < 0.85 ? 1 : 2;
  for (let i = 0; i < count; i++) {
    const r = 24 + hash01(seed, cx, cy, 10 + i) * 34;
    const m = r + 30;
    const x = cx * PILLAR_CELL + m + hash01(seed, cx, cy, 20 + i) * (PILLAR_CELL - 2 * m);
    const y = cy * PILLAR_CELL + m + hash01(seed, cx, cy, 30 + i) * (PILLAR_CELL - 2 * m);
    if (x * x + y * y < (CLEAR_START + r) ** 2) continue;
    out.push({ x, y, r });
  }
}

const scratch: Pillar[] = [];

/** Pillars overlapping the box around (x, y) with half-size `reach`. */
export function pillarsNear(w: World, x: number, y: number, reach: number, out: Pillar[] = []): Pillar[] {
  if (w.arena !== 1) return out;
  const x0 = Math.floor((x - reach) / PILLAR_CELL);
  const x1 = Math.floor((x + reach) / PILLAR_CELL);
  const y0 = Math.floor((y - reach) / PILLAR_CELL);
  const y1 = Math.floor((y + reach) / PILLAR_CELL);
  for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) cellPillars(w.seed, cx, cy, out);
  return out;
}

/**
 * Push a circle out of any pillar it overlaps. With `toward`, also slide it
 * around the pillar toward that point, so chasers don't stall behind one.
 * Returns true if it touched a pillar.
 */
export function pushOut(w: World, o: { x: number; y: number }, r: number, toward?: { x: number; y: number }, slide = 0): boolean {
  if (w.arena !== 1) return false;
  scratch.length = 0;
  pillarsNear(w, o.x, o.y, r + 60, scratch);
  let hit = false;
  for (const p of scratch) {
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    const min = p.r + r;
    const d2 = dx * dx + dy * dy;
    if (d2 >= min * min) continue;
    hit = true;
    const d = Math.sqrt(d2) || 1;
    const nx = dx / d;
    const ny = dy / d;
    o.x = p.x + nx * min;
    o.y = p.y + ny * min;
    if (toward && slide > 0) {
      // Slide along the tangent on the side facing the target.
      const tx = -ny;
      const ty = nx;
      const side = (toward.x - o.x) * tx + (toward.y - o.y) * ty >= 0 ? 1 : -1;
      o.x += tx * side * slide;
      o.y += ty * side * slide;
    }
  }
  return hit;
}

/** True if the point is inside a pillar. */
export function inPillar(w: World, x: number, y: number, pad = 0): boolean {
  if (w.arena !== 1) return false;
  scratch.length = 0;
  pillarsNear(w, x, y, 60 + pad, scratch);
  for (const p of scratch) if ((x - p.x) ** 2 + (y - p.y) ** 2 < (p.r + pad) ** 2) return true;
  return false;
}
