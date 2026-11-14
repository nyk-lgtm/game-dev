import { describe, expect, it } from 'vitest';
import { BIOMES, CAR_HIT_W, MAX_SPEED, NEAR_MISS_POINTS, PROP_KEEP, PROP_REACH, REAR_KEEP, RISK_STEP, SEG_LEN, SPAWN_MIN, STAGES, firstBiome, forkPair, nearMissW, newRace, segmentAt, step, type BiomeId, type Input, type Race } from '../../src/nightline/core';

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

  it('rear-ends a car only when the sprites overlap sideways (per car kind)', () => {
    for (let kind = 0; kind < 4; kind++)
      for (const [dx, hit] of [
        [0, true],
        [CAR_HIT_W[kind] * 0.9, true],
        [CAR_HIT_W[kind] * 1.1, false],
      ] as const) {
        const r = newRace(1);
        r.player.speed = MAX_SPEED;
        r.player.z = SEG_LEN * 10;
        r.cars = [{ id: 999, x: 0, z: r.player.z + SEG_LEN * 0.3, speed: MAX_SPEED * 0.3, kind }];
        r.player.x = dx;
        step(r, coast);
        expect(r.crashes > 0).toBe(hit);
      }
  });

  it('a centred rear-end at top speed into a slow car is one crash, not two (v2 counted it twice)', () => {
    const r = newRace(1);
    r.cars = [];
    r.player.z = SEG_LEN * 10;
    r.player.speed = MAX_SPEED;
    r.player.x = 0;
    r.cars = [{ id: 999, x: 0, z: r.player.z + SEG_LEN * 2, speed: MAX_SPEED * 0.3, kind: 0 }];
    const before = r.player.x;
    for (let i = 0; i < 40; i++) step(r, coast);
    expect(r.crashes).toBe(1);
    // You end up just below the car's speed (then coast while stunned), shoved aside once.
    expect(r.player.speed).toBeLessThan(MAX_SPEED * 0.3);
    expect(r.player.speed).toBeGreaterThan(MAX_SPEED * 0.3 * REAR_KEEP * 0.8);
    expect(Math.abs(r.player.x - before)).toBeCloseTo(0.18, 2);
  });

  it('the fork follows the side of the road; the hard (right) branch raises the score multiplier', () => {
    for (const side of [0, 1]) {
      const r = newRace(5);
      r.cars = [];
      r.player.z = (r.stages[0].end - 2) * SEG_LEN;
      r.player.speed = MAX_SPEED;
      r.player.x = side ? 0.5 : -0.5;
      const next = r.next!;
      for (let i = 0; i < 60 && r.stage === 0; i++) step(r, coast);
      expect(r.route).toEqual([side]);
      expect(r.stages[1].biome).toBe(next[side]);
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

  it('no route repeats a biome, every fork offers two different ones, and stage 1 varies by seed', () => {
    const firsts = new Set<BiomeId>();
    for (let seed = 1; seed <= 40; seed++) {
      firsts.add(firstBiome(seed));
      const walk = (driven: BiomeId[], route: number[]): void => {
        expect(new Set(driven).size).toBe(driven.length);
        if (driven.length === STAGES) return;
        const pair = forkPair(seed, driven, route);
        expect(pair[0]).not.toBe(pair[1]);
        for (const side of [0, 1]) walk([...driven, pair[side]], [...route, side]);
      };
      walk([firstBiome(seed)], []);
    }
    expect(firsts.size).toBe(BIOMES.length);
  });

  it('a whole race drives five different biomes, as its fork signs said', () => {
    for (const seed of [3, 8]) {
      const r = newRace(seed);
      for (let i = 0; i < 60 * 900 && r.status === 'racing'; i++) {
        // Teleport to just before each fork, alternating sides, to keep the test fast.
        const st = r.stages[r.stage];
        if (r.player.z / SEG_LEN < st.end - 3) r.player.z = (st.end - 3) * SEG_LEN;
        r.cars = [];
        r.clock = 60;
        r.player.speed = MAX_SPEED;
        step(r, { ...coast, steer: r.stage % 2 ? 1 : -1 });
        r.fx.length = 0;
      }
      expect(r.status).toBe('finished');
      expect(r.next).toBeNull();
      expect(new Set(r.stages.map((s) => s.biome)).size).toBe(STAGES);
    }
  });

  it('a clean pass just beside a car is a near miss: bonus points and more nitro', () => {
    for (const [dx, close] of [
      [(CAR_HIT_W[0] + nearMissW(0)) / 2, true],
      [nearMissW(0) + 0.05, false],
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

  it('a roadside prop slows you hard and bounces you back toward the road, not a dead stop', () => {
    for (const side of [-1, 1]) {
      const r = newRace(4);
      r.cars = [];
      r.player.z = SEG_LEN * 200;
      r.player.speed = MAX_SPEED;
      // A straight, so no curve pushes you back out.
      for (let i = 195; i < 300; i++) r.segments[i].curve = 0;
      const seg = segmentAt(r, r.player.z + MAX_SPEED / 60 + PROP_REACH);
      seg.props = [{ kind: 'pine', offset: side * 1.5 }];
      r.player.x = side * 1.5;
      step(r, coast);
      expect(r.crashes).toBe(1);
      expect(r.player.speed).toBeGreaterThanOrEqual(MAX_SPEED * PROP_KEEP * 0.95);
      // Within a second the bounce has carried you back onto the road.
      for (let i = 0; i < 60; i++) step(r, coast);
      expect(Math.abs(r.player.x)).toBeLessThan(1);
      expect(r.player.push).toBe(0);
    }
  });
});
