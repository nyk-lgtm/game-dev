// A Nightline autopilot for balance probes: holds the racing line against curves, picks the clearest
// spot among the cars ahead, boosts on straights, picks a fork. `Skill` makes it see less: `look` is
// how far ahead it notices cars (segments), `miss` the share of cars it never notices (a "crashy" driver).
import { MAX_SPEED, SEG_LEN, SHARP_CURVE, hitW, mixSeed, newRace, segmentAt, step, type Input, type Race } from '../../src/nightline/core';

export interface Skill {
  /** Segments ahead at which a car is noticed (40 = one second at top speed). */
  look: number;
  /** Share of cars never noticed (seeded per car). */
  miss: number;
  /** Chance per 2-second window of drifting onto the grass for a moment (a first-timer). */
  wander?: number;
}

export const SKILLS: Record<string, Skill> = {
  clean: { look: 45, miss: 0 },
  // Sees cars only ~0.4 s out and overlooks one in eight: ~15-20 crashes a race.
  crashy: { look: 18, miss: 0.08 },
  // Crashy, and drifts onto the grass now and then: ~20% of the time off the road, like the v3 blind tester.
  sloppy: { look: 18, miss: 0.08, wander: 0.5 },
};

const SPOTS = [-0.78, -0.55, -0.3, 0, 0.3, 0.55, 0.78];
/** The spot each race's bot aimed for last frame. */
const last = new WeakMap<Race, number>();

export function autopilot(r: Race, forkSide = 0, skill: Skill = SKILLS.clean): Input {
  const p = r.player;
  const seg = segmentAt(r, p.z + SEG_LEN * 8);
  // Aim slightly into the curve.
  const lean = Math.max(-0.5, Math.min(0.5, seg.curve * 0.06));
  const seen = r.cars.filter((c) => {
    const gap = c.z - p.z;
    if (gap <= -SEG_LEN * 0.4 || gap > SEG_LEN * skill.look || c.speed >= p.speed) return false;
    return (mixSeed(r.seed, c.id) % 1000) / 1000 >= skill.miss;
  });
  const prev = last.get(r) ?? 0;
  let best = lean;
  let bestCost = Infinity;
  for (const x of SPOTS) {
    // Stick with the spot picked last frame unless another is clearly better.
    let cost = Math.abs(x - lean) * 0.5 + Math.abs(x - p.x) * 0.3 + (Math.abs(x - prev) > 0.01 ? 0.4 : 0);
    for (const c of seen) {
      const t = Math.max(0.03, (c.z - p.z) / Math.max(1, p.speed - c.speed));
      const clear = hitW(c.kind) + 0.1;
      // A car on that spot, worse the sooner you'd reach it.
      if (Math.abs(c.x - x) < clear) cost += 4 / t;
      // A car you'd reach before you could steer clear of it (2.4 half-widths a second at full lock).
      const dodge = Math.max(0, clear - Math.abs(c.x - p.x)) / 2.2;
      if (Math.sign(x - p.x) === Math.sign(c.x - p.x) && Math.abs(c.x - p.x) < clear && t < dodge + 0.15) cost += 6 / t;
      // A close car between you and that spot blocks the move there.
      const lo = Math.min(p.x, x) - clear;
      const hi = Math.max(p.x, x) + clear;
      if (t < Math.abs(x - p.x) / 2.2 + 0.2 && c.x > lo && c.x < hi) cost += 2 / t;
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = x;
    }
  }
  last.set(r, best);
  let target = best;
  if (skill.wander) {
    // A drift: in some 2-second windows, the first second aims off the road on one side.
    const win = Math.floor(r.time / 2);
    const h = mixSeed(r.seed ^ 0x5a5a, win);
    if ((h % 1000) / 1000 < skill.wander && r.time - win * 2 < 1) target = h & 1024 ? 1.4 : -1.4;
  }
  const stage = r.stages[r.stage];
  if (stage && stage.end - p.z / SEG_LEN < 40) target = forkSide ? 0.6 : -0.6;
  const steer = Math.max(-1, Math.min(1, (target - p.x) * 4));
  // Boxed in: a car on your line within half a second you can't get round.
  const boxed = seen.some((c) => Math.abs(c.x - p.x) < hitW(c.kind) && (c.z - p.z) / Math.max(1, p.speed - c.speed) < 0.35 && Math.abs(target - p.x) < 0.2);
  const straight = Math.abs(seg.curve) < 1.5;
  // Brake into a curve too sharp to hold at speed (what the HUD's warning says), or when sliding off the road.
  const sharp = Math.abs(segmentAt(r, p.z + SEG_LEN * 12).curve) > SHARP_CURVE && p.speed > MAX_SPEED * 0.75;
  const sliding = Math.abs(p.x) > 0.95 && Math.sign(p.x) === Math.sign(-seg.curve || p.x) && p.speed > MAX_SPEED * 0.6;
  return { steer, boost: straight && !boxed && p.speed > MAX_SPEED * 0.8, brake: boxed || sharp || sliding };
}

export interface Drive {
  race: Race;
  /** Clock left at each checkpoint (before its bonus) and at the finish. */
  splits: number[];
  props: number;
  rears: number;
  /** Share of the race spent off the road. */
  grass: number;
}

export function drive(seed: number, forkSide = 0, skill: Skill = SKILLS.clean): Drive {
  const r = newRace(seed);
  const splits: number[] = [];
  let props = 0;
  let rears = 0;
  let off = 0;
  let steps = 0;
  while (r.status === 'racing' && r.time < 900) {
    step(r, autopilot(r, forkSide, skill));
    steps++;
    if (Math.abs(r.player.x) > 1) off++;
    for (const e of r.fx) {
      if (e.type === 'checkpoint') splits.push(r.clock - e.bonus);
      if (e.type === 'crash') e.hard ? props++ : rears++;
    }
    r.fx.length = 0;
  }
  if (r.status === 'finished') splits.push(r.clock);
  return { race: r, splits, props, rears, grass: off / Math.max(1, steps) };
}
