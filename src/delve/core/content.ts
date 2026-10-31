// Delve content: monsters, gear, spells, leveling.

import type { MonsterKind, SpellId } from './types';

export interface MonsterDef {
  name: string;
  hp: number;
  atk: number;
  def: number;
  xp: number;
  /** Acts every (1 + slow) turns. */
  slow: number;
  /** Ranged attack reach in cells (0 = melee only). */
  range: number;
  /** Chance to move randomly instead of hunting. */
  erratic: number;
  /** Passes through walls. */
  ghost: boolean;
  /** Depths it appears at. */
  depths: [number, number];
  /** Spawn weight. */
  weight: number;
  blurb: string;
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  rat: { name: 'Giant rat', hp: 6, atk: 3, def: 0, xp: 3, slow: 0, range: 0, erratic: 0, ghost: false, depths: [1, 3], weight: 3, blurb: 'Quick and hungry.' },
  bat: { name: 'Cave bat', hp: 5, atk: 2, def: 0, xp: 3, slow: 0, range: 0, erratic: 0.5, ghost: false, depths: [1, 4], weight: 2, blurb: 'Flits erratically.' },
  slime: { name: 'Slime', hp: 22, atk: 4, def: 0, xp: 8, slow: 1, range: 0, erratic: 0, ghost: false, depths: [2, 6], weight: 2, blurb: 'Slow, but soaks up blows.' },
  skeleton: { name: 'Skeleton', hp: 16, atk: 5, def: 2, xp: 10, slow: 0, range: 0, erratic: 0, ghost: false, depths: [2, 8], weight: 3, blurb: 'Rattling bones, rusty blade.' },
  archer: { name: 'Bone archer', hp: 12, atk: 4, def: 1, xp: 11, slow: 0, range: 5, erratic: 0, ghost: false, depths: [3, 9], weight: 2, blurb: 'Shoots down straight corridors.' },
  ghoul: { name: 'Ghoul', hp: 26, atk: 7, def: 1, xp: 16, slow: 0, range: 0, erratic: 0, ghost: false, depths: [4, 10], weight: 2, blurb: 'Hits hard and never tires.' },
  wraith: { name: 'Wraith', hp: 20, atk: 6, def: 2, xp: 18, slow: 0, range: 0, erratic: 0, ghost: true, depths: [5, 10], weight: 1.5, blurb: 'Drifts through walls.' },
  mage: { name: 'Cultist', hp: 18, atk: 8, def: 1, xp: 20, slow: 0, range: 6, erratic: 0, ghost: false, depths: [5, 10], weight: 1.5, blurb: 'Hurls fire from afar.' },
  golem: { name: 'Stone golem', hp: 55, atk: 11, def: 4, xp: 30, slow: 1, range: 0, erratic: 0, ghost: false, depths: [6, 10], weight: 1, blurb: 'Slow as stone, hits like a landslide.' },
  warden: { name: 'The Warden', hp: 180, atk: 12, def: 4, xp: 0, slow: 0, range: 4, erratic: 0, ghost: false, depths: [99, 99], weight: 0, blurb: 'Keeper of the deep. Calls the dead.' },
};

export const WEAPONS = ['Dagger', 'Sword', 'Axe', 'Warblade', 'Runeblade'];
export const WEAPON_ATK = [0, 3, 5, 8, 12];
export const ARMORS = ['Rags', 'Leather', 'Chain mail', 'Plate', 'Runeplate'];
export const ARMOR_DEF = [0, 1, 3, 5, 7];

export interface SpellDef {
  name: string;
  cost: number;
  /** Level it's learned at. */
  level: number;
  desc: string;
}

export const SPELLS: Record<SpellId, SpellDef> = {
  fire: { name: 'Firebolt', cost: 2, level: 1, desc: 'A bolt down the corridor ahead.' },
  frost: { name: 'Frost', cost: 3, level: 3, desc: 'Freezes the first foe ahead for 3 turns.' },
  heal: { name: 'Mend', cost: 5, level: 5, desc: 'Restore half your health.' },
  blink: { name: 'Blink', cost: 4, level: 7, desc: 'Teleport up to 4 cells forward.' },
};

export const POTION_HEAL = 0.5;
export const ETHER_MP = 6;
export const MAX_DEPTH = 10;
/** Total XP needed to reach level i + 1. */
export const XP_TABLE = [0, 15, 40, 80, 135, 210, 300, 410, 540, 700, 900, 1150];

export function fireDamage(level: number): number {
  return 7 + level * 2;
}
