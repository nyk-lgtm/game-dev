// The race simulation: fixed 60 Hz steps, steering/boost/brake as input.
// Deterministic for a seed and input sequence.

import { Rng, mixSeed } from '../../shared/rng';
import { RUNOUT, SEG_LEN, STAGES, TrackBuilder, buildFork, buildStage, firstBiome, forkPair, routeCode } from './track';
import type { Input, Race, Segment, Stage } from './types';

/**
 * Bump when the same seed and inputs would race differently (v2: roadside hits bounce you back instead of
 * stopping you; v3: one crash per rear-end, hit widths per car kind, tighter clock, seeded biomes that never repeat;
 * v4: +9 s a checkpoint, +4 on the hard road).
 */
export const RULES_VERSION = 4;
export const DT = 1 / 60;
/** Top speed: 40 segments a second (shown as ~300 km/h). */
export const MAX_SPEED = SEG_LEN * 40;
export const BOOST_SPEED = MAX_SPEED * 1.3;
export const ACCEL = MAX_SPEED / 3.6;
export const BRAKE = MAX_SPEED * 1.2;
export const COAST = MAX_SPEED / 5;
export const OFFROAD_LIMIT = MAX_SPEED * 0.35;
export const CENTRIFUGAL = 0.32;
/**
 * The clock: seconds at the start, and added at each checkpoint (`bonus` + `step` x stage, plus `hard` on
 * the hard road). v2 gave 70 + 48..54 (-2 hard): the bot finished with ~45 s, humans with 20 crashes
 * still had plenty. v3: 62 + 44..50 (+2 on the twistier hard road): a first-timer-like bot (~20% of the time on
 * the grass) and the v3 blind tester never finished. v4: 62 + 53..59, +4 hard (that bot finishes about half).
 * Mutable so balance probes can try numbers.
 */
export const TUNE = { start: 62, bonus: 51, step: 2, hard: 4 };
/** Seconds added at the checkpoint into stage `level` (1..4). */
export function stageBonus(level: number, hard: boolean): number {
  return TUNE.bonus + level * TUNE.step + (hard ? TUNE.hard : 0);
}
/** A rear-end leaves you at this share of the car's speed. */
export const REAR_KEEP = 0.85;
/** At a fork you take the hard (right) road only past this far right; the middle takes the gentle one. */
export const FORK_SPLIT = 0.2;
/** A curve this strong can't be held at top speed without braking (full steer cancels 1 / CENTRIFUGAL). */
export const SHARP_CURVE = 3.2;
/** A bend this strong takes over half your steering at top speed: chevrons on the kerbs and a lighter warning. */
export const BEND_CURVE = 1.5;
export const NITRO_MAX = 4;
export const CAR_COUNT = 16;
/** Score multiplier gained per harder (right-hand) branch. */
export const RISK_STEP = 0.25;
/**
 * The renderer's contract: the road's half-width at the player's car is this
 * many text columns, and both the player's car and traffic beside it are drawn
 * 1:1 there. (v2 drew it 3.7 screens wide; now ~2.5, 64 columns to a screen.)
 */
export const ROAD_HALF_COLS = 80;
/**
 * Rear-end contact per traffic kind (sedan, van, sports car, hatchback):
 * lateral distance between car centers, in road half-widths, at which the
 * player's sprite and that car's overlap on screen. The art's silhouettes
 * touch at 24 / 24 / 26 / 22 columns apart (tests/nightline/art.test.ts
 * recomputes them from art.ts), over ROAD_HALF_COLS.
 */
export const CAR_HIT_W: readonly number[] = [0.3, 0.3, 0.325, 0.275];
/** An overtake this much wider than contact (but clean) is a near miss: bonus points and nitro. */
export const NEAR_MISS_PAD = 0.18;
export const hitW = (kind: number): number => CAR_HIT_W[kind % CAR_HIT_W.length];
export const nearMissW = (kind: number): number => hitW(kind) + NEAR_MISS_PAD;
export const NEAR_MISS_POINTS = 150;
/** Traffic appears at least this many segments ahead, beyond the renderer's draw distance (170), so cars never pop in. */
export const SPAWN_MIN = 175;
export const SPAWN_SPAN = 100;
/** How far ahead of the car's rear (its z) a roadside prop counts as hit. */
export const PROP_REACH = SEG_LEN * 0.5;
/** Hitting a roadside prop keeps this share of your speed (v1: a dead stop at 12% of top speed)... */
export const PROP_KEEP = 0.45;
/** ...and bounces you back toward the road at this sideways speed (road half-widths a second), easing off. */
export const PROP_BOUNCE = 2.4;

