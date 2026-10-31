// Nightline: a pseudo-3D arcade racer rendered in ASCII.

export type BiomeId = 'city' | 'desert' | 'forest' | 'snow' | 'coast';

export type PropKind = 'palm' | 'pine' | 'lamp' | 'sign' | 'rock' | 'cactus' | 'tower' | 'snowpine' | 'billboard' | 'buoy' | 'fork';

export interface Prop {
  kind: PropKind;
  /** Lateral offset in road half-widths (beyond ±1 is roadside). */
  offset: number;
  /** Text for signs. */
  text?: string;
}

export interface Segment {
  index: number;
  /** World z at the segment's start. */
  z: number;
  /** Curvature applied while crossing this segment. */
  curve: number;
  /** Height at the segment's far end. */
  y: number;
  biome: BiomeId;
  props: Prop[];
}

export interface Car {
  id: number;
  /** Lateral position in road half-widths. */
  x: number;
  z: number;
  speed: number;
  kind: number;
}

export interface Stage {
  biome: BiomeId;
  /** Segment index where this stage starts and the checkpoint at its end. */
  start: number;
  end: number;
  /** Seconds added when you reach this stage. */
  bonus: number;
}

export interface Player {
  x: number;
  z: number;
  speed: number;
  /** Seconds of nitro boost left in the tank. */
  nitro: number;
  boosting: boolean;
  /** Spin-out / crash recovery seconds. */
  stun: number;
  /** Steering visual (-1..1). */
  steer: number;
}

export interface Race {
  seed: number;
  time: number;
  /** Seconds left on the clock. */
  clock: number;
  segments: Segment[];
  stages: Stage[];
  stage: number;
  /** Choice made at each fork so far: 0 left, 1 right. */
  route: number[];
  player: Player;
  cars: Car[];
  nextCarId: number;
  score: number;
  passed: number;
  crashes: number;
  status: 'racing' | 'over' | 'finished';
  /** Events for audio/visual feedback. */
  fx: RaceFx[];
}

export type RaceFx =
  | { type: 'checkpoint'; stage: number; bonus: number }
  | { type: 'crash'; hard: boolean }
  | { type: 'pass' }
  | { type: 'offroad' }
  | { type: 'boost' }
  | { type: 'finish' }
  | { type: 'timeout' };

export interface Input {
  /** -1..1 steering. */
  steer: number;
  boost: boolean;
  brake: boolean;
}
