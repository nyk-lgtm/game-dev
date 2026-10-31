// The race simulation: fixed 60 Hz steps, steering/boost/brake as input.
// Deterministic for a seed and input sequence.

import { Rng, mixSeed } from '../../shared/rng';
import { RUNOUT, SEG_LEN, STAGES, TREE, TrackBuilder, buildFork, buildStage } from './track';
import type { Input, Race, Segment, Stage } from './types';

export const DT = 1 / 60;
/** Top speed: 40 segments a second (shown as ~300 km/h). */
export const MAX_SPEED = SEG_LEN * 40;
export const BOOST_SPEED = MAX_SPEED * 1.3;
export const ACCEL = MAX_SPEED / 3.6;
export const BRAKE = MAX_SPEED * 1.2;
export const COAST = MAX_SPEED / 5;
export const OFFROAD_LIMIT = MAX_SPEED * 0.35;
export const CENTRIFUGAL = 0.32;
export const START_CLOCK = 65;
export const NITRO_MAX = 4;
export const CAR_COUNT = 14;
/** Car half-width in road half-widths. */
export const CAR_W = 0.22;

export function segmentAt(r: Race, z: number): Segment {
  const i = Math.floor(z / SEG_LEN);
  return r.segments[Math.max(0, Math.min(r.segments.length - 1, i))];
}

export function newRace(seed: number): Race {
  const b = new TrackBuilder([]);
  const first = buildStage(b, seed, 0, TREE[0][0], false);
  buildFork(b, 0, 0, TREE[0][0]);
  const r: Race = {
    seed,
    time: 0,
    clock: START_CLOCK,
    segments: b.segments,
    stages: [{ biome: TREE[0][0], start: first.start, end: first.end, bonus: 0 }],
    stage: 0,
    route: [],
    player: { x: 0, z: 0, speed: 0, nitro: 2, boosting: false, stun: 0, steer: 0 },
    cars: [],
    nextCarId: 1,
    score: 0,
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
  while (r.cars.length < want) {
    const z = p.z + SEG_LEN * (60 + g.next() * 260);
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
  p.x = Math.max(-2.6, Math.min(2.6, p.x));

  const before = p.z;
  p.z += p.speed * dt;

  // Roadside props: hitting one stops you hard.
  if (Math.abs(p.x) > 1) {
    const s2 = segmentAt(r, p.z);
    for (const pr of s2.props) {
      if (pr.kind === 'fork') continue;
      if (Math.abs(p.x - pr.offset) < 0.22) {
        p.speed = MAX_SPEED * 0.12;
        p.stun = 0.5;
        p.x = pr.offset > 0 ? pr.offset - 0.3 : pr.offset + 0.3;
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
    if (gap > -SEG_LEN * 0.4 && gap < SEG_LEN * 0.6 && Math.abs(c.x - p.x) < CAR_W * 2 && p.speed > c.speed) {
      // Rear-end: you lose your speed and get nudged aside.
      p.speed = Math.max(c.speed * 0.85, p.speed * 0.5);
      p.x += p.x > c.x ? 0.18 : -0.18;
      p.stun = 0.25;
      r.crashes++;
      r.fx.push({ type: 'crash', hard: false });
    }
    // Overtakes: ahead of you before this step, behind you after it.
    if (cz0 > before && c.z <= p.z) {
      r.passed++;
      r.score += 100;
      p.nitro = Math.min(NITRO_MAX, p.nitro + 0.35);
      r.fx.push({ type: 'pass' });
    }
  }
  if (Math.floor(r.time * 2) !== Math.floor((r.time - dt) * 2)) spawnTraffic(r);

  // Distance score.
  r.score += (p.speed * dt) / 100;

  // Checkpoint / fork.
  const stage = r.stages[r.stage];
  const segIndex = Math.floor(p.z / SEG_LEN);
  if (stage && segIndex >= stage.end) {
    if (r.stage + 1 >= STAGES) {
      r.status = 'finished';
      r.score += Math.max(0, r.clock) * 1000;
      r.fx.push({ type: 'finish' });
      return;
    }
    // Which side of the road were you on at the fork?
    const side = p.x > 0 ? 1 : 0;
    r.route.push(side);
    const pos = r.route.reduce((a, b) => a + b, 0);
    const level = r.stage + 1;
    const biome = TREE[level][pos];
    const b = new TrackBuilder(r.segments);
    const built = buildStage(b, r.seed + pos * 31, level, biome, side === 1);
    buildFork(b, level, pos, biome);
    const bonus = 46 + level * 2 - (side === 1 ? 4 : 0);
    r.stages.push({ biome, start: built.start, end: built.end, bonus });
    r.stage = level;
    r.clock += bonus;
    r.fx.push({ type: 'checkpoint', stage: level, bonus });
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
