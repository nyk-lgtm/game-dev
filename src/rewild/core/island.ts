// The island: a fixed hex disc (radius 4, 61 cells) whose terrain comes from
// the seed. Cell indices never change, so neighbor tables are static.

import { DIRS, distance, type Hex } from '../../shared/hex';
import { Rng, mixSeed } from '../../shared/rng';
import type { Cell, Terrain } from './types';

export const RADIUS = 4;

export const HEXES: Hex[] = [];
for (let q = -RADIUS; q <= RADIUS; q++) {
  for (let r = Math.max(-RADIUS, -q - RADIUS); r <= Math.min(RADIUS, -q + RADIUS); r++) HEXES.push({ q, r });
}
export const N = HEXES.length;

const INDEX = new Map(HEXES.map((h, i) => [`${h.q},${h.r}`, i]));
export const indexOf = (h: Hex): number => INDEX.get(`${h.q},${h.r}`) ?? -1;

const ORIGIN = { q: 0, r: 0 };
/** Ring of each cell (0 center .. RADIUS coast). */
export const RING = HEXES.map((h) => distance(h, ORIGIN));

/** Neighbor index per DIRS direction, -1 past the coast (open sea). */
export const ADJ6: number[][] = HEXES.map((h) => DIRS.map((d) => indexOf({ q: h.q + d.q, r: h.r + d.r })));
/** Neighbors on the island. */
export const ADJ: number[][] = ADJ6.map((a) => a.filter((j) => j >= 0));
/** Cells at distance exactly 2. */
export const RING2: number[][] = HEXES.map((h, i) =>
  HEXES.map((_, j) => j).filter((j) => j !== i && distance(h, HEXES[j]) === 2),
);
/** Cells within distance 1 or 2 (not the cell itself). */
export const NEAR2: number[][] = ADJ.map((a, i) => [...a, ...RING2[i]]);
/** Cells within distance 3, nearest first (not the cell itself). */
export const NEAR3: number[][] = HEXES.map((h, i) => [
  ...NEAR2[i],
  ...HEXES.map((_, j) => j).filter((j) => distance(h, HEXES[j]) === 3),
]);

export const isCoast = (i: number): boolean => ADJ6[i].includes(-1);

export function makeIsland(seed: number): Cell[] {
  const rng = new Rng(mixSeed(seed, 101));
  // Smoothed value noise, normalized to 0..1.
  let noise = HEXES.map(() => rng.next());
  for (let k = 0; k < 2; k++) {
    noise = noise.map((v, i) => {
      let sum = v * 2;
      for (const j of ADJ[i]) sum += noise[j];
      return sum / (2 + ADJ[i].length);
    });
  }
  const lo = Math.min(...noise);
  const hi = Math.max(...noise);
  const nn = noise.map((v) => (v - lo) / (hi - lo || 1));
  const elev = HEXES.map((_, i) => 1 - RING[i] / 4.6 + (nn[i] - 0.5) * 0.55);

  const t: Terrain[] = HEXES.map((_, i) => {
    const e = elev[i];
    if (RING[i] === RADIUS) return e < 0.22 ? 'shallows' : 'sand';
    if (RING[i] === RADIUS - 1) return e < 0.2 ? 'shallows' : e < 0.42 ? 'sand' : 'rock';
    return e < 0.5 ? 'sand' : 'rock';
  });

  // Enough shallows for reeds: flood the lowest coast cells.
  const coast = HEXES.map((_, i) => i).filter((i) => RING[i] === RADIUS).sort((a, b) => elev[a] - elev[b] || a - b);
  let shallows = t.filter((x) => x === 'shallows').length;
  for (const i of coast) {
    if (shallows >= 9) break;
    if (t[i] !== 'shallows') {
      t[i] = 'shallows';
      shallows++;
    }
  }

  // One or two ponds inland, not touching each other.
  const ponds: number[] = [];
  const inland = HEXES.map((_, i) => i).filter((i) => RING[i] >= 1 && RING[i] <= 2);
  const nPonds = rng.next() < 0.45 ? 2 : 1;
  for (let tries = 0; ponds.length < nPonds && tries < 40; tries++) {
    const i = rng.pick(inland);
    if (ponds.includes(i) || ponds.some((p) => ADJ[p].includes(i))) continue;
    ponds.push(i);
    t[i] = 'pond';
  }

  // A few patches of thin soil to get grass going.
  const fert = HEXES.map(() => 0);
  const soilable = (i: number) => (t[i] === 'rock' || t[i] === 'sand') && RING[i] <= RADIUS - 1;
  const seeds = rng.shuffle(HEXES.map((_, i) => i).filter(soilable)).slice(0, 2);
  for (const s of seeds) {
    t[s] = 'soil';
    fert[s] = 1;
    const nb = rng.shuffle(ADJ[s].filter(soilable)).slice(0, 1);
    for (const j of nb) {
      t[j] = 'soil';
      fert[j] = 1;
    }
  }

  return HEXES.map((hex, i) => ({ hex, t: t[i], fert: fert[i], plant: null, animal: null, burnt: 0 }));
}
