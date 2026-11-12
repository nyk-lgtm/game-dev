import { describe, expect, it } from 'vitest';
import {
  ADJ, CORE, ENEMIES, HP_GROWTH, LATE_FROM, LATE_GROWTH, N, PORTAL, START_GOLD, TWIN_GOLD, TWIN_PORTALS, buried, portalsOf, TOWERS, WAVES, act, buildError, decode, encode, flowField, makeMap, newGame, replay, step, towerStats, wavePlan,
  type State,
} from '../../src/hexhold/core';
import { runGame } from '../../scripts/hexhold/bot';

const open = (s: State) => [...Array(N).keys()].filter((i) => s.ground[i] === 'open' || s.ground[i] === 'ley');

describe('board', () => {
  it('maps are deterministic and always have a path from portal to core', () => {
    for (let seed = 0; seed < 40; seed++) {
      const g = makeMap(seed);
      expect(makeMap(seed)).toEqual(g);
      const portals = portalsOf(g);
      expect(portals).toEqual(portals.length > 1 ? TWIN_PORTALS : [PORTAL]);
      for (const p of portals) expect(flowField(g, new Set()).dist[p]).toBeLessThan(Infinity);
      expect(g[CORE]).toBe('core');
    }
  });

  it('neighbors are symmetric', () => {
    for (let i = 0; i < N; i++) for (const j of ADJ[i]) expect(ADJ[j]).toContain(i);
  });
});

describe('building', () => {
  it('never lets you seal the path', () => {
    const s = newGame(3);
    s.gold = 1e9;
    // Try to wall off every cell next to the core.
    for (const j of ADJ[CORE]) act(s, { t: 'build', cell: j, tower: 'bolt' });
    expect(s.field.dist[PORTAL]).toBeLessThan(Infinity);
    expect(ADJ[CORE].some((j) => !s.towers[j])).toBe(true);
  });

  it('costs gold, refunds 70% on sale, and reroutes the path', () => {
    const s = newGame(4);
    const before = s.field.dist[PORTAL];
    const cell = open(s).find((c) => !buildError(s, c, 'bolt') && flowField(s.ground, new Set([c])).dist[PORTAL] > before)!;
    expect(act(s, { t: 'build', cell, tower: 'bolt' })).toBe(true);
    expect(s.gold).toBe(START_GOLD - TOWERS.bolt.cost);
    expect(s.field.dist[PORTAL]).toBeGreaterThan(before);
    expect(act(s, { t: 'sell', cell })).toBe(true);
    expect(s.gold).toBe(START_GOLD - 50 + 35);
    expect(s.field.dist[PORTAL]).toBe(before);
  });

  it('rejects rock, the portal, the core, and towers you cannot afford', () => {
    const s = newGame(5);
    expect(buildError(s, PORTAL, 'bolt')).not.toBeNull();
    expect(buildError(s, CORE, 'bolt')).not.toBeNull();
    const rock = s.ground.indexOf('rock');
    if (rock >= 0) expect(buildError(s, rock, 'bolt')).not.toBeNull();
    s.gold = 10;
    expect(buildError(s, open(s)[5], 'bolt')).toBe('Not enough gold');
  });
});

describe('neighbors', () => {
  it('a beacon next door adds 20% damage; a bolt next door lets a mortar hit flyers', () => {
    const s = newGame(6);
    s.gold = 1e9;
    const cell = open(s).find((c) => ADJ[c].filter((j) => s.ground[j] === 'open').length >= 2 && s.ground[c] === 'open')!;
    act(s, { t: 'build', cell, tower: 'mortar' });
    const m = s.towers[cell]!;
    const plain = towerStats(s, m);
    expect(plain.air).toBe(false);
    const [a, b] = ADJ[cell].filter((j) => s.ground[j] === 'open' && !buildError(s, j, 'beacon'));
    act(s, { t: 'build', cell: a, tower: 'beacon' });
    expect(towerStats(s, m).dmg).toBeCloseTo(plain.dmg * 1.2);
    if (b !== undefined && !buildError(s, b, 'bolt')) {
      act(s, { t: 'build', cell: b, tower: 'bolt' });
      expect(towerStats(s, m).air).toBe(true);
    }
  });
});

describe('waves', () => {
  it('are fixed by the seed, bosses every tenth, few menders', () => {
    for (let w = 1; w <= WAVES; w++) {
      const p = wavePlan(9, w);
      expect(wavePlan(9, w)).toEqual(p);
      expect(p.includes('boss')).toBe(w % 10 === 0);
      expect(p.filter((x) => x === 'healer').length).toBeLessThanOrEqual(3 + Math.floor(w / 8));
    }
  });

  it('the first waves are gentle and the first Colossus is smaller than later ones', () => {
    for (let seed = 0; seed < 30; seed++) expect(wavePlan(seed, 1).length).toBeLessThanOrEqual(6);
    const hpOf = (w: number) => {
      const s = newGame(1);
      s.wave = w - 1;
      act(s, { t: 'wave' });
      while (!s.enemies.some((e) => e.id === 'boss')) step(s);
      return s.enemies.find((e) => e.id === 'boss')!.maxHp;
    };
    const growth = (w: number) => Math.pow(1 + HP_GROWTH, w - 1) * (1 + Math.max(0, w - LATE_FROM) * LATE_GROWTH);
    expect(hpOf(10)).toBeCloseTo(ENEMIES.boss.hp * growth(10) * 0.8);
    expect(hpOf(20)).toBeCloseTo(ENEMIES.boss.hp * growth(20));
  });

  it('an undefended core loses lives and the game ends', () => {
    const s = newGame(7);
    let guard = 0;
    while (s.status === 'playing' && guard++ < 200000) {
      if (!s.active) act(s, { t: 'wave' });
      step(s);
    }
    expect(s.status).toBe('lost');
    expect(s.lives).toBe(0);
  });
});

