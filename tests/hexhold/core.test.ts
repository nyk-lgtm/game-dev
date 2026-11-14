import { describe, expect, it } from 'vitest';
import {
  ADJ, CORE, ENEMIES, FIRST_BOSS, cellDistance, HP_GROWTH, LATE_FROM, LATE_GROWTH, LATE_WAVES, N, PORTAL, START_GOLD, TWIN_GOLD, TWIN_PORTALS, buried, portalsOf, TOWERS, WAVES, act, buildError, decode, encode, flowField, makeMap, newGame, replay, step, towerStats, wavePlan,
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
  it('a beacon next door adds 20% damage; a bolt next door lets a flame hit flyers, never a mortar', () => {
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
      // Mortar shells only burst on the ground, so it never aims at a flyer (rules v7).
      expect(towerStats(s, m).air).toBe(false);
      const f = ADJ[b].find((j) => j !== cell && !buildError(s, j, 'flame'));
      if (f !== undefined) {
        act(s, { t: 'build', cell: f, tower: 'flame' });
        expect(towerStats(s, s.towers[f]!).air).toBe(true);
      }
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
    const growth = (w: number) => Math.pow(1 + HP_GROWTH, w - 1) * (1 + Math.min(LATE_WAVES, Math.max(0, w - LATE_FROM)) * LATE_GROWTH);
    expect(FIRST_BOSS).toBeLessThan(1);
    expect(hpOf(10)).toBeCloseTo(ENEMIES.boss.hp * growth(10) * FIRST_BOSS);
    expect(hpOf(20)).toBeCloseTo(ENEMIES.boss.hp * growth(20));
  });

  it('no single kind swamps a wave (themes stay mixes)', () => {
    for (let seed = 0; seed < 40; seed++)
      for (let w = 4; w <= WAVES; w++) {
        const p = wavePlan(seed, w);
        expect(p.filter((x) => x === 'brute').length).toBeLessThanOrEqual(3 + Math.ceil(w * 0.5));
        expect(p.filter((x) => x === 'swarm').length).toBeLessThanOrEqual(25 + w * 6);
      }
  });

  it('a wave-held message knows the lives it cost', () => {
    const s = newGame(7);
    act(s, { t: 'wave' });
    let held: { lost: number } | undefined;
    for (let k = 0; k < 20000 && !held; k++) {
      step(s);
      held = s.fx.find((f) => f.type === 'wave') as { lost: number } | undefined;
      s.fx.length = held ? s.fx.length : 0;
    }
    expect(held!.lost).toBe(20 - s.lives);
    expect(held!.lost).toBeGreaterThan(0);
  });

  it('the results know what got through on which wave (Splitter runners apart)', () => {
    const s = newGame(7);
    let guard = 0;
    while (s.status === 'playing' && guard++ < 200000) {
      if (!s.active) act(s, { t: 'wave' });
      step(s);
    }
    const leaks = s.stats.leaks;
    expect(leaks.reduce((a, l) => a + l.lives, 0)).toBe(s.stats.leaked);
    for (const l of leaks) {
      expect(l.lives).toBe(l.n * ENEMIES[l.id].leak);
      if (l.split) expect(l.id).toBe('runner');
    }
    expect(leaks.some((l) => l.wave === 1)).toBe(true);
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

  it('Mortar shells reach a burrower under a tower; other towers cannot', () => {
    for (const id of ['mortar', 'bolt', 'tesla'] as const) {
      const s = newGame(4);
      s.wave = 15;
      s.active = true;
      s.queue.push({ id: 'digger', at: s.tick + 1, cell: PORTAL });
      step(s);
      const e = s.enemies.find((x) => x.id === 'digger')!;
      // Hold it still halfway into a cell with a beacon on it (a tower that never shoots).
      const under = e.next;
      e.t = 0.6;
      e.stun = 1;
      s.towers[under] = { cell: under, id: 'beacon', level: 1, cd: 0, spent: 0, hits: 0, spec: -1, dealt: 0 };
      const at = open(s).find((c) => cellDistance(c, under) === 2)!;
      s.towers[at] = { cell: at, id, level: 1, cd: 0, spent: 0, hits: 0, spec: -1, dealt: 0 };
      expect(buried(s, e)).toBe(true);
      const hp = e.hp;
      step(s);
      if (id === 'mortar') expect(e.hp).toBeLessThan(hp);
      else expect(e.hp).toBe(hp);
    }
  });

  it('a wave has only a few burrowers', () => {
    for (let seed = 0; seed < 20; seed++)
      for (let w = 12; w <= 30; w++) expect(wavePlan(seed, w).filter((id) => id === 'digger').length).toBeLessThanOrEqual(3 + Math.floor(w / 5));
  });
});
