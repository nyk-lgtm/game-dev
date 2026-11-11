// Rewild: bring a barren island back to life, one species a season.
// Pure and deterministic: (state, action) -> state. All randomness comes from
// the seed (island shape, card deals, weather).

import type { Hex } from '../../shared/hex';

export type Terrain = 'sea' | 'shallows' | 'sand' | 'rock' | 'soil' | 'marsh' | 'pond';

export type PlantId = 'lichen' | 'grass' | 'flowers' | 'shrub' | 'tree' | 'reeds' | 'fungi';
export type AnimalId = 'bees' | 'rabbit' | 'deer' | 'fox' | 'wolf' | 'songbird' | 'frog' | 'beaver';
export type SpeciesId = PlantId | AnimalId;

/** A population on a cell: n is its size, 1..3. */
export interface Pop<T extends SpeciesId = SpeciesId> {
  id: T;
  n: number;
  /** Seasons since it arrived on this cell. */
  age: number;
}

export interface Cell {
  hex: Hex;
  t: Terrain;
  /** Soil richness 0..3. */
  fert: number;
  plant: Pop<PlantId> | null;
  animal: Pop<AnimalId> | null;
  /** Seasons until a burnt cell stops showing ash (visual + no regrowth that season). */
  burnt: number;
}

export type Weather = 'fair' | 'drought' | 'fire' | 'storm' | 'harsh';

export interface Goal {
  id: string;
  text: string;
  target: number;
  /** Current progress (best so far for "at once" goals). */
  progress: number;
  done: boolean;
  reward: number;
}

export interface Stats {
  /** Rock or sand turned into soil. */
  soilMade: number;
  /** Ponds dammed by beavers. */
  pondsMade: number;
  /** Cells burnt by wildfire. */
  burnt: number;
  /** Seasons that ended with wolves and deer both alive. */
  wolfDeer: number;
  /** Most species alive at once. */
  maxSpecies: number;
  /** Seasons in a row each species has been alive at season's end. */
  streak: Partial<Record<SpeciesId, number>>;
}

export interface SeasonLog {
  season: number;
  species: number;
  life: number;
  points: number;
  /** Settled species this season (alive SETTLE_AFTER seasons in a row) and their bonus. */
  settled: number;
  weather: Weather;
  /** Notable things that happened, for the season report. */
  notes: string[];
}

export interface GameState {
  seed: number;
  cells: Cell[];
  /** Index of the season about to be played, 0..SEASONS-1. */
  season: number;
  hand: SpeciesId[];
  /** Weather for the season about to be played (announced in advance). */
  weather: Weather;
  /** Cell where fire will start, when weather is 'fire' (-1 otherwise). */
  fireAt: number;
  score: number;
  goals: Goal[];
  log: SeasonLog[];
  /** Cards that can still be played this season. */
  plays: number;
  /** Rerolls of the hand left. */
  rerolls: number;
  /** Hands dealt so far (salts the deal so rerolls differ). */
  deals: number;
  /** Highest card tier unlocked (1..3). */
  tier: number;
  stats: Stats;
  over: boolean;
}

export type Action = { type: 'place'; card: number; cell: number } | { type: 'reroll' } | { type: 'end' };

/** Why a population shrank or died. */
export type Cause = 'burnt' | 'too dry' | 'unsuited' | 'hunted' | 'flooded' | 'starved' | 'hungry' | 'no home';

/** What happened during a season, for animation and the report. */
export type SimEvent =
  | { type: 'grow'; cell: number; id: SpeciesId }
  | { type: 'spread'; from: number; to: number; id: SpeciesId }
  | { type: 'shrink'; cell: number; id: SpeciesId; why: Cause; by?: AnimalId }
  | { type: 'die'; cell: number; id: SpeciesId; why: Cause; by?: AnimalId }
  | { type: 'move'; from: number; to: number; id: AnimalId }
  | { type: 'eat'; cell: number; prey: number; id: AnimalId }
  | { type: 'terraform'; cell: number; from: Terrain; to: Terrain }
  | { type: 'enrich'; cell: number; fert: number }
  | { type: 'burn'; cell: number }
  | { type: 'goal'; id: string }
  | { type: 'unlock'; tier: number };
