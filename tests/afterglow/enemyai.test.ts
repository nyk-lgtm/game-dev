import { describe, expect, it } from 'vitest';
import {
  BLOAT_SWELL,
  DART_AIM,
  DT,
  RECYCLE_DIST,
  SPAWN_DIST,
  SPIT_AIM,
  damage,
  step,
} from '../../src/afterglow/core';
import { calmWorld, dist, makeImmortal, put, secondsToSteps, stepN } from './helpers';

describe('dart', () => {
  it('telegraphs (stands still, phase 1) before dashing along the aimed line', () => {
    const w = calmWorld();
    makeImmortal(w);
    const d = put(w, 'dart', 200, 0, 1e9);
    d.t = 100; // ready to start its attack
    step(w, 0, 0);
    expect(d.phase).toBe(1);
    const aimedAt = { x: d.ax, y: d.ay };
    expect(aimedAt.x).toBeLessThan(0); // toward the player at the origin
    const parked = { x: d.x, y: d.y };

    // Stays put for (just under) the whole telegraph.
    const hp = w.player.hp;
    stepN(w, secondsToSteps(DART_AIM) - 3);
    expect(d.phase).toBe(1);
    expect(d.x).toBe(parked.x);
    expect(d.y).toBe(parked.y);
    expect(w.player.hp).toBe(hp);

    // Then it dashes much faster than it walks, along the telegraphed direction.
    for (let i = 0; i < 20 && d.phase !== 2; i++) step(w, 0, 0);
    expect(d.phase).toBe(2);
    const before = { x: d.x, y: d.y };
    step(w, 0, 0);
    const moved = dist(d, before);
    expect(moved).toBeGreaterThan(d.speed * DT * 2);
    expect((d.x - before.x) / moved).toBeCloseTo(aimedAt.x, 3);
    expect((d.y - before.y) / moved).toBeCloseTo(aimedAt.y, 3);
  });

  it('does not start telegraphing from out of range', () => {
    const w = calmWorld();
    const d = put(w, 'dart', 800, 0, 1e9);
    d.t = 100;
    stepN(w, 5);
    expect(d.phase).toBe(0);
  });

  it('returns to walking after its dash', () => {
    const w = calmWorld();
    makeImmortal(w);
    const d = put(w, 'dart', 300, 0, 1e9);
    d.t = 100;
    stepN(w, secondsToSteps(DART_AIM + 2));
    expect(d.phase).not.toBe(1);
  });
});

describe('spitter', () => {
  it('fires a bullet at the player only after its aim phase', () => {
    const w = calmWorld();
    makeImmortal(w);
    const s = put(w, 'spitter', 300, 0, 1e9);
    s.t = 100;
    step(w, 0, 0);
    expect(s.phase).toBe(1);
    expect(w.bullets).toHaveLength(0);
    let steps = 0;
    while (w.bullets.length === 0 && steps < 600) {
      step(w, 0, 0);
      steps++;
    }
    expect(w.bullets).toHaveLength(1);
    expect(steps * DT).toBeGreaterThanOrEqual(SPIT_AIM - 2 * DT);
    expect(steps * DT).toBeLessThanOrEqual(SPIT_AIM + 3 * DT);
    const b = w.bullets[0];
    expect(b.vx).toBeLessThan(0); // flying at the player
    expect(b.dmg).toBe(s.dmg);
    expect(s.phase).toBe(0);
  });

  it('its bullet hurts the player on arrival', () => {
    const w = calmWorld();
    const s = put(w, 'spitter', 300, 0, 1e9);
    s.t = 100;
    const hp0 = w.player.hp;
    for (let i = 0; i < secondsToSteps(5) && w.player.hp === hp0; i++) step(w, 0, 0);
    expect(w.player.hp).toBeLessThan(hp0);
    expect(hp0 - w.player.hp).toBeCloseTo(Math.max(1, s.dmg - w.stats.armor), 6);
  });

  it('a bullet that misses expires', () => {
    const w = calmWorld();
    makeImmortal(w);
    w.bullets.push({ x: 0, y: 500, vx: 0, vy: 100, r: 6, dmg: 5, life: 0.1, alive: true });
    stepN(w, 20);
    expect(w.bullets).toHaveLength(0);
  });
});

