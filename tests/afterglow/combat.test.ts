import { describe, expect, it } from 'vitest';
import {
  ENEMIES,
  MAX_GEMS,
  damage,
  dropPickup,
  hurtPlayer,
  kill,
  spawnEnemy,
  step,
  takeChest,
  waiting,
  xpToNext,
  choose,
} from '../../src/afterglow/core';
import { calmWorld, dist, makeImmortal, put, stepN } from './helpers';

describe('contact damage', () => {
  it('hurts the player by the enemy damage, then grants iframes', () => {
    const w = calmWorld();
    const e = put(w, 'drone', 0, 0, 1e9);
    const hp0 = w.player.hp;
    step(w, 0, 0);
    expect(w.player.hp).toBeCloseTo(hp0 - Math.max(1, e.dmg - w.stats.armor), 6);
    expect(w.player.iframes).toBeGreaterThan(0);
    expect(w.fx.some((f) => f.type === 'hurt')).toBe(true);
  });

  it('iframes block repeated hits, and hits resume once they expire', () => {
    const w = calmWorld();
    put(w, 'drone', 0, 0, 1e9);
    step(w, 0, 0);
    const afterFirst = w.player.hp;
    stepN(w, 10);
    expect(w.player.hp).toBe(afterFirst);
    stepN(w, 60);
    expect(w.player.hp).toBeLessThan(afterFirst);
  });

  it('armor reduces damage but never below 1', () => {
    const a = calmWorld();
    a.stats.armor = 2;
    const e = put(a, 'brute', 0, 0, 1e9);
    const hp0 = a.player.hp;
    step(a, 0, 0);
    expect(hp0 - a.player.hp).toBeCloseTo(Math.max(1, e.dmg - 2), 6);

    const b = calmWorld();
    b.stats.armor = 1e6;
    put(b, 'brute', 0, 0, 1e9);
    const hp1 = b.player.hp;
    step(b, 0, 0);
    expect(hp1 - b.player.hp).toBe(1);
  });

  it('enemies out of reach do not hurt', () => {
    const w = calmWorld();
    put(w, 'drone', 300, 0, 1e9);
    const hp0 = w.player.hp;
    stepN(w, 5);
    expect(w.player.hp).toBe(hp0);
  });

  it('hurtPlayer ignores hits while iframes are active and after death', () => {
    const w = calmWorld();
    w.player.iframes = 1;
    const hp0 = w.player.hp;
    hurtPlayer(w, 50);
    expect(w.player.hp).toBe(hp0);
    w.player.iframes = 0;
    w.status = 'dead';
    hurtPlayer(w, 50);
    expect(w.player.hp).toBe(hp0);
  });
});

describe('death and revive', () => {
  it('hp <= 0 ends the run with hp clamped at 0 and freezes the sim', () => {
    const w = calmWorld();
    w.player.hp = 1;
    put(w, 'brute', 0, 0, 1e9);
    step(w, 0, 0);
    expect(w.status).toBe('dead');
    expect(w.player.hp).toBe(0);
    const t = w.time;
    step(w, 1, 0);
    expect(w.time).toBe(t);
  });

  it('a revive restores half health, grants iframes and blasts nearby enemies', () => {
    const w = calmWorld();
    w.player.revives = 1;
    w.player.hp = 1;
    put(w, 'brute', 0, 0, 1e9);
    const near = put(w, 'drone', 120, 0);
    const far = put(w, 'brute', 520, 0, 1e9);
    step(w, 0, 0);
    expect(w.status).toBe('playing');
    expect(w.player.revives).toBe(0);
    expect(w.player.hp).toBeCloseTo(w.stats.maxHp * 0.5, 6);
    expect(w.player.iframes).toBeGreaterThan(1);
    expect(near.alive).toBe(false);
    expect(far.alive).toBe(true);
    expect(far.hp).toBe(1e9);
    expect(w.fx.some((f) => f.type === 'warn')).toBe(true);
  });

  it('the revive is used only once', () => {
    const w = calmWorld();
    w.player.revives = 1;
    w.player.hp = 1;
    put(w, 'brute', 0, 0, 1e9);
    step(w, 0, 0);
    expect(w.status).toBe('playing');
    w.player.hp = 1;
    w.player.iframes = 0;
    step(w, 0, 0);
    expect(w.status).toBe('dead');
  });
});

