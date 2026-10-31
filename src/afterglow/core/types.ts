// Afterglow simulation types. The sim is deterministic: fixed 60 Hz steps,
// seeded randomness, and the player's joystick as the only input.

import type { Rng } from '../../shared/rng';
import type { SpatialHash } from './spatial';

export type EnemyKind =
  | 'drone'
  | 'mite'
  | 'brute'
  | 'dart'
  | 'spitter'
  | 'splitter'
  | 'bloater'
  | 'orbiter'
  | 'warden'
  | 'prism'
  | 'eclipse';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  /** Knockback velocity (decays). */
  kx: number;
  ky: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  dmg: number;
  xp: number;
  elite: boolean;
  /** Seconds of white hit-flash left (render only). */
  flash: number;
  /** Behavior timer and phase. */
  t: number;
  phase: number;
  /** Telegraph target / heading for dashes and beams. */
  ax: number;
  ay: number;
  /** Where a telegraphed slam will land. */
  sx: number;
  sy: number;
  /** Shielded by a nearby warden this tick. */
  shielded: boolean;
  /** Slowed by an aura this tick (multiplier). */
  slow: number;
  alive: boolean;
}

export type WeaponId =
  | 'pulse'
  | 'orbit'
  | 'nova'
  | 'arc'
  | 'lance'
  | 'mines'
  | 'ricochet'
  | 'halo'
  | 'storm'
  | 'corona'
  | 'supernova'
  | 'tempest'
  | 'railgun'
  | 'minefield'
  | 'pinball'
  | 'sanctum';

export type PassiveId =
  | 'might'
  | 'haste'
  | 'reach'
  | 'velocity'
  | 'multicast'
  | 'duration'
  | 'swift'
  | 'vitality'
  | 'regen'
  | 'magnet';

export interface WeaponState {
  id: WeaponId;
  level: number;
  cd: number;
  /** Free-form per-weapon state (orbit angle, burst counters...). */
  t: number;
  dealt: number;
}

export interface Shot {
  weapon: WeaponId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  /** Enemies it can still hit. */
  pierce: number;
  life: number;
  knock: number;
  /** Ids already hit (no double hits). */
  hit: number[];
  /** Homing strength (0 = straight). */
  homing: number;
  /** Ricochet bounces left. */
  bounces: number;
  /** Splits on bounce (pinball). */
  split: boolean;
  alive: boolean;
}

export interface Mine {
  weapon: WeaponId;
  x: number;
  y: number;
  arm: number;
  life: number;
  r: number;
  blast: number;
  dmg: number;
  alive: boolean;
}

export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  dmg: number;
  life: number;
  alive: boolean;
}

export type PickupKind = 'gem' | 'heart' | 'magnet' | 'bomb' | 'chest' | 'shard';

export interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  value: number;
  /** Flying toward the player. */
  pulled: boolean;
  alive: boolean;
}

export interface Stats {
  maxHp: number;
  regen: number;
  armor: number;
  speed: number;
  might: number;
  haste: number;
  area: number;
  velocity: number;
  amount: number;
  duration: number;
  magnet: number;
  greed: number;
}

export interface Player {
  x: number;
  y: number;
  hp: number;
  /** Last non-zero move direction (for aimed weapons). */
  fx: number;
  fy: number;
  /** Invulnerability seconds after a hit. */
  iframes: number;
  level: number;
  xp: number;
  revives: number;
}

/** Things the renderer animates (particles, rings, beams). */
export type FxEvent =
  | { type: 'hit'; x: number; y: number; color: number; dmg: number }
  | { type: 'kill'; x: number; y: number; kind: EnemyKind; elite: boolean }
  | { type: 'ring'; x: number; y: number; r: number; color: number }
  | { type: 'beam'; x1: number; y1: number; x2: number; y2: number; w: number; color: number }
  | { type: 'chain'; pts: number[]; color: number }
  | { type: 'boom'; x: number; y: number; r: number; color: number }
  | { type: 'hurt'; dmg: number }
  | { type: 'pickup'; kind: PickupKind }
  | { type: 'levelUp' }
  | { type: 'warn'; text: string };

export interface Choice {
  kind: 'weapon' | 'passive' | 'gold';
  id: WeaponId | PassiveId | 'gold';
  /** Level after taking it (1 = new). */
  level: number;
  evolves?: WeaponId;
}

export interface World {
  seed: number;
  rng: Rng;
  /** Elapsed sim time, seconds. */
  time: number;
  tick: number;
  character: string;
  base: Stats;
  stats: Stats;
  player: Player;
  weapons: WeaponState[];
  passives: Partial<Record<PassiveId, number>>;
  enemies: Enemy[];
  shots: Shot[];
  mines: Mine[];
  bullets: Bullet[];
  pickups: Pickup[];
  nextId: number;
  kills: number;
  shards: number;
  /** Level-ups waiting for the player to choose. */
  pendingLevels: number;
  choices: Choice[];
  rerolls: number;
  banishes: number;
  /** Upgrade ids removed from the pool for this run. */
  banished: string[];
  /** Chest rewards waiting to be shown. */
  chestQueue: number;
  /** Director bookkeeping. */
  spawnAcc: number;
  eventsDone: string[];
  boss: number | null;
  status: 'playing' | 'dead' | 'won';
  fx: FxEvent[];
  /** Enemy lookup grid, rebuilt every tick. */
  grid: SpatialHash;
  /** Per-weapon hit cooldowns: `${weapon}:${enemyId}` -> time of next allowed hit. */
  hitCd: Map<string, number>;
  /** Render-only: orbiting blade positions and auras from this step. */
  blades: { x: number; y: number; r: number; hue: number }[];
  auras: { r: number; hue: number }[];
  /** Damage dealt per weapon (for the results screen). */
  dealt: Partial<Record<WeaponId, number>>;
}
