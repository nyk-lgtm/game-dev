import { describe, expect, it } from 'vitest';
import { CAR_HIT_W, MAX_SPEED, SEG_LEN, SPAWN_MIN, newRace, step, type Input, type Race } from '../../src/nightline/core';

const coast: Input = { steer: 0, boost: false, brake: false };

function run(seed: number, steps: number, input: (r: Race, i: number) => Input = () => coast): Race {
  const r = newRace(seed);
  for (let i = 0; i < steps && r.status === 'racing'; i++) {
    step(r, input(r, i));
    r.fx.length = 0;
  }
  return r;
}

describe('nightline race', () => {
  it('is deterministic for a seed and input sequence', () => {
    const wobble = (_r: Race, i: number): Input => ({ steer: Math.sin(i / 40), boost: i % 300 < 60, brake: i % 500 > 480 });
    const a = run(7, 3000, wobble);
    const b = run(7, 3000, wobble);
    expect(a.player).toEqual(b.player);
    expect(a.cars).toEqual(b.cars);
    expect(a.score).toBe(b.score);
  });

  it('spawns later traffic out of sight', () => {
    const r = newRace(3);
    const seen = new Set(r.cars.map((c) => c.id));
    for (let i = 0; i < 4000 && r.status === 'racing'; i++) {
      step(r, { ...coast, steer: -r.player.x * 2 });
      r.fx.length = 0;
      for (const c of r.cars) {
        if (seen.has(c.id)) continue;
        seen.add(c.id);
        // Spawned during this step, then moved by at most one step.
        expect(c.z - r.player.z).toBeGreaterThanOrEqual(SEG_LEN * SPAWN_MIN - MAX_SPEED);
      }
    }
    expect(seen.size).toBeGreaterThan(r.cars.length);
  });

  it('rear-ends a car only when the sprites overlap sideways', () => {
    for (const [dx, hit] of [
      [0, true],
      [CAR_HIT_W * 0.9, true],
      [CAR_HIT_W * 1.1, false],
    ] as const) {
      const r = newRace(1);
      r.player.speed = MAX_SPEED;
      r.player.z = SEG_LEN * 10;
      r.cars = [{ id: 999, x: 0, z: r.player.z + SEG_LEN * 0.3, speed: MAX_SPEED * 0.3, kind: 0 }];
      r.player.x = dx;
      step(r, coast);
      expect(r.crashes > 0).toBe(hit);
    }
  });
});
