import { describe, expect, it } from 'vitest';
import { createWorld, step, type World } from '../../src/afterglow/core';
import { makeImmortal, resolveWaiting } from './helpers';

const r3 = (n: number) => Math.round(n * 1000) / 1000;

function fingerprint(w: World): string {
  return JSON.stringify({
    time: r3(w.time),
    tick: w.tick,
    status: w.status,
    p: [r3(w.player.x), r3(w.player.y), r3(w.player.hp), w.player.level, r3(w.player.xp)],
    kills: w.kills,
    shards: r3(w.shards),
    enemies: w.enemies.length,
    ids: w.enemies.map((e) => [e.id, e.kind, r3(e.x), r3(e.y)]),
    weapons: w.weapons.map((x) => [x.id, x.level]),
    passives: w.passives,
    pickups: w.pickups.length,
    rng: w.rng.next(),
  });
}

/** Deterministic wandering input. */
const inputAt = (tick: number): [number, number] => [Math.cos(tick * 0.011), Math.sin(tick * 0.017 + 1)];

function run(seed: number, seconds: number, character = 'spark'): World {
  const w = createWorld(seed, character);
  makeImmortal(w);
  const steps = seconds * 60;
  for (let i = 0; i < steps; i++) {
    resolveWaiting(w);
    const [ix, iy] = inputAt(i);
    step(w, ix, iy);
  }
  return w;
}

describe('determinism', () => {
  it('same seed + same inputs => identical world after two simulated minutes', () => {
    const a = run(1234, 120);
    const b = run(1234, 120);
    expect(a.time).toBeGreaterThan(100);
    expect(a.kills).toBeGreaterThan(0);
    expect(a.enemies.length).toBeGreaterThan(0);
    expect(fingerprint(a)).toBe(fingerprint(b));
  }, 60_000);

  it('different seeds diverge', () => {
    const a = run(1, 30);
    const b = run(2, 30);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('different inputs diverge for the same seed', () => {
    const a = createWorld(5);
    const b = createWorld(5);
    for (let i = 0; i < 600; i++) {
      resolveWaiting(a);
      resolveWaiting(b);
      step(a, 1, 0);
      step(b, 0, 1);
    }
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('every character is deterministic too', () => {
    for (const c of ['spark', 'warden', 'volt', 'drift']) {
      expect(fingerprint(run(77, 20, c))).toBe(fingerprint(run(77, 20, c)));
    }
  });
});