export function segmentAt(r: Race, z: number): Segment {
  const i = Math.floor(z / SEG_LEN);
  return r.segments[Math.max(0, Math.min(r.segments.length - 1, i))];
}

export function newRace(seed: number): Race {
  const b = new TrackBuilder([]);
  const biome = firstBiome(seed);
  const next = forkPair(seed, [biome], []);
  const first = buildStage(b, mixSeed(seed, routeCode([])), 0, biome, false);
  buildFork(b, biome, next);
  const r: Race = {
    seed,
    time: 0,
    clock: TUNE.start,
    segments: b.segments,
    stages: [{ biome, start: first.start, end: first.end, bonus: 0 }],
    stage: 0,
    route: [],
    next,
    player: { x: 0, z: 0, speed: 0, nitro: 2, boosting: false, stun: 0, steer: 0, push: 0 },
    cars: [],
    nextCarId: 1,
    score: 0,
    mult: 1,
    passed: 0,
    crashes: 0,
    status: 'racing',
    fx: [],
  };
  spawnTraffic(r);
  return r;
}

function rng(r: Race, salt: number): Rng {
  return new Rng(mixSeed(r.seed, salt));
}

/** Keep the road ahead populated with traffic. */
function spawnTraffic(r: Race): void {
  const p = r.player;
  const level = r.stage;
  const want = Math.round(CAR_COUNT * (0.6 + level * 0.15));
  // Retire cars far behind.
  r.cars = r.cars.filter((c) => c.z > p.z - SEG_LEN * 30);
  const g = rng(r, 5000 + r.nextCarId);
  const stage = r.stages[r.stage];
  const limit = (stage?.end ?? r.segments.length) * SEG_LEN;
  // The opening grid may fill the visible road; later cars start out of sight.
  const near = r.time === 0 ? 60 : SPAWN_MIN;
  while (r.cars.length < want) {
    const z = p.z + SEG_LEN * (near + g.next() * (SPAWN_MIN + SPAWN_SPAN - near));
    if (z > limit) break;
    const lane = g.int(-1, 1) * 0.62;
    r.cars.push({ id: r.nextCarId++, x: lane, z, speed: MAX_SPEED * (0.28 + g.next() * 0.3), kind: g.int(0, 3) });
  }
}

