import { describe, expect, it } from 'vitest';
import {
  BENCH_SIZE,
  DT,
  RULES_VERSION,
  Rng,
  WAVES,
  apply,
  decode,
  encode,
  finishBattle,
  isBoss,
  mixSeed,
  newGame,
  replay,
  startBattle,
  waveQueue,
  waveWindow,
  type Action,
  type GameState,
  type Slot,
} from '../../src/glyph/core';
import { naivePlayer, runGame } from '../../scripts/glyph/bot';
import { smartPlayer } from '../../scripts/glyph/smart';

const json = (s: GameState) => JSON.stringify(s);

describe('waves', () => {
  it('waveQueue is deterministic per seed and wave, sorted, inside the window', () => {
    for (let wave = 1; wave <= WAVES; wave++) {
      const q = waveQueue(42, wave);
      expect(waveQueue(42, wave)).toEqual(q);
      expect(q.length).toBeGreaterThan(0);
      for (let i = 1; i < q.length; i++) expect(q[i][0]).toBeGreaterThanOrEqual(q[i - 1][0]);
      expect(q[q.length - 1][0]).toBeLessThan(waveWindow(wave) + 5);
      for (const [, , x] of q) expect(x).toBeGreaterThan(0);
      const bosses = q.filter(([, k]) => isBoss(k));
      expect(bosses.length).toBe(wave % 5 === 0 ? 1 : 0);
    }
    expect(waveQueue(1, 6)).not.toEqual(waveQueue(2, 6));
    expect(waveQueue(1, 15).some(([, k]) => k === 'lich')).toBe(true);
  });

  it('later waves bring more foes', () => {
    const n = (w: number) => [1, 2, 3, 4, 5].reduce((a, seed) => a + waveQueue(seed, w).length, 0);
    expect(n(12)).toBeGreaterThan(n(6));
    expect(n(6)).toBeGreaterThan(n(1));
  });
});

describe('battle', () => {
  it('ends, pays out, and is deterministic (same seed + actions → identical state)', () => {
    const run = () => {
      const s = newGame(11);
      apply(s, { t: 'buy', i: 0 });
      apply(s, { t: 'fight' });
      let steps = 0;
      while (s.phase === 'battle') {
        finishBattle(s);
        steps++;
      }
      return { s, steps };
    };
    const a = run();
    const b = run();
    expect(a.steps).toBe(1);
    expect(a.s.phase === 'build' || a.s.phase === 'over').toBe(true);
    expect(a.s.battle!.over).toBe(true);
    expect(a.s.battle!.t).toBeGreaterThan(5);
    expect(a.s.battle!.t).toBeLessThan(120);
    // Battles run on a fixed step.
    expect(Math.abs(a.s.battle!.t / DT - Math.round(a.s.battle!.t / DT))).toBeLessThan(1e-6);
    expect(json(a.s)).toBe(json(b.s));
  });

  it('a loom with no caster cannot fight; an undefended tower falls', () => {
    const s = newGame(3);
    s.loom[0][0] = null;
    expect(startBattle(s)).toBe(false);
    s.loom[0][0] = { id: 'bolt', tier: 1 };
    s.wave = 12;
    startBattle(s);
    finishBattle(s);
    expect(s.phase).toBe('over');
    expect(s.hp).toBe(0);
  });

  it('a strong loom clears wave 1 without leaks', () => {
    const s = newGame(9);
    s.loom = [0, 1, 2].map(() => [{ id: 'rain', tier: 3 }, { id: 'haste', tier: 3 }, { id: 'heavy', tier: 3 }, { id: 'echo', tier: 3 }]);
    startBattle(s);
    finishBattle(s);
    expect(s.hp).toBe(s.maxHp);
    expect(s.wave).toBe(2);
    expect(s.totalKills).toBe(waveQueue(9, 1).length);
  });
});

