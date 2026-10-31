// Track building: stages of eased curves and hills with roadside props,
// joined by forks where the route branches (OutRun style).

import { Rng, mixSeed } from '../../shared/rng';
import type { BiomeId, Prop, PropKind, Segment } from './types';

export const SEG_LEN = 200;
export const STAGES = 5;
/** Segments per stage (before the fork's run-out). */
export const STAGE_SEGS = 1150;
/** A neutral stretch after each fork, longer than the draw distance, so the next stage can be built once the player picks a side. */
export const RUNOUT = 260;

/** Which biome each fork leads to: TREE[stage][position]; left keeps the position, right adds one. */
export const TREE: BiomeId[][] = [
  ['city'],
  ['desert', 'forest'],
  ['coast', 'desert', 'snow'],
  ['forest', 'coast', 'snow', 'desert'],
  ['coast', 'snow', 'forest', 'city', 'desert'],
];

export const BIOME_NAMES: Record<BiomeId, string> = {
  city: 'Neon City',
  desert: 'Dust Highway',
  forest: 'Pine Pass',
  snow: 'Frost Ridge',
  coast: 'Sunrise Coast',
};

const PROPS: Record<BiomeId, PropKind[]> = {
  city: ['lamp', 'tower', 'billboard', 'lamp'],
  desert: ['cactus', 'rock', 'cactus', 'sign'],
  forest: ['pine', 'pine', 'rock', 'pine'],
  snow: ['snowpine', 'rock', 'snowpine', 'snowpine'],
  coast: ['palm', 'palm', 'buoy', 'palm'],
};

const easeIn = (a: number, b: number, t: number) => a + (b - a) * t * t;
const easeInOut = (a: number, b: number, t: number) => a + (b - a) * (-Math.cos(t * Math.PI) / 2 + 0.5);

export class TrackBuilder {
  constructor(public segments: Segment[]) {}

  private lastY(): number {
    return this.segments.length ? this.segments[this.segments.length - 1].y : 0;
  }

  private push(curve: number, y: number, biome: BiomeId): Segment {
    const index = this.segments.length;
    const s: Segment = { index, z: index * SEG_LEN, curve, y, biome, props: [] };
    this.segments.push(s);
    return s;
  }

  /** A section that eases into a curve/hill, holds, and eases out. */
  section(enter: number, hold: number, leave: number, curve: number, height: number, biome: BiomeId): void {
    const y0 = this.lastY();
    const y1 = y0 + height * SEG_LEN;
    const total = enter + hold + leave;
    for (let n = 0; n < enter; n++) this.push(easeIn(0, curve, n / enter), easeInOut(y0, y1, n / total), biome);
    for (let n = 0; n < hold; n++) this.push(curve, easeInOut(y0, y1, (enter + n) / total), biome);
    for (let n = 0; n < leave; n++) this.push(easeInOut(curve, 0, n / leave), easeInOut(y0, y1, (enter + hold + n) / total), biome);
  }
}

/**
 * Build one stage's road. `level` (0..4) and `hard` (right-hand branch)
 * raise curvature and hills.
 */
export function buildStage(b: TrackBuilder, seed: number, level: number, biome: BiomeId, hard: boolean): { start: number; end: number } {
  const rng = new Rng(mixSeed(seed, 1000 + level * 7 + (hard ? 3 : 0)));
  const start = b.segments.length;
  const intensity = 0.8 + level * 0.25 + (hard ? 0.3 : 0);
  b.section(25, 40, 25, 0, 0, biome);
  while (b.segments.length - start < STAGE_SEGS) {
    const r = rng.next();
    const len = rng.int(25, 70);
    const dir = rng.next() < 0.5 ? -1 : 1;
    const curve = dir * (2 + rng.next() * 4) * intensity;
    const hill = (rng.next() - 0.45) * 40 * (biome === 'city' ? 0.3 : biome === 'snow' || biome === 'forest' ? 1.2 : 0.7);
    if (r < 0.25) b.section(len, len, len, 0, hill, biome);
    else if (r < 0.7) b.section(len, len, len, curve, hill * 0.5, biome);
    else if (r < 0.85) {
      // S-bend.
      b.section(len / 2, len / 2, len / 2, curve, 0, biome);
      b.section(len / 2, len / 2, len / 2, -curve, 0, biome);
    } else b.section(len, len * 2, len, curve * 0.4, hill, biome);
  }
  b.section(30, 60, 30, 0, 0, biome);
  const end = b.segments.length;
  // Roadside props.
  const kinds = PROPS[biome];
  for (let i = start + 10; i < end; i += rng.int(6, 14)) {
    const seg = b.segments[i];
    const side = rng.next() < 0.5 ? -1 : 1;
    const kind = kinds[rng.int(0, kinds.length - 1)];
    const p: Prop = { kind, offset: side * (1.35 + rng.next() * 1.6) };
    if (kind === 'sign') p.text = rng.next() < 0.5 ? 'DRIVE' : 'NO GAS';
    if (kind === 'billboard') p.text = ['NEON', 'RUSH', 'SPEED', 'NIGHT'][rng.int(0, 3)];
    seg.props.push(p);
    if (rng.next() < 0.35) seg.props.push({ kind, offset: -side * (1.35 + rng.next() * 1.4) });
  }
  return { start, end };
}

/** The fork and run-out after a stage; signs announce both destinations. */
export function buildFork(b: TrackBuilder, level: number, pos: number, biome: BiomeId): number {
  const forkAt = b.segments.length;
  b.section(20, RUNOUT - 40, 20, 0, 0, biome);
  if (level + 1 < STAGES) {
    const left = TREE[level + 1][pos];
    const right = TREE[level + 1][pos + 1];
    for (const off of [40, 25]) {
      b.segments[forkAt - off].props.push({ kind: 'fork', offset: -1.4, text: `< ${BIOME_NAMES[left].toUpperCase()}` });
      b.segments[forkAt - off].props.push({ kind: 'fork', offset: 1.4, text: `${BIOME_NAMES[right].toUpperCase()} >` });
    }
  }
  return forkAt;
}
