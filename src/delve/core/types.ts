// Delve: a turn-based first-person dungeon crawl rendered in ASCII.

/** Facing: 0 north, 1 east, 2 south, 3 west. */
export type Dir = 0 | 1 | 2 | 3;

export const DX = [0, 1, 0, -1] as const;
export const DY = [-1, 0, 1, 0] as const;

export type Tile = 'wall' | 'floor' | 'door' | 'open' | 'stairs' | 'pillar';

export type MonsterKind = 'rat' | 'bat' | 'skeleton' | 'archer' | 'slime' | 'ghoul' | 'wraith' | 'golem' | 'mage' | 'warden';

export interface Monster {
  id: number;
  kind: MonsterKind;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  /** Turns until it may act again (slow monsters skip turns). */
  wait: number;
  /** Has it noticed the player? */
  awake: boolean;
  /** Turns of being stunned / frozen. */
  stun: number;
}

export type ItemKind =
  | 'potion'
  | 'ether'
  | 'scroll-fire'
  | 'scroll-frost'
  | 'scroll-blink'
  | 'gold'
  | 'weapon'
  | 'armor'
  | 'key';

export interface Item {
  id: number;
  kind: ItemKind;
  x: number;
  y: number;
  /** Gold amount, or gear tier. */
  value: number;
}

export type SpellId = 'fire' | 'frost' | 'blink' | 'heal';

export interface Player {
  x: number;
  y: number;
  dir: Dir;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  level: number;
  xp: number;
  baseAtk: number;
  baseDef: number;
  weapon: number;
  armor: number;
  gold: number;
  potions: number;
  ethers: number;
  spells: SpellId[];
}

export interface Level {
  w: number;
  h: number;
  tiles: Tile[];
  /** Explored cells (for the minimap). */
  seen: boolean[];
}

export interface GameState {
  seed: number;
  depth: number;
  turn: number;
  rolls: number;
  level: Level;
  player: Player;
  monsters: Monster[];
  items: Item[];
  nextId: number;
  log: string[];
  status: 'playing' | 'dead' | 'won';
  kills: number;
}

export type Action =
  | { type: 'forward' }
  | { type: 'back' }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'strafeL' }
  | { type: 'strafeR' }
  | { type: 'use' }
  | { type: 'wait' }
  | { type: 'potion' }
  | { type: 'ether' }
  | { type: 'cast'; spell: SpellId };

export type GameEvent =
  | { type: 'move' }
  | { type: 'turn'; dir: Dir }
  | { type: 'bump' }
  | { type: 'hit'; target: number; dmg: number; crit: boolean }
  | { type: 'miss'; target: number }
  | { type: 'hurt'; dmg: number; by: MonsterKind }
  | { type: 'kill'; kind: MonsterKind }
  | { type: 'bolt'; spell: SpellId; dist: number }
  | { type: 'pickup'; text: string }
  | { type: 'door' }
  | { type: 'descend'; depth: number }
  | { type: 'levelUp'; level: number }
  | { type: 'shot'; by: MonsterKind }
  | { type: 'death' }
  | { type: 'win' };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
