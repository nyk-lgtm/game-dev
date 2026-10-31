import { describe, expect, it } from 'vitest';
import {
  DT,
  EVENTS,
  HARD_CAP,
  RUN_SECONDS,
  WAVES,
  createWorld,
  currentWave,
  damage,
  step,
  type World,
} from '../../src/afterglow/core';
import { calmWorld, makeImmortal, resolveWaiting, stepN } from './helpers';

/** A calm world positioned just before an event fires. */
function beforeEvent(at: number): World {
  const w = calmWorld(3);
  makeImmortal(w);
  w.time = at - 3 * DT;
  // Skip everything scripted before this moment (and the per-minute elites),
  // as if it had already happened.
  for (const e of EVENTS) if (e.at < at) w.eventsDone.push(e.id);
  for (let k = 0; k < 15; k++) w.eventsDone.push(`elite${k}`);
  return w;
}

describe('scripted events', () => {
  it('has unique ids, ordered times, and the Eclipse at RUN_SECONDS', () => {
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
    const times = EVENTS.map((e) => e.at);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(EVENTS.find((e) => e.id === 'eclipse')?.at).toBe(RUN_SECONDS);
    expect(EVENTS.find((e) => e.id === 'prism')).toBeDefined();
  });

  for (const ev of EVENTS) {
    it(`${ev.id} fires once at its time, with a warning, and spawns enemies`, () => {
      const w = beforeEvent(ev.at);
      // Not yet.
      expect(w.eventsDone).not.toContain(ev.id);
      const n0 = w.enemies.length;
      step(w, 0, 0);
      expect(w.eventsDone).not.toContain(ev.id);
      expect(w.enemies.length).toBe(n0);

      stepN(w, 4);
      expect(w.eventsDone.filter((id) => id === ev.id)).toHaveLength(1);
      if (ev.warn) expect(w.fx.some((f) => f.type === 'warn' && f.text === ev.warn)).toBe(true);
      expect(w.enemies.length).toBeGreaterThan(n0);

      // And never again.
      const warns = w.fx.filter((f) => f.type === 'warn' && f.text === ev.warn).length;
      stepN(w, 300);
      expect(w.eventsDone.filter((id) => id === ev.id)).toHaveLength(1);
      expect(w.fx.filter((f) => f.type === 'warn' && f.text === ev.warn).length).toBe(warns);
    });
  }

  it('the Prism event spawns exactly one boss and registers it as w.boss', () => {
    const at = EVENTS.find((e) => e.id === 'prism')!.at;
    const w = beforeEvent(at);
    stepN(w, 5);
    const prisms = w.enemies.filter((e) => e.kind === 'prism');
    expect(prisms).toHaveLength(1);
    expect(w.boss).toBe(prisms[0].id);
    stepN(w, 600);
    expect(w.enemies.filter((e) => e.kind === 'prism')).toHaveLength(1);
  });

  it('killing the Prism clears w.boss without ending the run', () => {
    const at = EVENTS.find((e) => e.id === 'prism')!.at;
    const w = beforeEvent(at);
    stepN(w, 5);
    const prism = w.enemies.find((e) => e.kind === 'prism')!;
    damage(w, prism, 1e9, null);
    expect(w.boss).toBeNull();
    expect(w.status).toBe('playing');
    expect(w.pickups.some((p) => p.kind === 'chest')).toBe(true);
  });

  it('no Eclipse before RUN_SECONDS; it spawns at RUN_SECONDS and is the boss', () => {
    const w = beforeEvent(RUN_SECONDS - 1);
    stepN(w, 30);
    expect(w.enemies.some((e) => e.kind === 'eclipse')).toBe(false);
    expect(w.boss).toBeNull();
    w.time = RUN_SECONDS - 3 * DT;
    stepN(w, 5);
    const ecl = w.enemies.filter((e) => e.kind === 'eclipse');
    expect(ecl).toHaveLength(1);
    expect(w.boss).toBe(ecl[0].id);
    expect(w.status).toBe('playing');
  });

  it('killing the Eclipse wins the run and freezes the sim', () => {
    const w = beforeEvent(RUN_SECONDS);
    stepN(w, 5);
    const ecl = w.enemies.find((e) => e.kind === 'eclipse')!;
    damage(w, ecl, 1e12, null);
    expect(w.status).toBe('won');
    expect(w.boss).toBeNull();
    const t = w.time;
    step(w, 1, 0);
    expect(w.time).toBe(t);
  });

  it('killing other enemies never wins the run', () => {
    const w = beforeEvent(RUN_SECONDS);
    stepN(w, 5);
    for (const e of [...w.enemies]) if (e.kind !== 'eclipse') damage(w, e, 1e9, null);
    expect(w.status).toBe('playing');
  });
});

describe('wave table', () => {
  it('currentWave follows the clock minute by minute and switches to the finale at RUN_SECONDS', () => {
    const w = createWorld(1);
    w.time = 0;
    expect(currentWave(w)).toBe(WAVES[0]);
    w.time = 61;
    expect(currentWave(w)).toBe(WAVES[1]);
    w.time = RUN_SECONDS - 1;
    expect(WAVES).toContain(currentWave(w));
    w.time = RUN_SECONDS + 1;
    expect(WAVES).not.toContain(currentWave(w));
  });

  it('regular spawns appear around the player over time and respect the wave max', () => {
    const w = createWorld(1);
    w.weapons = [];
    makeImmortal(w);
    for (let i = 0; i < 60 * 20; i++) step(w, 0, 0);
    expect(w.enemies.length).toBeGreaterThan(0);
    expect(w.enemies.length).toBeLessThanOrEqual(Math.max(...WAVES.map((x) => x.max)));
  });

  it('spawn mix only uses kinds listed in the wave', () => {
    const w = createWorld(1);
    w.weapons = [];
    makeImmortal(w);
    for (let i = 0; i < 60 * 30; i++) step(w, 0, 0);
    const allowed = new Set(Object.keys(WAVES[0].mix));
    for (const e of w.enemies) expect(allowed.has(e.kind)).toBe(true);
  });
});

describe('soak', () => {
  it.each([
    ['an armed player', true],
    ['an unarmed player (nothing thins the swarm)', false],
  ])('keeps the live enemy count at or below HARD_CAP over a 10-minute invulnerable run with %s', (_name, armed) => {
    const w = createWorld(2024);
    if (!armed) w.weapons = [];
    makeImmortal(w);
    let peak = 0;
    const total = Math.round((RUN_SECONDS + 30) * 60);
    for (let i = 0; i < total; i++) {
      resolveWaiting(w);
      step(w, Math.cos(i * 0.01), Math.sin(i * 0.013));
      if (w.enemies.length > peak) peak = w.enemies.length;
    }
    expect(w.status).toBe('playing');
    expect(w.time).toBeGreaterThan(RUN_SECONDS);
    expect(w.enemies.some((e) => e.kind === 'eclipse')).toBe(true);
    expect(peak).toBeGreaterThan(armed ? 20 : 100);
    expect(peak).toBeLessThanOrEqual(HARD_CAP);
    // No unbounded growth in other containers.
    expect(w.bullets.length).toBeLessThanOrEqual(300);
    expect(w.pickups.filter((p) => p.kind === 'gem').length).toBeLessThanOrEqual(200);
  }, 120_000);
});