export function step(r: Race, input: Input): void {
  if (r.status !== 'racing') return;
  const dt = DT;
  const p = r.player;
  r.time += dt;
  r.clock -= dt;
  const seg = segmentAt(r, p.z);
  const pct = p.speed / MAX_SPEED;
  const offroad = Math.abs(p.x) > 1;

  // Speed.
  const top = p.boosting ? BOOST_SPEED : MAX_SPEED;
  p.boosting = input.boost && p.nitro > 0 && p.stun <= 0;
  if (p.boosting) {
    p.nitro = Math.max(0, p.nitro - dt);
    if (p.speed < BOOST_SPEED) p.speed += ACCEL * 1.8 * dt;
  } else if (p.stun > 0) {
    p.stun -= dt;
    p.speed -= COAST * dt;
  } else if (input.brake) p.speed -= BRAKE * dt;
  else if (p.speed < top) p.speed += ACCEL * dt * (1 - 0.5 * pct);
  if (p.speed > top && !p.boosting) p.speed -= COAST * 1.5 * dt;
  if (offroad && p.speed > OFFROAD_LIMIT) {
    p.speed -= MAX_SPEED * 0.9 * dt;
    if (Math.floor(r.time * 4) !== Math.floor((r.time - dt) * 4)) r.fx.push({ type: 'offroad' });
  }
  p.speed = Math.max(0, p.speed);

  // Steering, and the curve pushing you outward.
  p.steer += (input.steer - p.steer) * Math.min(1, dt * 10);
  const dx = dt * 2.4 * Math.min(1, pct * 1.4);
  p.x += input.steer * dx;
  p.x -= dx * pct * seg.curve * CENTRIFUGAL;
  // The bounce off a roadside prop, fading out over about half a second.
  if (p.push !== 0) {
    p.x += p.push * dt;
    p.push *= 1 - Math.min(1, dt * 4);
    if (Math.abs(p.push) < 0.05) p.push = 0;
  }
  p.x = Math.max(-2.6, Math.min(2.6, p.x));

  const before = p.z;
  p.z += p.speed * dt;

  // Roadside props: hitting one costs most of your speed and bounces you back toward the road.
  if (Math.abs(p.x) > 1) {
    const s2 = segmentAt(r, p.z + PROP_REACH);
    for (const pr of s2.props) {
      if (pr.kind === 'fork') continue;
      if (Math.abs(p.x - pr.offset) < 0.22) {
        p.speed = Math.max(MAX_SPEED * 0.12, p.speed * PROP_KEEP);
        p.stun = 0.35;
        p.x = pr.offset > 0 ? pr.offset - 0.3 : pr.offset + 0.3;
        p.push = -Math.sign(pr.offset) * PROP_BOUNCE;
        r.crashes++;
        r.fx.push({ type: 'crash', hard: true });
        break;
      }
    }
  }

  // Traffic.
  for (const c of r.cars) {
    const cseg = segmentAt(r, c.z);
    const cz0 = c.z;
    c.z += c.speed * dt;
    // Cars edge away from a player closing in behind them.
    const near = c.z - p.z;
    if (near > 0 && near < SEG_LEN * 20 && Math.abs(c.x - p.x) < 0.5) c.x += Math.sign(c.x - p.x || 1) * dt * 0.15;
    c.x = Math.max(-0.85, Math.min(0.85, c.x - cseg.curve * 0.0005));
    const gap = c.z - p.z;
    if (gap > -SEG_LEN * 0.4 && gap < SEG_LEN * 0.6 && Math.abs(c.x - p.x) < hitW(c.kind) && p.speed > c.speed) {
      // Rear-end: you drop below the car's speed (so the next frame can't count it again,
      // as v2's half-speed did at top speed into a slow car) and get nudged aside.
      p.speed = c.speed * REAR_KEEP;
      p.x += p.x > c.x ? 0.18 : -0.18;
      p.stun = 0.25;
      r.crashes++;
      r.fx.push({ type: 'crash', hard: false });
    }
    // Overtakes: ahead of you before this step, behind you after it.
    if (cz0 > before && c.z <= p.z) {
      const close = Math.abs(c.x - p.x) < nearMissW(c.kind);
      r.passed++;
      r.score += (100 + (close ? NEAR_MISS_POINTS : 0)) * r.mult;
      p.nitro = Math.min(NITRO_MAX, p.nitro + (close ? 0.6 : 0.35));
      r.fx.push({ type: 'pass', close });
    }
  }
  if (Math.floor(r.time * 2) !== Math.floor((r.time - dt) * 2)) spawnTraffic(r);

  // Distance score.
  r.score += ((p.speed * dt) / 100) * r.mult;

  // Checkpoint / fork.
  const stage = r.stages[r.stage];
  const segIndex = Math.floor(p.z / SEG_LEN);
  if (stage && segIndex >= stage.end) {
    if (r.stage + 1 >= STAGES) {
      r.status = 'finished';
      r.score += Math.max(0, r.clock) * 1000 * r.mult;
      r.fx.push({ type: 'finish' });
      return;
    }
    // Which side of the road were you on at the fork?
    const side = p.x > FORK_SPLIT ? 1 : 0;
    const biome = r.next![side];
    r.route.push(side);
    const level = r.stage + 1;
    const b = new TrackBuilder(r.segments);
    const built = buildStage(b, mixSeed(r.seed, routeCode(r.route)), level, biome, side === 1);
    r.next = level + 1 < STAGES ? forkPair(r.seed, [...r.stages.map((s) => s.biome), biome], r.route) : null;
    buildFork(b, biome, r.next);
    const bonus = stageBonus(level, side === 1);
    r.stages.push({ biome, start: built.start, end: built.end, bonus });
    r.stage = level;
    r.clock += bonus;
    if (side === 1) r.mult += RISK_STEP;
    r.fx.push({ type: 'checkpoint', stage: level, bonus, hard: side === 1 });
  }

  if (r.clock <= 0) {
    r.clock = 0;
    r.status = 'over';
    r.fx.push({ type: 'timeout' });
  }
}

/** Distance into the current stage (0..1), for the HUD. */
export function stageProgress(r: Race): number {
  const s: Stage | undefined = r.stages[r.stage];
  if (!s) return 1;
  const i = r.player.z / SEG_LEN;
  return Math.max(0, Math.min(1, (i - s.start) / (s.end - s.start)));
}

export { RUNOUT };
