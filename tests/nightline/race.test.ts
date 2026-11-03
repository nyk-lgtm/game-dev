import { describe, expect, it } from 'vitest';
import { CAR_HIT_W, MAX_SPEED, NEAR_MISS_POINTS, NEAR_MISS_W, RISK_STEP, SEG_LEN, SPAWN_MIN, STAGES, TREE, newRace, step, type Input, type Race } from '../../src/nightline/core';

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

  it('the fork follows the side of the road; the hard (right) branch raises the score multiplier', () => {
    for (const side of [0, 1]) {
      const r = newRace(5);
      r.cars = [];
      r.player.z = (r.stages[0].end - 2) * SEG_LEN;
      r.player.speed = MAX_SPEED;
      r.player.x = side ? 0.5 : -0.5;
      for (let i = 0; i < 60 && r.stage === 0; i++) step(r, coast);
      expect(r.route).toEqual([side]);
      expect(r.stages[1].biome).toBe(TREE[1][side]);
      expect(r.mult).toBe(side ? 1 + RISK_STEP : 1);
      const cp = r.fx.find((e) => e.type === 'checkpoint');
      expect(cp).toMatchObject({ type: 'checkpoint', stage: 1, hard: side === 1 });
      // Passing a car is worth 100 points times the multiplier.
      r.cars = [{ id: 999, x: r.player.x, z: r.player.z + 1, speed: 0, kind: 0 }];
      r.player.x += 0.6;
      const before = r.score;
      step(r, coast);
      expect(r.score - before).toBeGreaterThanOrEqual(100 * r.mult);
      expect(r.score - before).toBeLessThan(100 * r.mult + 10);
    }
  });

  it('no branch leads into the biome just driven, and the five goals differ', () => {
    for (let l = 1; l < STAGES; l++)
      TREE[l].forEach((b, p) => {
        if (p < TREE[l - 1].length) expect(b).not.toBe(TREE[l - 1][p]);
        if (p > 0) expect(b).not.toBe(TREE[l - 1][p - 1]);
      });
    expect(new Set(TREE[STAGES - 1]).size).toBe(TREE[STAGES - 1].length);
  });

  it('a clean pass just beside a car is a near miss: bonus points and more nitro', () => {
    for (const [dx, close] of [
      [(CAR_HIT_W + NEAR_MISS_W) / 2, true],
      [NEAR_MISS_W + 0.05, false],
    ] as const) {
      const r = newRace(2);
      r.player.z = SEG_LEN * 10;
      r.player.speed = MAX_SPEED;
      r.player.nitro = 0;
      r.cars = [{ id: 999, x: 0, z: r.player.z + 1, speed: 0, kind: 0 }];
      r.player.x = dx;
      const before = r.score;
      step(r, coast);
      expect(r.crashes).toBe(0);
      expect(r.fx).toContainEqual({ type: 'pass', close });
      const pts = r.score - before;
      expect(pts).toBeGreaterThanOrEqual(100 + (close ? NEAR_MISS_POINTS : 0));
      expect(pts).toBeLessThan(110 + (close ? NEAR_MISS_POINTS : 0));
    }
  });
});
