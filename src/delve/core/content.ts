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
  rat: { name: 'Giant rat', hp: 7, atk: 3, def: 0, xp: 3, slow: 0, range: 0, erratic: 0, ghost: false, depths: [1, 3], weight: 3, blurb: 'Quick and hungry.' },
  bat: { name: 'Cave bat', hp: 6, atk: 3, def: 0, xp: 3, slow: 0, range: 0, erratic: 0.5, ghost: false, depths: [1, 4], weight: 2, blurb: 'Flits erratically.' },
  slime: { name: 'Slime', hp: 26, atk: 5, def: 0, xp: 8, slow: 1, range: 0, erratic: 0, ghost: false, depths: [2, 6], weight: 2, blurb: 'Slow, but soaks up blows.' },
  skeleton: { name: 'Skeleton', hp: 18, atk: 6, def: 1, xp: 10, slow: 0, range: 0, erratic: 0, ghost: false, depths: [2, 7], weight: 3, blurb: 'Rattling bones, rusty blade.' },
  archer: { name: 'Bone archer', hp: 16, atk: 7, def: 1, xp: 11, slow: 0, range: 5, erratic: 0, ghost: false, depths: [3, 9], weight: 2, blurb: 'Shoots down straight corridors.' },
  thief: { name: 'Cutpurse', hp: 14, atk: 4, def: 1, xp: 12, slow: 0, range: 0, erratic: 0, ghost: false, depths: [3, 8], weight: 0, blurb: 'Grabs your gold and runs.' },
  ghoul: { name: 'Ghoul', hp: 38, atk: 13, def: 2, xp: 16, slow: 0, range: 0, erratic: 0, ghost: false, depths: [4, 10], weight: 2, blurb: 'Hits hard and never tires.' },
  wraith: { name: 'Wraith', hp: 32, atk: 15, def: 3, xp: 18, slow: 0, range: 0, erratic: 0, ghost: true, depths: [5, 10], weight: 1.5, blurb: 'Drifts through walls.' },
  mage: { name: 'Cultist', hp: 26, atk: 16, def: 2, xp: 20, slow: 0, range: 6, erratic: 0, ghost: false, depths: [5, 10], weight: 1.5, blurb: 'Hurls fire from afar.' },
  golem: { name: 'Stone golem', hp: 80, atk: 20, def: 5, xp: 30, slow: 1, range: 0, erratic: 0, ghost: false, depths: [6, 10], weight: 1.5, blurb: 'Slow as stone, hits like a landslide.' },
  warden: { name: 'The Warden', hp: 460, atk: 24, def: 5, xp: 0, slow: 0, range: 0, erratic: 0, ghost: false, depths: [99, 99], weight: 0, blurb: 'Keeper of the deep. Calls the dead.' },
};

export const WEAPONS = ['Dagger', 'Sword', 'Axe', 'Warblade', 'Runeblade'];
export const WEAPON_ATK = [0, 3, 5, 8, 12];
export const ARMORS = ['Rags', 'Leather', 'Chain mail', 'Plate', 'Runeplate'];
export const ARMOR_DEF = [0, 1, 2, 4, 6];

export interface SpellDef {
  name: string;
  cost: number;
  /** Level it's learned at. */
  level: number;
  desc: string;
}

export const SPELLS: Record<SpellId, SpellDef> = {
  fire: { name: 'Firebolt', cost: 3, level: 1, desc: 'Burns the first foe ahead, up to 8 cells.' },
  frost: { name: 'Frost', cost: 4, level: 3, desc: 'Freezes the first foe ahead (up to 8 cells) for 3 turns. The Warden: 1 turn, once between waves.' },
  heal: { name: 'Mend', cost: 8, level: 5, desc: 'Restore half your health.' },
  blink: { name: 'Blink', cost: 4, level: 7, desc: 'Teleport up to 4 cells forward (stops short of walls and foes).' },
};

/**
 * The Warden's patterns (the boss's `atk` is its plain melee blow). Every `chargeEvery`-th action, if you're
 * near, it draws in the cold (a tell), then looses a wave down its row and column (`reach` cells, stopped by
 * walls and pillars) that always lands for `blast`; after the wave it is spent for `rest` turns. At each
 * share of its HP in `summonAt` it calls up `summon` (near it, never beside you) and is spent for a turn. Only its
 * ordinary actions count toward the next wave, so it still swings at you between them. Below half its HP it
 * swings softer (`meleeLate`) and waves come every `chargeLate`-th action. It never charges while you have no
 * cell to dodge into. Frost holds it for one action, once between waves, and never while it charges.
 */
export const WARDEN: {
  chargeEvery: number;
  chargeLate: number;
  meleeLate: number;
  reach: number;
  blast: number;
  rest: number;
  summonAt: number[];
  summon: MonsterKind[];
} = {
  chargeEvery: 4,
  chargeLate: 3,
  meleeLate: 21,
  reach: 5,
  blast: 34,
  rest: 1,
  summonAt: [0.66, 0.33],
  summon: ['ghoul', 'skeleton', 'skeleton'],
};

/** Descent+: foes have this much more HP and hit this much harder. */
export const PLUS_HP = 1.1;
export const PLUS_ATK = 1;

/** Firebolt and Frost reach this many cells ahead. */
export const BOLT_RANGE = 8;
/** With no awake foe in sight you get 1 HP back every REGEN_EVERY turns, up to REGEN_CAP of your max HP. */
export const REGEN_EVERY = 4;
export const REGEN_CAP = 0.5;
/** Chance a slain foe leaves something (POTION_SHARE of drops are potions, the rest gold); rarer from depth LEAN_FROM. */
export const DROP_CHANCE = 0.18;
export const DROP_CHANCE_DEEP = 0.07;
export const POTION_SHARE = 0.4;
export const LEAN_FROM = 5;

/** Share of floor items that are potions (natural regen covers the small wounds now). */
export const ITEM_POTION = 0.08;

export const POTION_HEAL = 0.5;
export const ETHER_MP = 6;
export const MAX_DEPTH = 10;
/** Gold a cutpurse snatches per depth (capped by what you carry). */
export const THEFT_PER_DEPTH = 12;
/** Total XP needed to reach level i + 1. */
export const XP_TABLE = [0, 15, 55, 120, 210, 360, 560, 900, 1300, 1800, 2400, 3100];

/** Depths where a merchant waits at the foot of the stairs. */
export const SHOP_DEPTHS = [4, 7];
/** Max HP a vigor draught adds. */
export const VIGOR_HP = 6;
export const GEAR_PRICE = [0, 60, 110, 170, 240];

export function fireDamage(level: number): number {
  return 5 + level * 2;
}
