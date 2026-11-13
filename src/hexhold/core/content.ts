// Hexhold content: towers (each with a gift to its six neighbors), enemies,
// and the shape of the 30 waves.

export type TowerId = 'bolt' | 'mortar' | 'frost' | 'tesla' | 'flame' | 'beacon';
export type EnemyId = 'runner' | 'grunt' | 'brute' | 'swarm' | 'flyer' | 'healer' | 'splitter' | 'digger' | 'boss';

export interface TowerDef {
  id: TowerId;
  name: string;
  cost: number;
  /** Range in cells (hex steps). */
  range: number;
  /** Seconds between shots (0 = continuous aura). */
  rate: number;
  dmg: number;
  /** Can it hit flying enemies on its own? */
  air: boolean;
  /** What it does, and what it gives the towers next to it. */
  text: string;
  aura: string;
  color: string;
}

export const TOWERS: Record<TowerId, TowerDef> = {
  bolt: { id: 'bolt', name: 'Bolt', cost: 50, range: 2.6, rate: 0.75, dmg: 11, air: true, color: '#7ad7ff',
    text: 'Fast shots at one enemy. Hits flyers.', aura: 'Neighbors can hit flyers too.' },
  mortar: { id: 'mortar', name: 'Mortar', cost: 90, range: 3.6, rate: 2.0, dmg: 30, air: false, color: '#ffb35c',
    text: 'Slow shells that burst on a group.', aura: 'Neighbors reach half a cell further.' },
  frost: { id: 'frost', name: 'Frost', cost: 70, range: 1.8, rate: 0, dmg: 2, air: true, color: '#b9e6ff',
    text: 'Chills everything nearby: 40% slower.', aura: 'Neighbors deal +30% to chilled enemies.' },
  tesla: { id: 'tesla', name: 'Tesla', cost: 110, range: 2.6, rate: 1.2, dmg: 17, air: true, color: '#c9a2ff',
    text: 'Lightning that leaps to 3 enemies.', aura: "Every neighbor's 4th hit stuns for half a second." },
  flame: { id: 'flame', name: 'Flame', cost: 80, range: 1.5, rate: 0, dmg: 22, air: false, color: '#ff6b3d',
    text: 'Burns everything close by, every moment.', aura: 'Neighbors set enemies alight (burn).' },
  beacon: { id: 'beacon', name: 'Beacon', cost: 100, range: 0, rate: 0, dmg: 0, air: false, color: '#ffe27a',
    text: 'Does not attack. Each level boosts its neighbors more (+20/30/40%).', aura: 'Neighbors deal +20% damage (more per level).' },
};
export const TOWER_IDS = Object.keys(TOWERS) as TowerId[];
export const MAX_LEVEL = 3;

/** At level 3 a tower can specialize into one of two forms. */
export interface SpecDef {
  name: string;
  text: string;
  dmg?: number;
  /** Multiplier on seconds between shots. */
  rate?: number;
  range?: number;
  /** Mortar: wider bursts. */
  splash?: number;
  /** Ignores armor. */
  pierce?: boolean;
  /** Tesla: extra jumps. */
  chain?: number;
  /** Tesla: every hit stuns. */
  stunAll?: boolean;
  /** Frost: deep chill (enemies 60% slower instead of 40%). */
  deep?: boolean;
  /** Flame: its own fire sets enemies alight. */
  napalm?: boolean;
  /** Beacon: neighbors' damage bonus, and extra reach in cells. */
  boost?: number;
  reach?: number;
}

export const SPECS: Record<TowerId, [SpecDef, SpecDef]> = {
  bolt: [
    { name: 'Longbow', text: 'Heavy shots from far away: ×2.4 damage, +50% range, 1.8× slower.', dmg: 2.4, rate: 1.8, range: 1.5 },
    { name: 'Repeater', text: 'A stream of bolts: 3× as fast at ×0.55 damage.', dmg: 0.55, rate: 0.33 },
  ],
  mortar: [
    { name: 'Siege', text: 'Shells punch through armor and hit ×1.7 harder.', dmg: 1.7, pierce: true },
    { name: 'Cluster', text: 'Bursts 1.7× wider that shred swarms, ×1.1 damage.', dmg: 1.1, splash: 1.7 },
  ],
  frost: [
    { name: 'Glacier', text: 'Deep chill: 60% slower instead of 40%, and a wider aura.', deep: true, range: 1.25 },
    { name: 'Hail', text: 'A storm of ice that really hurts (×6 damage).', dmg: 6 },
  ],
  tesla: [
    { name: 'Storm', text: 'Lightning leaps to 6 enemies, ×1.2 damage.', chain: 3, dmg: 1.2 },
    { name: 'Overload', text: 'Every strike stuns (0.3 s), ×1.5 damage.', stunAll: true, dmg: 1.5 },
  ],
  flame: [
    { name: 'Inferno', text: 'A bigger, hotter blaze: ×1.5 damage and range.', dmg: 1.5, range: 1.5 },
    { name: 'Napalm', text: 'Its fire clings: enemies keep burning after they pass. ×1.15 damage.', napalm: true, dmg: 1.15 },
  ],
  beacon: [
    { name: 'Banner', text: 'Neighbors deal +60% damage.', boost: 1.6 },
    { name: 'Lighthouse', text: 'Neighbors deal +40% and reach a whole cell further.', boost: 1.4, reach: 1 },
  ],
};
export const specCost = (id: TowerId) => Math.round(TOWERS[id].cost * 1.8);
/** Upgrade cost from level L to L+1, as a share of the build cost. */
export const upgradeCost = (id: TowerId, level: number) => Math.round(TOWERS[id].cost * (level === 1 ? 0.8 : 1.3));
/** Damage and range multipliers per level. */
export const LEVEL_DMG = [0, 1, 1.6, 2.5];
export const LEVEL_RANGE = [0, 1, 1.1, 1.2];
export const SELL_BACK = 0.7;