describe('bloater', () => {
  it('swells in place, then explodes, hurting the player in range and nearby enemies', () => {
    const w = calmWorld();
    const b = put(w, 'bloater', 45, 0, 1e9);
    const friend = put(w, 'brute', 115, 0, 1e9);
    const hp0 = w.player.hp;
    step(w, 0, 0);
    expect(b.phase).toBe(1);
    const parked = { x: b.x, y: b.y };
    stepN(w, secondsToSteps(BLOAT_SWELL) - 5);
    expect(b.alive).toBe(true);
    expect(b.x).toBe(parked.x);
    expect(w.player.hp).toBe(hp0);
    expect(friend.hp).toBe(1e9);

    for (let i = 0; i < 20 && b.alive; i++) step(w, 0, 0);
    expect(b.alive).toBe(false);
    expect(w.player.hp).toBeCloseTo(hp0 - Math.max(1, b.dmg - w.stats.armor), 6);
    expect(friend.hp).toBeLessThan(1e9);
    expect(w.fx.some((f) => f.type === 'boom')).toBe(true);
    step(w, 0, 0);
    expect(w.enemies.includes(b)).toBe(false);
  });

  it('can kill weak neighbours in its blast', () => {
    const w = calmWorld();
    makeImmortal(w);
    const b = put(w, 'bloater', 300, 0, 1e9);
    b.phase = 1;
    const mite = put(w, 'mite', 340, 0);
    stepN(w, secondsToSteps(BLOAT_SWELL) + 5);
    expect(b.alive).toBe(false);
    expect(mite.alive).toBe(false);
  });

  it('does not hurt a player standing outside the blast', () => {
    const w = calmWorld();
    const b = put(w, 'bloater', 400, 0, 1e9);
    b.phase = 1;
    const hp0 = w.player.hp;
    stepN(w, secondsToSteps(BLOAT_SWELL) + 5);
    expect(b.alive).toBe(false);
    expect(w.player.hp).toBe(hp0);
  });

  it('starts swelling when it reaches the player', () => {
    const w = calmWorld();
    makeImmortal(w);
    const b = put(w, 'bloater', 400, 0, 1e9);
    stepN(w, secondsToSteps(15));
    expect(b.alive === false || b.phase === 1).toBe(true);
  });
});

describe('warden', () => {
  it('shields nearby enemies so they take reduced damage, but not itself or distant ones', () => {
    const w = calmWorld();
    const warden = put(w, 'warden', 300, 0, 1e9);
    const near = put(w, 'brute', 340, 0, 1e9);
    const far = put(w, 'brute', -300, 0, 1e9);
    step(w, 0, 0);
    expect(near.shielded).toBe(true);
    expect(warden.shielded).toBe(false);
    expect(far.shielded).toBe(false);
    damage(w, near, 10, null);
    damage(w, far, 10, null);
    const lostNear = 1e9 - near.hp;
    const lostFar = 1e9 - far.hp;
    expect(lostFar).toBeGreaterThan(0);
    expect(lostNear).toBeGreaterThan(0);
    expect(lostNear).toBeLessThan(lostFar);
  });

  it('the shield drops once the warden dies', () => {
    const w = calmWorld();
    const warden = put(w, 'warden', 300, 0, 1e9);
    const near = put(w, 'brute', 340, 0, 1e9);
    step(w, 0, 0);
    expect(near.shielded).toBe(true);
    damage(w, warden, 1e10, null);
    step(w, 0, 0);
    expect(near.shielded).toBe(false);
  });
});

describe('halo slow', () => {
  it('slowing auras reduce enemy speed', () => {
    const w = calmWorld();
    makeImmortal(w);
    w.weapons = [{ id: 'halo', level: 1, cd: 0, t: 0, dealt: 0 }];
    const slowed = put(w, 'brute', 30, 0, 1e9);
    const free = put(w, 'brute', 0, 600, 1e9);
    free.speed = slowed.speed;
    step(w, 0, 0);
    expect(slowed.slow).toBeLessThan(1);
    expect(free.slow).toBe(1);
  });
});

describe('recycling', () => {
  it('enemies far beyond RECYCLE_DIST are moved back near the player', () => {
    const w = calmWorld();
    const e = put(w, 'drone', RECYCLE_DIST + 600, 0, 1e9);
    step(w, 0, 0);
    const d = dist(e, w.player);
    expect(d).toBeLessThan(RECYCLE_DIST);
    expect(d).toBeGreaterThanOrEqual(SPAWN_DIST - 1);
  });

  it('enemies inside RECYCLE_DIST are left alone', () => {
    const w = calmWorld();
    const e = put(w, 'drone', RECYCLE_DIST - 150, 0, 1e9);
    step(w, 0, 0);
    expect(e.x).toBeGreaterThan(RECYCLE_DIST - 200);
    expect(e.x).toBeLessThan(RECYCLE_DIST - 140);
  });

  it('recycling follows a moving player', () => {
    const w = calmWorld();
    makeImmortal(w);
    w.player.x = 5000;
    const e = put(w, 'drone', 0, 0, 1e9);
    step(w, 0, 0);
    expect(dist(e, w.player)).toBeLessThan(RECYCLE_DIST);
  });
});

describe('chasers', () => {
  it('drones walk toward the player at their speed', () => {
    const w = calmWorld();
    const e = put(w, 'drone', 300, 0, 1e9);
    stepN(w, 60);
    expect(e.x).toBeCloseTo(300 - e.speed * 1, 0);
  });

  it('orbiters circle rather than head straight in', () => {
    const w = calmWorld();
    makeImmortal(w);
    const e = put(w, 'orbiter', 300, 0, 1e9);
    stepN(w, 60);
    expect(Math.abs(e.y)).toBeGreaterThan(20);
  });
});
