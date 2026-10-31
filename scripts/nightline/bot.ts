// A simple Nightline autopilot for balance probes: holds the racing line
// against curves, dodges traffic ahead, boosts on straights, picks a fork.
import { MAX_SPEED, SEG_LEN, newRace, segmentAt, step, type Input, type Race } from '../../src/nightline/core';

export function autopilot(r: Race, forkSide = 0): Input {
  const p = r.player;
  const seg = segmentAt(r, p.z + SEG_LEN * 8);
  // Aim slightly into the curve, back toward a target lane.
  let target = Math.max(-0.7, Math.min(0.7, seg.curve * 0.08));
  // Dodge the nearest car ahead in our lane.
  for (const c of r.cars) {
    const gap = c.z - p.z;
    if (gap > 0 && gap < SEG_LEN * 25 && Math.abs(c.x - p.x) < 0.5) {
      target = c.x > 0 ? c.x - 0.75 : c.x + 0.75;
      break;
    }
  }
  const stage = r.stages[r.stage];
  if (stage && stage.end - p.z / SEG_LEN < 40) target = forkSide ? 0.6 : -0.6;
  const steer = Math.max(-1, Math.min(1, (target - p.x) * 3));
  const straight = Math.abs(seg.curve) < 1.5;
  return { steer, boost: straight && p.speed > MAX_SPEED * 0.8, brake: false };
}

export function drive(seed: number, forkSide = 0) {
  const r = newRace(seed);
  while (r.status === 'racing' && r.time < 900) {
    step(r, autopilot(r, forkSide));
    r.fx.length = 0;
  }
  return r;
}