export interface EnemyDef {
  id: EnemyId;
  name: string;
  hp: number;
  /** Cells per second. */
  speed: number;
  /** Flat damage taken off every hit. */
  armor: number;
  bounty: number;
  /** Lives lost if it reaches the core. */
  leak: number;
  fly?: boolean;
  /** Digs the shortest way under towers (rock still stops it); can't be hit while under one. */
  dig?: boolean;
  /** Heals others within 1.5 cells, per second. */
  heal?: number;
  /** Splits into this many runners when it dies. */
  split?: number;
  /** First wave it can appear in. */
  from: number;
  text: string;
  color: string;
}

export const ENEMIES: Record<EnemyId, EnemyDef> = {
  runner: { id: 'runner', name: 'Runner', hp: 26, speed: 1.7, armor: 0, bounty: 3, leak: 1, from: 1, color: '#ff8a8a', text: 'Quick and frail.' },
  grunt: { id: 'grunt', name: 'Grunt', hp: 60, speed: 1.0, armor: 0, bounty: 4, leak: 1, from: 1, color: '#e0a060', text: 'Steady.' },
  swarm: { id: 'swarm', name: 'Mite', hp: 12, speed: 1.4, armor: 0, bounty: 1, leak: 1, from: 4, color: '#ffd166', text: 'A swarm of tiny foes. Splash towers (Mortar, Flame, Tesla) shred them; lone Bolts get swamped.' },
  brute: { id: 'brute', name: 'Brute', hp: 190, speed: 0.65, armor: 4, bounty: 11, leak: 2, from: 6, color: '#b07850', text: 'Armored: each hit loses 4 damage. Big hits work best.' },
  flyer: { id: 'flyer', name: 'Wisp', hp: 44, speed: 1.2, armor: 0, bounty: 5, leak: 1, fly: true, from: 5, color: '#9ef0d8', text: 'Flies straight over your maze. Only some towers hit it.' },
  healer: { id: 'healer', name: 'Mender', hp: 80, speed: 0.9, armor: 1, bounty: 8, leak: 1, heal: 7, from: 8, color: '#7cff9a', text: 'Heals nearby enemies. Kill it first.' },
  splitter: { id: 'splitter', name: 'Splitter', hp: 95, speed: 0.95, armor: 0, bounty: 6, leak: 1, split: 3, from: 10, color: '#d88cff', text: 'Bursts into three runners.' },
  digger: { id: 'digger', name: 'Burrower', hp: 125, speed: 0.8, armor: 2, bounty: 8, leak: 2, dig: true, from: 12, color: '#8fa8ff', text: "Ignores your maze: it digs the straight way (blue diamonds) and can't be hit while under a tower. Cover its line with open ground." },
  boss: { id: 'boss', name: 'Colossus', hp: 1050, speed: 0.45, armor: 7, bounty: 120, leak: 6, from: 10, color: '#ff5a5a', text: 'A giant that comes every tenth wave. Armored, slow, and it costs 6 lives if it reaches your core. Have big hits ready.' },
};
export const ENEMY_IDS = Object.keys(ENEMIES) as EnemyId[];

export const WAVES = 30;
export const START_GOLD = 210;
/** Extra starting gold on two-portal maps. */
export const TWIN_GOLD = 60;
export const START_LIVES = 20;
/** Extra health per wave from wave 11 to 24: steady pressure through the middle game,
 *  then only the compounding growth, so waves 25-30 don't spike. */
export const LATE_GROWTH = 0.1;
export const LATE_FROM = 11;
export const LATE_WAVES = 13;
/** Most a wave's end bonus pays as interest on gold you keep (5% of it). */
export const INTEREST_CAP = 15;
/** Enemy health grows this much per wave (compounding). */
export const HP_GROWTH = 0.098;
/** Status effects. */
export const CHILL = 0.6;
export const BURN_DPS = 6;
export const BURN_TIME = 3;
export const STUN_TIME = 0.5;
