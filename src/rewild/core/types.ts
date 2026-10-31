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
  /** Progress text, e.g. "4/10". */
  target: number;
  done: boolean;
  reward: number;
}

export interface SeasonLog {
  season: number;
  species: number;
  life: number;
  points: number;
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
  /** Rerolls of the hand left. */
  rerolls: number;
  over: boolean;
}

export type Action = { type: 'place'; card: number; cell: number } | { type: 'reroll' } | { type: 'pass' };

/** What happened during a season, for animation and the report. */
export type SimEvent =
  | { type: 'grow'; cell: number; id: SpeciesId }
  | { type: 'spread'; from: number; to: number; id: SpeciesId }
  | { type: 'shrink'; cell: number; id: SpeciesId }
  | { type: 'die'; cell: number; id: SpeciesId; why: string }
  | { type: 'move'; from: number; to: number; id: AnimalId }
  | { type: 'eat'; cell: number; prey: number; id: AnimalId }
  | { type: 'terraform'; cell: number; from: Terrain; to: Terrain }
  | { type: 'enrich'; cell: number; fert: number }
  | { type: 'burn'; cell: number }
  | { type: 'goal'; id: string };