describe('kills and drops', () => {
  it('a killed enemy drops a gem worth its xp and counts as a kill', () => {
    const w = calmWorld();
    const e = put(w, 'brute', 50, 60);
    const xp = e.xp;
    damage(w, e, 1e9, null);
    expect(e.alive).toBe(false);
    expect(w.kills).toBe(1);
    const gems = w.pickups.filter((p) => p.kind === 'gem');
    expect(gems).toHaveLength(1);
    expect(gems[0].value).toBe(xp);
    expect(gems[0].x).toBe(50);
    expect(gems[0].y).toBe(60);
  });

  it('gem value scales with the clock (later enemies are worth at least as much)', () => {
    const early = calmWorld();
    const late = calmWorld();
    late.time = 400;
    expect(spawnEnemy(late, 'drone', 0, 0).xp).toBeGreaterThanOrEqual(spawnEnemy(early, 'drone', 0, 0).xp);
    expect(spawnEnemy(early, 'drone', 0, 0).xp).toBeGreaterThanOrEqual(ENEMIES.drone.xp);
  });

  it('damage below lethal leaves the enemy alive and records weapon damage', () => {
    const w = calmWorld();
    const e = put(w, 'brute', 100, 0);
    damage(w, e, 1, 'pulse');
    expect(e.alive).toBe(true);
    expect(e.hp).toBeLessThan(e.maxHp);
    expect(w.dealt.pulse).toBeGreaterThan(0);
    expect(w.pickups).toHaveLength(0);
  });

  it('might multiplies damage; shields reduce it', () => {
    const w = calmWorld();
    const a = put(w, 'brute', 100, 0);
    const b = put(w, 'brute', 100, 100);
    const c = put(w, 'brute', 100, 200);
    w.stats.might = 1;
    damage(w, a, 10, null);
    w.stats.might = 2;
    damage(w, b, 10, null);
    w.stats.might = 1;
    c.shielded = true;
    damage(w, c, 10, null);
    const da = a.maxHp - a.hp;
    expect(b.maxHp - b.hp).toBeCloseTo(da * 2, 6);
    expect(c.maxHp - c.hp).toBeLessThan(da);
  });

  it('dead enemies cannot be damaged or killed twice', () => {
    const w = calmWorld();
    const e = put(w, 'drone', 0, 100);
    kill(w, e);
    kill(w, e);
    damage(w, e, 100, null);
    expect(w.kills).toBe(1);
    expect(w.pickups.filter((p) => p.kind === 'gem')).toHaveLength(1);
  });

  it('knockback pushes along the given direction and is resisted by heavy enemies', () => {
    const w = calmWorld();
    const light = put(w, 'drone', 100, 0, 1e9);
    const heavy = put(w, 'prism', 100, 100, 1e9);
    damage(w, light, 1, null, 1, 0, 100);
    damage(w, heavy, 1, null, 1, 0, 100);
    expect(light.kx).toBeGreaterThan(0);
    expect(heavy.kx).toBeLessThan(light.kx);
  });

  it('splitters burst into mites when killed', () => {
    const w = calmWorld();
    const s = put(w, 'splitter', 200, 200);
    damage(w, s, 1e9, null);
    const mites = w.enemies.filter((e) => e.kind === 'mite' && e.alive);
    expect(mites.length).toBeGreaterThanOrEqual(2);
    for (const m of mites) expect(dist(m, s)).toBeLessThan(40);
  });

  it('non-splitters do not spawn mites', () => {
    const w = calmWorld();
    damage(w, put(w, 'brute', 0, 200), 1e9, null);
    expect(w.enemies.filter((e) => e.kind === 'mite')).toHaveLength(0);
  });

  it('elites are tougher, bigger, worth more, and drop a chest', () => {
    const w = calmWorld();
    const normal = spawnEnemy(w, 'brute', 300, 0);
    const elite = spawnEnemy(w, 'brute', -300, 0, true);
    expect(elite.elite).toBe(true);
    expect(elite.hp).toBeGreaterThan(normal.hp);
    expect(elite.r).toBeGreaterThan(normal.r);
    expect(elite.xp).toBeGreaterThan(normal.xp);
    damage(w, elite, 1e9, null);
    expect(w.pickups.some((p) => p.kind === 'chest')).toBe(true);
    expect(w.pickups.some((p) => p.kind === 'gem' && p.value === elite.xp)).toBe(true);
  });

  it('non-elites never drop chests', () => {
    const w = calmWorld();
    for (let i = 0; i < 300; i++) damage(w, put(w, 'drone', i, 300), 1e9, null);
    expect(w.pickups.some((p) => p.kind === 'chest')).toBe(false);
  });

  it('the Prism drops a chest and clears the boss slot', () => {
    const w = calmWorld();
    const b = put(w, 'prism', 300, 0);
    w.boss = b.id;
    damage(w, b, 1e9, null);
    expect(w.boss).toBeNull();
    expect(w.pickups.some((p) => p.kind === 'chest')).toBe(true);
    expect(w.status).toBe('playing');
  });
});

