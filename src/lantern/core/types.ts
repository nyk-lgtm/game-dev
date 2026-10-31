export interface Pos {
  x: number;
  y: number;
}

export type MapId = 'village' | 'forest' | 'cave1' | 'cave2';

/** Terrain characters used in map strings (entity markers are replaced by the map's ground). */
export type Terrain = '#' | '.' | ',' | 'T' | '~' | '=' | '+' | '_' | '>' | '<';

export type MonsterKind = 'rat' | 'wolf' | 'goblin' | 'bat' | 'spider' | 'skeleton' | 'king';
export type NpcId = 'elder' | 'smith' | 'healer' | 'child' | 'hermit';
export type ItemId = 'sword' | 'axe' | 'leather' | 'chain' | 'potion' | 'ember';

export interface Monster {
  id: number;
  kind: MonsterKind;
  map: MapId;
  pos: Pos;
  hp: number;
}

export interface Player {
  pos: Pos;
  map: MapId;
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  baseAtk: number;
  baseDef: number;
  gold: number;
  potions: number;
  weapon: 'dagger' | 'sword' | 'axe';
  armor: 'cloth' | 'leather' | 'chain';
}

export interface GameState {
  seed: number;
  turn: number;
  /** Counter for seeded dice rolls (combat, wandering). */
  rolls: number;
  player: Player;
  monsters: Monster[];
  /** Chests opened and one-time gifts given, by id. */
  done: string[];
  quest: 'none' | 'started' | 'ember' | 'won';
  /** Explored cells of dark maps: one '0'/'1' char per cell. */
  seen: Partial<Record<MapId, string>>;
  log: string[];
  deaths: number;
}

export type Action =
  | { type: 'step'; dir: number }
  | { type: 'wait' }
  | { type: 'potion' }
  | { type: 'buy'; item: 'sword' | 'leather' | 'chain' | 'potion' }
  | { type: 'rest' };

export type GameEvent =
  | { type: 'move'; from: Pos; to: Pos }
  | { type: 'hit'; at: Pos; dmg: number; onPlayer: boolean }
  | { type: 'miss'; at: Pos }
  | { type: 'kill'; at: Pos; kind: MonsterKind }
  | { type: 'talk'; npc: NpcId }
  | { type: 'read'; text: string }
  | { type: 'loot'; text: string }
  | { type: 'levelUp'; level: number }
  | { type: 'enterMap'; map: MapId }
  | { type: 'playerDown' }
  | { type: 'heal'; amount: number }
  | { type: 'win' };

export interface StepResult {
  state: GameState;
  events: GameEvent[];
}
