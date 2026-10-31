import { describe, expect, it } from 'vitest';
import { DT, META, createWorld, emptyProfile, step } from '../../src/afterglow/core';
import { calmWorld, stepN } from './helpers';

describe('movement', () => {
  it('moves at stats.speed along the input direction', () => {
    const w = calmWorld();
    stepN(w, 60, 1, 0);
    expect(w.player.x).toBeCloseTo(w.stats.speed * 60 * DT, 5);
    expect(w.player.y).toBeCloseTo(0, 9);
    stepN(w, 60, 0, -1);
    expect(w.player.y).toBeCloseTo(-w.stats.speed * 60 * DT, 5);
  });

  it('scales with stats.speed (character differences)', () => {
    const slow = calmWorld(1, 'warden');
    const fast = calmWorld(1, 'drift');
    stepN(slow, 30, 1, 0);
    stepN(fast, 30, 1, 0);
    expect(fast.player.x).toBeGreaterThan(slow.player.x);
    expect(fast.player.x).toBeCloseTo(fast.stats.speed * 30 * DT, 5);
  });

  it('partial joystick deflection moves proportionally slower', () => {
    const w = calmWorld();
    stepN(w, 60, 0.5, 0);
    expect(w.player.x).toBeCloseTo(w.stats.speed * 0.5 * 60 * DT, 5);
  });

  it('clamps input magnitudes above 1 (diagonals are not faster)', () => {
    const w = calmWorld();
    step(w, 3, 4);
    expect(Math.hypot(w.player.x, w.player.y)).toBeCloseTo(w.stats.speed * DT, 6);
    expect(w.player.x / w.player.y).toBeCloseTo(3 / 4, 6);
  });

  it('updates facing to the normalized move direction', () => {
    const w = calmWorld();
    step(w, 0, 1);
    expect(w.player.fx).toBeCloseTo(0, 9);
    expect(w.player.fy).toBeCloseTo(1, 9);
    step(w, 3, 4);
    expect(w.player.fx).toBeCloseTo(0.6, 6);
    expect(w.player.fy).toBeCloseTo(0.8, 6);
  });

  it('keeps facing when the stick is nearly centered, and when idle', () => {
    const w = calmWorld();
    step(w, 1, 0);
    step(w, 0.05, 0.05);
    step(w, 0, 0);
    expect(w.player.fx).toBeCloseTo(1, 9);
    expect(w.player.fy).toBeCloseTo(0, 9);
  });

  it('does not advance time or move while a level-up is pending', () => {
    const w = calmWorld();
    w.pendingLevels = 1;
    step(w, 1, 0);
    expect(w.time).toBe(0);
    expect(w.player.x).toBe(0);
    w.pendingLevels = 0;
    w.chestQueue = 1;
    step(w, 1, 0);
    expect(w.tick).toBe(0);
  });

  it('regen heals but never beyond maxHp', () => {
    const w = calmWorld();
    w.stats.regen = 5;
    w.player.hp = w.stats.maxHp - 1;
    stepN(w, 60);
    expect(w.player.hp).toBeCloseTo(w.stats.maxHp, 6);
  });
});

describe('createWorld', () => {
  it('starts each character with its own weapon at full health', () => {
    const w = createWorld(3, 'volt');
    expect(w.weapons).toHaveLength(1);
    expect(w.weapons[0].level).toBe(1);
    expect(w.player.hp).toBe(w.stats.maxHp);
    expect(w.status).toBe('playing');
  });

  it('applies meta ranks from a profile (revive, rerolls)', () => {
    const base = createWorld(3);
    const p = emptyProfile();
    p.ranks.revive = META.find((m) => m.id === 'revive')!.max;
    p.ranks.reroll = 1;
    const w = createWorld(3, 'spark', p);
    expect(w.player.revives).toBe(1);
    expect(w.rerolls).toBe(base.rerolls + 1);
  });
});
