// Afterglow content tables: enemies, passives, characters, meta upgrades.
// Weapons live in weapons.ts because they carry behavior.

import type { EnemyKind, PassiveId, Stats, WeaponId } from './types';

// ---------- enemies ----------

export interface EnemyDef {
  name: string;
  r: number;
  hp: number;
  speed: number;
  dmg: number;
  xp: number;
  /** 0 = full knockback, 1 = immune. */
  heavy: number;
  /** Hue for its glow. */
  hue: number;
  blurb: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  drone: { name: 'Drone', r: 9, hp: 8, speed: 52, dmg: 6, xp: 1, heavy: 0, hue: 330, blurb: 'Swarms. Lots of them.' },
  mite: { name: 'Mite', r: 6, hp: 4, speed: 74, dmg: 4, xp: 1, heavy: 0, hue: 300, blurb: 'Fast splinters.' },
  brute: { name: 'Brute', r: 18, hp: 60, speed: 34, dmg: 14, xp: 5, heavy: 0.8, hue: 25, blurb: 'Slow, heavy, hard to push.' },
  dart: { name: 'Dart', r: 9, hp: 14, speed: 44, dmg: 10, xp: 2, heavy: 0.2, hue: 50, blurb: 'Aims, then dashes. Watch the line.' },
  spitter: { name: 'Spitter', r: 11, hp: 16, speed: 48, dmg: 8, xp: 2, heavy: 0.1, hue: 140, blurb: 'Keeps its distance and spits.' },
  splitter: { name: 'Splitter', r: 14, hp: 26, speed: 44, dmg: 8, xp: 3, heavy: 0.2, hue: 280, blurb: 'Bursts into mites.' },
  bloater: { name: 'Bloater', r: 15, hp: 30, speed: 46, dmg: 22, xp: 3, heavy: 0.3, hue: 0, blurb: 'Swells and explodes. Hurts its friends too.' },
  orbiter: { name: 'Orbiter', r: 10, hp: 18, speed: 64, dmg: 8, xp: 2, heavy: 0.1, hue: 95, blurb: 'Circles you, closing in.' },
  warden: { name: 'Warden', r: 15, hp: 70, speed: 38, dmg: 10, xp: 6, heavy: 0.6, hue: 245, blurb: 'Shields everything near it. Kill it first.' },
  prism: { name: 'Prism', r: 34, hp: 2400, speed: 42, dmg: 20, xp: 120, heavy: 1, hue: 170, blurb: 'Fires bursts of shards and lunges.' },
  eclipse: { name: 'Eclipse', r: 46, hp: 11000, speed: 34, dmg: 26, xp: 0, heavy: 1, hue: 15, blurb: 'The end of the night.' },
};

// ---------- passives ----------

export interface PassiveDef {
  name: string;
  maxLevel: number;
  desc: string;
  hue: number;
  apply(s: Stats, level: number): void;
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  might: { name: 'Might', maxLevel: 5, desc: '+10% damage', hue: 0, apply: (s, l) => (s.might += 0.1 * l) },
  haste: { name: 'Haste', maxLevel: 5, desc: '-7% cooldowns', hue: 50, apply: (s, l) => (s.haste *= 1 - 0.07 * l) },
  reach: { name: 'Reach', maxLevel: 5, desc: '+10% area', hue: 270, apply: (s, l) => (s.area += 0.1 * l) },
  velocity: { name: 'Velocity', maxLevel: 5, desc: '+12% projectile speed and range', hue: 190, apply: (s, l) => (s.velocity += 0.12 * l) },
  multicast: { name: 'Multicast', maxLevel: 3, desc: '+1 projectile / strike', hue: 320, apply: (s, l) => (s.amount += l) },
  duration: { name: 'Duration', maxLevel: 5, desc: '+12% effect duration', hue: 160, apply: (s, l) => (s.duration += 0.12 * l) },
  swift: { name: 'Swift', maxLevel: 5, desc: '+8% move speed', hue: 100, apply: (s, l) => (s.speed *= 1 + 0.08 * l) },
  vitality: { name: 'Vitality', maxLevel: 5, desc: '+20 max health', hue: 350, apply: (s, l) => (s.maxHp += 20 * l) },
  regen: { name: 'Regen', maxLevel: 5, desc: '+0.3 health per second', hue: 130, apply: (s, l) => (s.regen += 0.3 * l) },
  magnet: { name: 'Magnet', maxLevel: 5, desc: '+30% pickup radius', hue: 220, apply: (s, l) => (s.magnet *= 1 + 0.3 * l) },
};

export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;

export function baseStats(): Stats {
  return {
    maxHp: 100,
    regen: 0,
    armor: 0,
    speed: 120,
    might: 1,
    haste: 1,
    area: 1,
    velocity: 1,
    amount: 0,
    duration: 1,
    magnet: 80,
    greed: 1,
  };
}

