// What the Last Light UI needs from a night's story module. Each night is a
// pure, deterministic module: (actions) -> state + text.

import type { Hint } from './hints';

export interface Choice {
  /** The action, as a token for replays. */
  id: string;
  label: string;
  /** What it's about (exits are 'go'; things and people by name). */
  about: string;
}

export interface Ending {
  title: string;
  text: string[];
  stars: number;
}

export interface StoryState {
  room: string;
  /** Actions taken so far (each is three minutes). */
  t: number;
  over: Ending | null;
}

export interface Story<S extends StoryState = StoryState> {
  /** 1, 2, … */
  night: number;
  /** A short name for the menu, e.g. "The storm". */
  name: string;
  RULES_VERSION: number;
  /** Store key of the run in progress. */
  saveKey: string;
  /** Prefix of bug reports. */
  reportTag: string;
  intro: string[];
  /** Help card bullet about the deadline (may hold <b>). */
  deadline: string;
  /** What the three stars are for. */
  stars: string;
  /** "Back to ten o’clock in the cottage." */
  restartLine: string;
  /** Subjects shown under People. */
  people: string[];
  newGame(): S;
  choices(s: S): Choice[];
  act(s: S, id: string): string[] | null;
  describe(s: S): string[];
  clock(s: S): string;
  roomName(s: S): string;
  /** The name on a subject's chip (an item, a person, a thing here). */
  subjectName(s: S, k: string): string;
  /** Is this subject something you're carrying? */
  carried(s: S, k: string): boolean;
  /** Who is walking with you (shown above the choices). */
  company(s: S): string[];
  /** Time is short and the main job isn't done (the clock turns red). */
  late(s: S): boolean;
  /** The next useful step, as a nudge and a plain pointer (null once the night is over). */
  hint(s: S): Hint | null;
}