describe('pickups', () => {
  it('gems inside the magnet radius are pulled in and collected into xp', () => {
    const w = calmWorld();
    dropPickup(w, 'gem', w.stats.magnet * 0.8, 0, 1);
    step(w, 0, 0);
    expect(w.pickups[0].pulled).toBe(true);
    const d0 = dist(w.pickups[0], w.player);
    step(w, 0, 0);
    expect(dist(w.pickups[0], w.player)).toBeLessThan(d0);
    stepN(w, 90);
    expect(w.pickups).toHaveLength(0);
    expect(w.player.xp).toBe(1);
  });

  it('gems beyond the magnet radius stay put', () => {
    const w = calmWorld();
    dropPickup(w, 'gem', w.stats.magnet + 60, 0, 1);
    stepN(w, 30);
    expect(w.pickups).toHaveLength(1);
    expect(w.pickups[0].pulled).toBe(false);
    expect(w.pickups[0].x).toBe(w.stats.magnet + 60);
    expect(w.player.xp).toBe(0);
  });

  it('a larger magnet stat reaches farther gems', () => {
    const w = calmWorld();
    const x = w.stats.magnet + 60;
    w.stats.magnet = x + 40;
    dropPickup(w, 'gem', x, 0, 1);
    step(w, 0, 0);
    expect(w.pickups[0].pulled).toBe(true);
  });

  it('enough xp levels up: pendingLevels and choices appear, the sim waits', () => {
    const w = calmWorld();
    dropPickup(w, 'gem', 5, 0, xpToNext(1) + 0.5);
    step(w, 0, 0);
    expect(w.player.level).toBe(2);
    expect(w.player.xp).toBeCloseTo(0.5, 6);
    expect(w.pendingLevels).toBe(1);
    expect(w.choices.length).toBeGreaterThan(0);
    expect(waiting(w)).toBe(true);
    const tick = w.tick;
    step(w, 1, 0);
    expect(w.tick).toBe(tick);
    choose(w, 0);
    expect(waiting(w)).toBe(false);
    step(w, 1, 0);
    expect(w.tick).toBe(tick + 1);
  });

  it('a big xp haul queues several level-ups', () => {
    const w = calmWorld();
    dropPickup(w, 'gem', 5, 0, xpToNext(1) + xpToNext(2) + xpToNext(3));
    step(w, 0, 0);
    expect(w.player.level).toBe(4);
    expect(w.pendingLevels).toBe(3);
    choose(w, 0);
    expect(w.pendingLevels).toBe(2);
    expect(w.choices.length).toBeGreaterThan(0);
    choose(w, 0);
    choose(w, 0);
    expect(w.pendingLevels).toBe(0);
    expect(w.choices).toHaveLength(0);
  });

  it('xp below the threshold does not level', () => {
    const w = calmWorld();
    dropPickup(w, 'gem', 5, 0, xpToNext(1) - 1);
    step(w, 0, 0);
    expect(w.player.level).toBe(1);
    expect(w.pendingLevels).toBe(0);
  });

  it('hearts heal, capped at maxHp', () => {
    const w = calmWorld();
    w.player.hp = 10;
    dropPickup(w, 'heart', 5, 0);
    step(w, 0, 0);
    expect(w.player.hp).toBeGreaterThan(10);
    expect(w.player.hp).toBeLessThanOrEqual(w.stats.maxHp);

    const w2 = calmWorld();
    w2.player.hp = w2.stats.maxHp - 1;
    dropPickup(w2, 'heart', 5, 0);
    step(w2, 0, 0);
    expect(w2.player.hp).toBe(w2.stats.maxHp);
  });

  it('chests increment chestQueue, pause the sim, and takeChest drains the queue', () => {
    const w = calmWorld();
    dropPickup(w, 'chest', 5, 0);
    dropPickup(w, 'chest', -5, 0);
    step(w, 0, 0);
    expect(w.chestQueue).toBe(2);
    expect(waiting(w)).toBe(true);
    expect(takeChest(w).length).toBeGreaterThan(0);
    expect(w.chestQueue).toBe(1);
    takeChest(w);
    expect(w.chestQueue).toBe(0);
    expect(takeChest(w)).toEqual([]);
    expect(waiting(w)).toBe(false);
  });

  it('shards are collected into w.shards (scaled by greed)', () => {
    const w = calmWorld();
    w.stats.greed = 2;
    dropPickup(w, 'shard', 5, 0, 3);
    step(w, 0, 0);
    expect(w.shards).toBe(6);
  });

  it('a magnet pickup pulls every gem on the map', () => {
    const w = calmWorld();
    for (let i = 0; i < 5; i++) dropPickup(w, 'gem', 1500 + i * 10, 0, 1);
    dropPickup(w, 'magnet', 5, 0);
    step(w, 0, 0);
    expect(w.pickups.filter((p) => p.kind === 'gem').every((p) => p.pulled)).toBe(true);
  });

  it('a bomb pickup damages enemies on screen', () => {
    const w = calmWorld();
    const e = put(w, 'drone', 250, 0, 1e9);
    dropPickup(w, 'bomb', 5, 0);
    step(w, 0, 0);
    expect(e.hp).toBeLessThan(1e9);
  });
});

