// Rules v4 (third blind playtest): merges never lose power, Split on Beam and
// Nova, bosses leak by what's left of them, the Lich trial, Ascension, bench-first buys.
import { describe, expect, it } from 'vitest';
import {
  ASC,
  ENEMIES,
  MODS,
  RULES_VERSION,
  compileRow,
  enemyHp,
  finishBattle,
  leakOf,
  lichTrial,
  newBattle,
  newGame,
  replay,
  spellDps,
  stepBattle,
  type GameState,
  type ModId,
  type Rune,
  type RuneId,
} from '../../src/glyph/core';

const R = (id: RuneId, tier: 1 | 2 | 3 = 1): Rune => ({ id, tier });
const row = (...rs: Rune[]) => [...rs, null, null, null].slice(0, 4) as (Rune | null)[];

describe('merges never lose power', () => {
  it('a tier-II modifier is at least as strong as two tier-I copies, and III at least II + I, on every caster', () => {
    const casters: RuneId[] = ['bolt', 'beam', 'nova', 'rain', 'orb'];
    const flat: ModId[] = ['haste', 'storm', 'split', 'pierce', 'heavy', 'frost', 'leech', 'gild'];
    for (const c of casters)
      for (const m of flat) {
        const two = compileRow(row(R(c), R(m), R(m)))!;
        const II = compileRow(row(R(c), R(m, 2)))!;
        const IIplusI = compileRow(row(R(c), R(m, 2), R(m)))!;
        const III = compileRow(row(R(c), R(m, 3)))!;
        for (const crowd of [true, false]) {
          expect(spellDps(II, crowd), `${c} ${m} II vs I+I`).toBeGreaterThanOrEqual(spellDps(two, crowd) - 1e-9);
          expect(spellDps(III, crowd), `${c} ${m} III vs II+I`).toBeGreaterThanOrEqual(spellDps(IIplusI, crowd) - 1e-9);
        }
      }
  });

  it('Haste II casts at least as fast as two Haste I (the playtest: 1.7 s became 2.0 s)', () => {
    const two = compileRow(row(R('beam', 2), R('haste'), R('haste')))!;
    const II = compileRow(row(R('beam', 2), R('haste', 2)))!;
    expect(II.cooldown).toBeLessThanOrEqual(two.cooldown + 1e-9);
  });

  it('every modifier is listed', () => expect(MODS.length).toBe(10));
});

describe('Split', () => {
  it('raises a Beam’s dps estimate in a crowd and on a lone foe', () => {
    const fire = compileRow(row(R('beam'), R('fire')))!;
    const split = compileRow(row(R('beam'), R('fire'), R('split')))!;
    expect(spellDps(split)).toBeGreaterThan(spellDps(fire));
    expect(spellDps(split, false)).toBeGreaterThan(spellDps(fire, false));
  });

  it('spare beams strike a lone foe again, so Split on Beam hurts a single target more', () => {
    const dealt = (cells: (Rune | null)[]) => {
      const s = newGame(5);
      s.wave = 3;
      s.loom = [cells, row(), row()];
      const b = newBattle(s);
      b.queue = [[0.1, 'golem', 0.5]];
      s.battle = b;
      let hp = 0;
      for (let n = 0; n < 60 * 8; n++) {
        stepBattle(s, b);
        const g = b.enemies.find((e) => e.kind === 'golem');
        if (g) hp = g.maxHp - g.hp;
      }
      return hp;
    };
    expect(dealt(row(R('beam', 2), R('split')))).toBeGreaterThan(dealt(row(R('beam', 2))));
  });

  it('widens a Nova without sharing its damage out', () => {
    const a = compileRow(row(R('nova')))!;
    const b = compileRow(row(R('nova'), R('split')))!;
    expect(b.dmg).toBeCloseTo(a.dmg);
    expect(b.count).toBe(2);
  });
});

describe('bosses and the Lich', () => {
  it('a boss costs tower HP by the share of it left; others their full leak', () => {
    const maxHp = enemyHp('lich', 15);
    expect(leakOf({ kind: 'lich', hp: maxHp, maxHp, shield: ENEMIES.lich.shield })).toBe(ENEMIES.lich.leak);
    expect(leakOf({ kind: 'lich', hp: maxHp / 4, maxHp, shield: 0 })).toBeLessThan(ENEMIES.lich.leak / 2);
    expect(leakOf({ kind: 'lich', hp: 1, maxHp, shield: 0 })).toBe(1);
    expect(leakOf({ kind: 'drake', hp: 1, maxHp: 300, shield: 0 })).toBe(ENEMIES.drake.leak);
  });

  it('the Lich trial is pure, leaves the state alone and rewards a stronger loom', () => {
    const s = newGame(9);
    const before = JSON.stringify(s);
    const weak = lichTrial(s);
    expect(JSON.stringify(s)).toBe(before);
    expect(lichTrial(s)).toEqual(weak);
    expect(weak.killed).toBe(false);
    expect(weak.left).toBeGreaterThan(0.9);
    const strong: GameState = { ...s, loom: [row(R('bolt', 3), R('pierce', 3), R('haste', 3), R('echo', 2)), row(R('beam', 3), R('heavy', 3), R('haste', 3), R('split', 2)), row(R('orb', 3), R('heavy', 3), R('haste', 3), R('split', 2))] };
    const t = lichTrial(strong);
    expect(t.killed).toBe(true);
    expect(t.progress).toBeLessThan(1);
  });
});

describe('Ascension and saves', () => {
  it('each level gives every foe more HP, bosses too; replays carry the level', () => {
    expect(enemyHp('knight', 6, 2)).toBeCloseTo(enemyHp('knight', 6) * (1 + 2 * ASC.hp));
    expect(enemyHp('lich', 15, 1)).toBeCloseTo(enemyHp('lich', 15) * (1 + ASC.hp));
    const a = replay(4, 'G', 3);
    expect(a.asc).toBe(3);
    const s = newGame(4, 3);
    s.loom = a.loom;
    expect(RULES_VERSION).toBe(5);
  });

  it('a harder level leaks at least as much with the same loom', () => {
    const leak = (asc: number) => {
      const s = newGame(12, asc);
      s.wave = 9;
      s.hp = s.maxHp = 1e6;
      s.loom = [row(R('bolt', 2), R('haste')), row(), row()];
      s.phase = 'battle';
      s.battle = newBattle(s);
      finishBattle(s);
      return s.battle!.leaked;
    };
    expect(leak(4)).toBeGreaterThanOrEqual(leak(0));
  });
});