// ---------- characters ----------

export interface CharacterDef {
  id: string;
  name: string;
  weapon: WeaponId;
  blurb: string;
  hue: number;
  /** Stat changes on top of the base. */
  mod(s: Stats): void;
  /** How to unlock (null = available from the start). */
  unlock: { text: string; check: (p: Profile) => boolean } | null;
}

export const CHARACTERS: CharacterDef[] = [
  { id: 'spark', name: 'Spark', weapon: 'pulse', hue: 190, blurb: 'Balanced. Starts with Pulse.', mod: () => {}, unlock: null },
  {
    id: 'warden',
    name: 'Bastion',
    weapon: 'halo',
    hue: 45,
    blurb: 'Starts with Halo. +40 health, +1 armor, 10% slower.',
    mod: (s) => {
      s.maxHp += 40;
      s.armor += 1;
      s.speed *= 0.9;
    },
    unlock: { text: 'Survive 5 minutes', check: (p) => p.bestTime >= 300 },
  },
  {
    id: 'volt',
    name: 'Volt',
    weapon: 'arc',
    hue: 280,
    blurb: 'Starts with Arc. 15% faster cooldowns, 20% less health.',
    mod: (s) => {
      s.haste *= 0.85;
      s.maxHp -= 20;
    },
    unlock: { text: 'Defeat the Prism', check: (p) => p.prismKills > 0 },
  },
  {
    id: 'drift',
    name: 'Drift',
    weapon: 'orbit',
    hue: 140,
    blurb: 'Starts with Orbit. +20% move speed, +30% pickup radius.',
    mod: (s) => {
      s.speed *= 1.2;
      s.magnet *= 1.3;
    },
    unlock: { text: 'Reach level 25 in a run', check: (p) => p.bestLevel >= 25 },
  },
];

// ---------- meta progression ----------

export interface Profile {
  shards: number;
  ranks: Record<string, number>;
  bestTime: number;
  bestLevel: number;
  bestKills: number;
  prismKills: number;
  wins: number;
  runs: number;
}

export interface MetaDef {
  id: string;
  name: string;
  desc: string;
  max: number;
  cost: (rank: number) => number;
  apply(s: Stats, rank: number, w: { rerolls: number; revives: number }): void;
}

export const META: MetaDef[] = [
  { id: 'might', name: 'Power', desc: '+5% damage per rank', max: 5, cost: (r) => 40 + 40 * r, apply: (s, r) => (s.might += 0.05 * r) },
  { id: 'vitality', name: 'Vigor', desc: '+10 max health per rank', max: 5, cost: (r) => 30 + 30 * r, apply: (s, r) => (s.maxHp += 10 * r) },
  { id: 'regen', name: 'Mending', desc: '+0.1 health/s per rank', max: 3, cost: (r) => 60 + 60 * r, apply: (s, r) => (s.regen += 0.1 * r) },
  { id: 'armor', name: 'Plating', desc: '+1 armor per rank', max: 3, cost: (r) => 80 + 80 * r, apply: (s, r) => (s.armor += r) },
  { id: 'haste', name: 'Tempo', desc: '-3% cooldowns per rank', max: 3, cost: (r) => 70 + 70 * r, apply: (s, r) => (s.haste *= 1 - 0.03 * r) },
  { id: 'speed', name: 'Stride', desc: '+4% move speed per rank', max: 3, cost: (r) => 50 + 50 * r, apply: (s, r) => (s.speed *= 1 + 0.04 * r) },
  { id: 'magnet', name: 'Lure', desc: '+15% pickup radius per rank', max: 3, cost: (r) => 30 + 30 * r, apply: (s, r) => (s.magnet *= 1 + 0.15 * r) },
  { id: 'greed', name: 'Greed', desc: '+15% shards per rank', max: 3, cost: (r) => 60 + 60 * r, apply: (s, r) => (s.greed += 0.15 * r) },
  { id: 'reroll', name: 'Insight', desc: '+1 reroll per run per rank', max: 3, cost: (r) => 90 + 90 * r, apply: (_s, r, w) => (w.rerolls += r) },
  { id: 'revive', name: 'Second Wind', desc: 'Revive once per run', max: 1, cost: () => 300, apply: (_s, r, w) => (w.revives += r) },
];

export function emptyProfile(): Profile {
  return { shards: 0, ranks: {}, bestTime: 0, bestLevel: 0, bestKills: 0, prismKills: 0, wins: 0, runs: 0 };
}

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  if (level < 20) return 5 + (level - 1) * 10;
  if (level < 40) return 195 + (level - 20) * 13;
  return 455 + (level - 40) * 16;
}

/** Run length before the final boss arrives. */
export const RUN_SECONDS = 600;
