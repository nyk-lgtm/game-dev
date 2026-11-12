import { describe, expect, it } from 'vitest';
import {
  ENEMIES,
  MOD,
  compileRow,
  enemyHp,
  matchups,
  mitigate,
  waveFoes,
  waveQueue,
  warnings,
  type Rune,
  type RuneId,
  type WaveFoe,
} from '../../src/glyph/core';

const R = (id: RuneId, tier: 1 | 2 | 3 = 1): Rune => ({ id, tier });
const row = (...ids: RuneId[]) => compileRow([R(ids[0]), ...ids.slice(1).map((i) => R(i)), null, null, null].slice(0, 4))!;
const foe = (kind: WaveFoe['kind'], count = 1, wave = 5): WaveFoe => ({ kind, count, hp: enemyHp(kind, wave) });

describe('mitigate', () => {
  it('applies resistance, then armor minus shred, never below 1 unless immune', () => {
    const bolt = row('bolt');
    expect(mitigate('imp', bolt, 15)).toBe(15);
    expect(mitigate('knight', bolt, 15)).toBe(15 - ENEMIES.knight.armor);
    expect(mitigate('golem', bolt, 2)).toBe(1);
    expect(mitigate('drake', row('bolt', 'fire'), 50)).toBe(0);
    const pierced = row('bolt', 'pierce');
    expect(mitigate('golem', pierced, 30)).toBe(30 - (ENEMIES.golem.armor - MOD.pierceShred(1)));
  });
});

describe('waveFoes', () => {
  it('groups the wave queue by kind with the wave HP', () => {
    for (const wave of [1, 5, 10, 15]) {
      const foes = waveFoes(7, wave);
      expect(foes.reduce((n, f) => n + f.count, 0)).toBe(waveQueue(7, wave).length);
      for (const f of foes) expect(f.hp).toBe(enemyHp(f.kind, wave));
    }
    expect(waveFoes(7, 10).some((f) => f.kind === 'colossus')).toBe(true);
  });
});

describe('matchups and warnings', () => {
  it('novas cannot reach flyers', () => {
    const m = matchups(row('nova'), [foe('wisp', 3), foe('imp', 3)]);
    expect(m[0]).toMatchObject({ kind: 'wisp', canHit: false, perHit: 0 });
    expect(m[1].canHit).toBe(true);
    expect(warnings(row('nova'), [foe('wisp', 3), foe('imp', 3)])[0]).toMatchObject({ level: 2, kind: 'wisp' });
  });

  it('flags immunity, resistance and heavy armor, worst first', () => {
    expect(warnings(row('bolt', 'fire'), [foe('drake', 4)])[0]).toMatchObject({ level: 2, text: 'Drakes immune to fire' });
    expect(warnings(row('bolt', 'storm'), [foe('golem', 2)])[0]).toMatchObject({ level: 1, kind: 'golem' });
    expect(warnings(row('rain'), [foe('golem', 2)])[0].text).toBe('Golems: armor eats 55%');
    // Fire then Storm: storm hits land on drakes, the burn doesn't.
    expect(warnings(row('bolt', 'fire', 'storm'), [foe('drake', 4)])[0]).toMatchObject({ level: 1, text: "Drakes can't burn" });
    expect(matchups(row('bolt', 'fire', 'storm'), [foe('drake', 4), foe('imp', 4)]).map((m) => m.burns)).toEqual([false, true]);
    expect(warnings(row('bolt', 'heavy', 'heavy', 'pierce'), [foe('golem', 2)])).toEqual([]);
    const w = warnings(row('bolt', 'frost'), [foe('golem', 2), foe('wisp', 4)]);
    expect(w[0].level).toBeGreaterThanOrEqual(w[w.length - 1].level);
  });

  it('ignores minor foes but never a boss', () => {
    const foes = [foe('imp', 120), foe('drake', 1)];
    expect(warnings(row('bolt', 'fire'), foes)).toEqual([]);
    expect(warnings(row('bolt'), [foe('imp', 40), foe('colossus', 1, 10)]).some((w) => w.kind === 'colossus')).toBe(true);
  });
});
