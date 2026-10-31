// Glyphwright: build spells from runes on a loom, then watch them defend
// your tower. Deterministic: seeded shop and waves, fixed-step battles.

export type CasterId = 'bolt' | 'beam' | 'nova' | 'rain' | 'orb';
export type ModId = 'fire' | 'frost' | 'storm' | 'split' | 'heavy' | 'pierce' | 'haste' | 'leech' | 'gild' | 'echo';
export type RuneId = CasterId | ModId;
export type Element = 'arcane' | 'fire' | 'frost' | 'storm';

export interface Rune {
  id: RuneId;
  tier: 1 | 2 | 3;
}

/** A compiled spell: everything a row of the loom does when it fires. */
export interface Spell {
  caster: CasterId;
  element: Element;
  dmg: number;
  count: number;
  pierce: number;
  chain: number;
  /** Fraction of speed removed for 2s. */
  slow: number;
  /** Fire damage per second for 3s. */
  burn: number;
  area: number;
  cooldown: number;
  leech: number;
  gild: number;
  /** Extra casts: each echo is a copy of the spell as built up to that rune. */
  echoes: Spell[];
}

export type EnemyKind = 'imp' | 'knight' | 'wisp' | 'golem' | 'splitter' | 'mender' | 'drake' | 'warden' | 'colossus' | 'lich';

export interface Enemy {
  id: number;
  kind: EnemyKind;
  /** Lane coordinates: x 0..1 across, y 0 (top) .. 1 (the tower). */
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  shield: number;
  speed: number;
  slow: number;
  slowT: number;
  burn: number;
  burnT: number;
  alive: boolean;
  flash: number;
}

export interface Projectile {
  row: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  spell: Spell;
  pierce: number;
  hit: number[];
  life: number;
  homing: boolean;
  alive: boolean;
}

export type BattleFx =
  | { type: 'hit'; x: number; y: number; element: Element; dmg: number }
  | { type: 'kill'; x: number; y: number; kind: EnemyKind; gold: number }
  | { type: 'beam'; x: number; element: Element }
  | { type: 'nova'; r: number; element: Element }
  | { type: 'strike'; x: number; y: number; element: Element }
  | { type: 'chain'; pts: number[]; element: Element }
  | { type: 'leak'; dmg: number }
  | { type: 'cast'; row: number };

export interface Battle {
  t: number;
  enemies: Enemy[];
  projectiles: Projectile[];
  /** Spawn queue: [time, kind, x]. */
  queue: [number, EnemyKind, number][];
  cooldowns: number[];
  /** Pending echo casts: [time, row, spell]. */
  echoQueue: [number, number, Spell][];
  nextId: number;
  goldEarned: number;
  kills: number;
  leaked: number;
  fx: BattleFx[];
  over: boolean;
}

export interface Offer {
  rune: Rune;
  sold: boolean;
}

export interface GameState {
  seed: number;
  wave: number;
  gold: number;
  hp: number;
  maxHp: number;
  /** 3 rows × 4 slots; slot 0 holds a caster, slots 1-3 modifiers. */
  loom: (Rune | null)[][];
  bench: (Rune | null)[];
  shop: Offer[];
  rerolls: number;
  /** Shop rolls so far (seeds each roll). */
  rolls: number;
  phase: 'build' | 'battle' | 'over' | 'won';
  battle: Battle | null;
  totalKills: number;
  /** Keep the current shop into the next wave (no free roll). */
  frozen: boolean;
}

/** Where a rune lives. */
export type Slot = { area: 'loom'; row: number; col: number } | { area: 'bench'; i: number } | { area: 'shop'; i: number };