describe('replay', () => {
  it('encodes actions', () => {
    for (const a of [{ t: 'build', cell: 33, tower: 'tesla' }, { t: 'up', cell: 4 }, { t: 'sell', cell: 9 }, { t: 'wave' }] as const) {
      expect(decode(encode(120, a))).toEqual({ tick: 120, a });
    }
  });

  it('rebuilds a bot game exactly', () => {
    const r = runGame(101);
    const s = replay(101, r.actions, r.s.tick);
    expect(s.wave).toBe(r.s.wave);
    expect(s.lives).toBe(r.s.lives);
    expect(s.gold).toBe(r.s.gold);
    expect(s.status).toBe(r.s.status);
  });

  it('encodes specializations', () => {
    expect(decode(encode(77, { t: 'spec', cell: 12, pick: 1 }))).toEqual({ tick: 77, a: { t: 'spec', cell: 12, pick: 1 } });
  });
});

describe('specializations', () => {
  it('only a level-3 tower can specialize, once, and it changes its stats', () => {
    const s = newGame(8);
    s.gold = 1e9;
    const cell = open(s).find((c) => !buildError(s, c, 'bolt'))!;
    act(s, { t: 'build', cell, tower: 'bolt' });
    expect(act(s, { t: 'spec', cell, pick: 0 })).toBe(false);
    act(s, { t: 'up', cell });
    act(s, { t: 'up', cell });
    const before = towerStats(s, s.towers[cell]!);
    expect(act(s, { t: 'spec', cell, pick: 0 })).toBe(true);
    const after = towerStats(s, s.towers[cell]!);
    expect(after.dmg).toBeCloseTo(before.dmg * 2.4);
    expect(after.range).toBeCloseTo(before.range * 1.5);
    expect(after.rate).toBeGreaterThan(before.rate);
    expect(act(s, { t: 'spec', cell, pick: 1 })).toBe(false);
  });

  it('beacon levels raise the boost, and a Banner gives +60%', () => {
    const s = newGame(9);
    s.gold = 1e9;
    const cell = open(s).find((c) => s.ground[c] === 'open' && ADJ[c].some((j) => s.ground[j] === 'open') && !buildError(s, c, 'bolt'))!;
    act(s, { t: 'build', cell, tower: 'bolt' });
    const base = towerStats(s, s.towers[cell]!).dmg;
    const b = ADJ[cell].find((j) => !buildError(s, j, 'beacon'))!;
    act(s, { t: 'build', cell: b, tower: 'beacon' });
    expect(towerStats(s, s.towers[cell]!).dmg).toBeCloseTo(base * 1.2);
    act(s, { t: 'up', cell: b });
    act(s, { t: 'up', cell: b });
    expect(towerStats(s, s.towers[cell]!).dmg).toBeCloseTo(base * 1.4);
    act(s, { t: 'spec', cell: b, pick: 0 });
    expect(towerStats(s, s.towers[cell]!).dmg).toBeCloseTo(base * 1.6);
  });
});

describe('two portals and burrowers', () => {
  const twinSeed = [...Array(100).keys()].find((k) => portalsOf(makeMap(k)).length > 1)!;

  it('some maps have two portals; you can never seal either one off', () => {
    const n = [...Array(100).keys()].filter((k) => portalsOf(makeMap(k)).length > 1).length;
    expect(n).toBeGreaterThan(20);
    expect(n).toBeLessThan(50);
    const s = newGame(twinSeed);
    expect(s.gold).toBe(START_GOLD + TWIN_GOLD);
    s.gold = 1e9;
    // Try to build on every cell: whatever gets through, both portals stay open.
    for (const c of open(s)) act(s, { t: 'build', cell: c, tower: 'bolt' });
    for (const p of s.portals) expect(s.field.dist[p]).toBeLessThan(Infinity);
  });

  it('waves come out of both portals', () => {
    const s = newGame(twinSeed);
    act(s, { t: 'wave' });
    expect(new Set(s.queue.map((q) => q.cell))).toEqual(new Set(TWIN_PORTALS));
  });

  it('burrowers dig the straight way under towers and cannot be hit there', () => {
    const s = newGame(4);
    s.gold = 1e9;
    const straight = s.dig.slice();
    // Build a wall of towers wherever the rules allow.
    for (const c of open(s)) if (s.dig[c] % 3 === 1) act(s, { t: 'build', cell: c, tower: 'bolt' });
    expect(s.dig).toEqual(straight);
    expect(s.field.dist[PORTAL]).toBeGreaterThan(straight[PORTAL]);
    s.wave = 15;
    s.active = true;
    s.queue.push({ id: 'digger', at: s.tick + 1, cell: PORTAL });
    let wasBuried = false;
    let steps = 0;
    while (s.enemies.length + s.queue.length && steps++ < 3000) {
      step(s);
      const e = s.enemies.find((x) => x.id === 'digger');
      if (e && buried(s, e)) {
        wasBuried = true;
        const hp = e.hp;
        step(s);
        if (e.alive && buried(s, e) && !e.burn) expect(e.hp).toBe(hp);
      }
    }
    expect(wasBuried).toBe(true);
    expect(ENEMIES.digger.dig).toBe(true);
  });

  it('a wave has only a few burrowers', () => {
    for (let seed = 0; seed < 20; seed++)
      for (let w = 12; w <= 30; w++) expect(wavePlan(seed, w).filter((id) => id === 'digger').length).toBeLessThanOrEqual(3 + Math.floor(w / 5));
  });
});