describe('replay encoding', () => {
  const slots: Slot[] = [
    { area: 'loom', row: 0, col: 0 },
    { area: 'loom', row: 2, col: 3 },
    { area: 'bench', i: 0 },
    { area: 'bench', i: BENCH_SIZE - 1 },
  ];
  it('encode/decode round-trips every action', () => {
    const actions: Action[] = [{ t: 'reroll' }, { t: 'freeze' }, { t: 'fight' }];
    for (let i = 0; i < 5; i++) actions.push({ t: 'buy', i });
    for (const a of slots) {
      actions.push({ t: 'buy', i: 2, to: a });
      actions.push({ t: 'sell', at: a });
      for (const b of slots) actions.push({ t: 'move', from: a, to: b });
    }
    for (const a of actions) {
      const tok = encode(a);
      expect(decode(tok)).toEqual(a.t === 'buy' && !a.to ? { ...a, to: undefined } : a);
      expect(encode(decode(tok))).toBe(tok);
    }
    expect(() => decode('X')).toThrow();
    expect(() => decode('ML00')).toThrow();
    expect(RULES_VERSION).toBe(1);
  });

  it('replay throws on an illegal action', () => {
    expect(() => replay(1, 'Sb0')).toThrow(/illegal/); // empty bench slot
    expect(() => replay(1, 'ML00L01')).toThrow(/illegal/); // caster into a modifier slot
    expect(() => replay(1, 'B0,B0')).toThrow(/illegal/); // already sold
    expect(() => replay(1, 'nope')).toThrow(/bad action/);
    expect(replay(1, '').wave).toBe(1);
  });
});

const ALL: Slot[] = [];
for (let row = 0; row < 3; row++) for (let col = 0; col < 4; col++) ALL.push({ area: 'loom', row, col });
for (let i = 0; i < BENCH_SIZE; i++) ALL.push({ area: 'bench', i });

/** A random action, legal or not, weighted toward buying and moving. */
function randomAction(rng: Rng, s: GameState): Action {
  const r = rng.next();
  if (r < 0.35) {
    const i = rng.int(0, s.shop.length - 1);
    return rng.next() < 0.5 ? { t: 'buy', i } : { t: 'buy', i, to: rng.pick(ALL) };
  }
  if (r < 0.65) return { t: 'move', from: rng.pick(ALL), to: rng.pick(ALL) };
  if (r < 0.72) return { t: 'sell', at: rng.pick(ALL) };
  if (r < 0.82) return { t: 'reroll' };
  if (r < 0.87) return { t: 'freeze' };
  return { t: 'fight' };
}

describe('fuzz', () => {
  it(
    'random legal action sequences replay to the identical state',
    () => {
      let fights = 0;
      for (const seed of [1, 7, 123, 99999, 2024]) {
        const s = newGame(seed);
        const rng = new Rng(mixSeed(seed, 31337));
        const tokens: string[] = [];
        let illegal = 0;
        let sinceFight = 0;
        for (let step = 0; step < 600 && s.phase === 'build'; step++) {
          let a = randomAction(rng, s);
          // Build a little between battles.
          if (a.t === 'fight' && sinceFight < 8) a = { t: 'buy', i: rng.int(0, s.shop.length - 1) };
          const before = json(s);
          if (!apply(s, a)) {
            illegal++;
            // An illegal action leaves the state untouched.
            expect(json(s)).toBe(before);
            continue;
          }
          tokens.push(encode(a));
          sinceFight = a.t === 'fight' ? 0 : sinceFight + 1;
          if ((s.phase as GameState['phase']) === 'battle') finishBattle(s);
          // Invariants.
          expect(s.gold).toBeGreaterThanOrEqual(0);
          expect(s.bench).toHaveLength(BENCH_SIZE);
          for (const row of s.loom) row.forEach((r, c) => r && expect(c === 0).toBe(['bolt', 'beam', 'nova', 'rain', 'orb'].includes(r.id)));
        }
        expect(tokens.length).toBeGreaterThan(30);
        fights += tokens.filter((t) => t === 'G').length;
        expect(illegal).toBeGreaterThan(0);
        expect(json(replay(seed, tokens.join(',')))).toBe(json(s));
      }
      expect(fights).toBeGreaterThan(8);
    },
    30_000,
  );
});

describe('bots', () => {
  it(
    'smart and naive bot runs replay exactly from their action strings',
    () => {
      for (const seed of [1, 2]) {
        for (const p of [naivePlayer, smartPlayer()]) {
          const r = runGame(seed, p);
          expect(r.s.phase === 'over' || r.s.phase === 'won').toBe(true);
          expect(json(replay(seed, r.actions))).toBe(json(r.s));
        }
      }
    },
    60_000,
  );

  it(
    'the smart bot goes further than the naive one',
    () => {
      let smart = 0;
      let naive = 0;
      for (let seed = 1; seed <= 6; seed++) {
        smart += runGame(seed, smartPlayer()).reached;
        naive += runGame(seed, naivePlayer).reached;
      }
      expect(smart).toBeGreaterThan(naive + 6);
    },
    60_000,
  );
});