describe('gem cap', () => {
  it('dropPickup never leaves more than MAX_GEMS gems and conserves total value', () => {
    const w = calmWorld();
    const total = MAX_GEMS * 2 + 50;
    for (let i = 0; i < total; i++) {
      dropPickup(w, 'gem', 1000 + i * 3, (i % 7) * 20, 1);
      expect(w.pickups.filter((p) => p.kind === 'gem').length).toBeLessThanOrEqual(MAX_GEMS);
    }
    const sum = w.pickups.filter((p) => p.kind === 'gem').reduce((s, p) => s + p.value, 0);
    expect(sum).toBe(total);
  });

  it('merging prefers the farthest gem', () => {
    const w = calmWorld();
    for (let i = 0; i < MAX_GEMS; i++) dropPickup(w, 'gem', 100 + i, 0, 1);
    dropPickup(w, 'gem', 5000, 0, 1);
    const far = w.pickups.reduce((a, b) => (a.x > b.x ? a : b));
    expect(far.x).toBe(100 + MAX_GEMS - 1);
    expect(far.value).toBe(2);
  });

  it('other pickup kinds are not capped by the gem limit', () => {
    const w = calmWorld();
    for (let i = 0; i < MAX_GEMS; i++) dropPickup(w, 'gem', 1000 + i, 0, 1);
    dropPickup(w, 'heart', 3000, 0);
    dropPickup(w, 'chest', 3100, 0);
    expect(w.pickups.some((p) => p.kind === 'heart')).toBe(true);
    expect(w.pickups.some((p) => p.kind === 'chest')).toBe(true);
  });

  it('mass kills keep gems at or below MAX_GEMS', () => {
    const w = calmWorld();
    makeImmortal(w);
    for (let i = 0; i < MAX_GEMS + 150; i++) damage(w, put(w, 'drone', 800 + (i % 50) * 7, 800 + i, 1), 1e9, null);
    expect(w.pickups.filter((p) => p.kind === 'gem').length).toBeLessThanOrEqual(MAX_GEMS);
  });
});
