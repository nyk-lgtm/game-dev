// Glyphwright bots and the run harness shared by the balance probe and tests.
//
// A Player takes build-phase turns through `act`, which applies an Action and
// records its token, so every bot run is also a replayable action string.
//   naive  — buys whatever it can afford, auto-placed; never plans (the floor).
//   smart  — see smart.ts: values merges, orders modifiers, banks interest.
import {
  RUNES,
  Rng,
  apply,
  compileRow,
  encode,
  finishBattle,
  mixSeed,
  newGame,
  price,
  spellDps,
  type Action,
  type CasterId,
  type GameState,
  type RuneId,
} from '../../src/glyph/core';
import { evalRow, profileFor, smartPlayer } from './smart';

export type Act = (a: Action) => boolean;

export interface Player {
  name: string;
  /** One build phase. Must not start the battle (the harness does). */
  turn(s: GameState, act: Act, rng: Rng): void;
}

export interface WaveLog {
  wave: number;
  /** Battle length in seconds of game time. */
  t: number;
  hpLost: number;
  goldEarned: number;
  goldBefore: number;
  kills: number;
}

export interface RunResult {
  seed: number;
  s: GameState;
  actions: string;
  log: WaveLog[];
  won: boolean;
  /** Wave the run ended on (15 if won). */
  reached: number;
  /** Caster of the strongest row at the end. */
  primary: CasterId | null;
  dps: number[];
}

export function runGame(seed: number, player: Player, maxWaves = 99): RunResult {
  const s = newGame(seed);
  const rng = new Rng(mixSeed(seed, 4242));
  const tokens: string[] = [];
  const act: Act = (a) => {
    if (!apply(s, a)) return false;
    tokens.push(encode(a));
    return true;
  };
  const log: WaveLog[] = [];
  while (s.phase === 'build' && log.length < maxWaves) {
    player.turn(s, act, rng);
    const goldBefore = s.gold;
    const hp = s.hp;
    const wave = s.wave;
    if (!act({ t: 'fight' })) throw new Error(`bot ${player.name} could not fight (seed ${seed})`);
    finishBattle(s);
    const b = s.battle!;
    log.push({ wave, t: b.t, hpLost: hp - Math.max(0, s.hp), goldEarned: b.goldEarned, goldBefore, kills: b.kills });
  }
  const rows = s.loom.map((r) => compileRow(r));
  const dps = rows.map((sp) => (sp ? Math.round(spellDps(sp)) : 0));
  // Primary caster: the row worth most against the last wave faced (bot's model).
  const P = profileFor(seed, Math.min(s.wave, 15), 0);
  let primary: CasterId | null = null;
  let best = -1;
  rows.forEach((sp, i) => {
    const v = evalRow(s.loom[i], P).dps;
    if (sp && v > best) {
      best = v;
      primary = sp.caster;
    }
  });
  return { seed, s, actions: tokens.join(','), log, won: s.phase === 'won', reached: s.wave, primary, dps };
}

/** Buys random affordable runes and lets the game auto-place them. */
export const naivePlayer: Player = {
  name: 'naive',
  turn(s, act, rng) {
    for (let guard = 0; guard < 20; guard++) {
      const options = s.shop.map((o, i) => (!o.sold && price(o.rune) <= s.gold ? i : -1)).filter((i) => i >= 0);
      if (!options.length) break;
      // Some hesitation: it doesn't always spend everything.
      if (rng.next() < 0.2) break;
      if (!act({ t: 'buy', i: rng.pick(options) })) break;
    }
    if (s.gold >= 4 && rng.next() < 0.3) act({ t: 'reroll' });
  },
};

export const PLAYERS: Record<string, Player> = {
  naive: naivePlayer,
  smart: smartPlayer(),
};

export function play(seed: number, who = 'smart'): RunResult {
  return runGame(seed, PLAYERS[who]);
}

export const isCaster = (id: RuneId) => RUNES[id].kind === 'caster';
