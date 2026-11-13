// One Sungrazer run, stepped at a fixed 240 Hz. Holding grabs a star (one per
// press): the comet swings round it on a tether that slowly reels in, faster as
// it tightens; letting go flings it off along the tangent, then gravity pulls.
// Touch a star or a cinder and you burn; fall behind the rising void and you're
// lost. Points: altitude, new links (×combo), grazing the corona, close shaves.

import { COMET_R, MODES, MOTE_R, START_Y, STEP, TPS, VIEW_H, W, World, cinderX, isLit, lowerY, zoneAt, type Mode, type Star } from './world';

/** How far a press reaches for a star (centre distance). */
export const LOCK = 28;
/** Gravity in free flight (units/s²). */
export const GRAVITY = 40;
/** A close shave: passing this close to a surface without touching it. */
export const NEAR = 2.6;
/** Letting go of an orbit this close to the surface is a sungraze. */
export const SUNGRAZE = 2.2;
export const MAX_MULT = 9;
/** Free flight longer than this drops the combo. */
export const LINK_TICKS = Math.round(2.6 * TPS);
/** The star you just let go of can't be grabbed again for this long. */
export const REGRAB = Math.round(0.6 * TPS);
const MAX_FALL = 95;
/** Where the camera keeps the comet (share of VIEW_H from the bottom). */
const CAM_AT = 0.45;

export const PTS = { link: 10, graze: 50, near: 25, sungraze: 40, mote: 10 };

/** Orbit speed at an altitude. */
export const speedAt = (alt: number) => 58 + Math.min(30, alt / 80);
/** The void's minimum climb rate. */
export const riseAt = (alt: number) => 2 + Math.min(12, alt / 220);
export const reelAt = (alt: number) => 3.5 + Math.min(2.5, alt / 900);

export type Cause = 'burn' | 'cinder' | 'void';
export type EvKind = 'grab' | 'release' | 'snap' | 'link' | 'near' | 'sungraze' | 'mote' | 'bounce' | 'drop' | 'zone' | 'die';
export interface Ev {
  k: EvKind;
  x: number;
  y: number;
  /** Points earned by it (already multiplied), if any. */
  pts?: number;
  /** Combo after it. */
  mult?: number;
  /** Zone index, cause or star id, depending on the kind. */
  n?: number;
  cause?: Cause;
}

export interface Tether {
  star: Star;
  r: number;
  dir: 1 | -1;
  /** Closest the comet has been to the surface on this orbit. */
  minClear: number;
}

export interface Run {
  world: World;
  seed: number;
  mode: Mode;
  tick: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  held: boolean;
  /** This press has already grabbed (one star per press). */
  used: boolean;
  tether: Tether | null;
  /** The last star tethered (its id), so grabbing it again isn't a new link. */
  last: number;
  camY: number;
  maxY: number;
  score: number;
  mult: number;
  /** Ticks left before the combo drops (free flight only). */
  link: number;
  /** Ticks since the last tether ended. */
  since: number;
  grazing: boolean;
  /** Ids of things the comet is shaving past right now (cinders are offset by 1e6). */
  nears: number[];
  got: Set<number>;
  alive: boolean;
  cause: Cause | null;
  zone: number;
  stats: { links: number; graze: number; nears: number; sungrazes: number; motes: number; bounces: number; bestMult: number };
}

export function newRun(seed: number, mode: Mode = 'n', world?: World): Run {
  const w = world ?? new World(seed, mode);
  return {
    world: w, seed, mode, tick: 0,
    x: W / 2, y: START_Y, vx: 0, vy: 62,
    held: false, used: false, tether: null, last: -1,
    camY: 0, maxY: START_Y, score: 0, mult: 1, link: 0, since: REGRAB, grazing: false,
    nears: [], got: new Set(), alive: true, cause: null, zone: 0,
    stats: { links: 0, graze: 0, nears: 0, sungrazes: 0, motes: 0, bounces: 0, bestMult: 1 },
  };
}

/** A copy that shares the (immutable, lazily grown) world. */
export function cloneRun(r: Run): Run {
  return { ...r, tether: r.tether && { ...r.tether }, nears: r.nears.slice(), got: new Set(r.got), stats: { ...r.stats } };
}

export const altitude = (r: Run) => Math.max(0, r.maxY - START_Y);

/** The star a press would grab now: the nearest lit one in reach. */
export function target(r: Run): Star | null {
  const stars = r.world.stars;
  let best: Star | null = null, bd = LOCK;
  for (let i = lowerY(stars, r.y - LOCK); i < stars.length && stars[i].y <= r.y + LOCK; i++) {
    const s = stars[i];
    const d = Math.hypot(s.x - r.x, s.y - r.y);
    if (d <= bd && d > s.r + COMET_R + 0.6 && isLit(s, r.tick) && (s.id !== r.last || r.since >= REGRAB)) {
      bd = d;
      best = s;
    }
  }
  return best;
}

function emit(out: Ev[] | undefined, e: Ev): void {
  if (out) out.push(e);
}

function bump(r: Run): void {
  r.mult = Math.min(MAX_MULT, r.mult + 1);
  if (r.mult > r.stats.bestMult) r.stats.bestMult = r.mult;
}

function die(r: Run, cause: Cause, out?: Ev[]): void {
  r.alive = false;
  r.cause = cause;
  r.tether = null;
  r.grazing = false;
  emit(out, { k: 'die', x: r.x, y: r.y, cause });
}

function letGo(r: Run, out: Ev[] | undefined, snapped: boolean): void {
  const t = r.tether!;
  r.tether = null;
  r.grazing = false;
  r.link = LINK_TICKS;
  r.since = 0;
  if (snapped) {
    emit(out, { k: 'snap', x: r.x, y: r.y });
    return;
  }
  const pts = MODES[r.mode].points;
  if (t.minClear < SUNGRAZE) {
    const p = PTS.sungraze * r.mult * pts;
    r.score += p;
    bump(r);
    r.stats.sungrazes++;
    emit(out, { k: 'sungraze', x: r.x, y: r.y, pts: p, mult: r.mult });
  } else emit(out, { k: 'release', x: r.x, y: r.y });
}

/** Advance one tick with the button held or not. */
export function step(r: Run, held: boolean, out?: Ev[]): void {
  if (!r.alive) return;
  const w = r.world;
  const m = MODES[r.mode];
  const alt = altitude(r);
  w.ensure(r.y + VIEW_H * 2);

  // Input: a new press may grab once; letting go releases the tether.
  if (held && !r.held) r.used = false;
  if (!held && r.held && r.tether) letGo(r, out, false);
  r.held = held;
  if (held && !r.used && !r.tether) {
    const s = target(r);
    if (s) {
      r.used = true;
      const ex = r.x - s.x, ey = r.y - s.y;
      const d = Math.hypot(ex, ey);
      r.tether = { star: s, r: d, dir: ex * r.vy - ey * r.vx >= 0 ? 1 : -1, minClear: d - s.r - COMET_R };
      r.nears = r.nears.filter((id) => id !== s.id);
      emit(out, { k: 'grab', x: r.x, y: r.y, n: s.id });
      if (s.id !== r.last) {
        const p = PTS.link * r.mult * m.points;
        r.score += p;
        r.stats.links++;
        emit(out, { k: 'link', x: s.x, y: s.y, pts: p, mult: r.mult, n: s.id });
      }
      r.last = s.id;
    }
  }
  // A pulsar going dark drops you.
  if (r.tether && !isLit(r.tether.star, r.tick)) letGo(r, out, true);

  // Move.
  const t = r.tether;
  if (t) {
    const s = t.star;
    t.r -= reelAt(alt) * m.reel * STEP;
    let sp = Math.hypot(r.vx, r.vy);
    const target = speedAt(alt) * m.speed;
    sp += (target - sp) * Math.min(1, 6 * STEP);
    let ex = r.x - s.x, ey = r.y - s.y;
    let d = Math.hypot(ex, ey) || 1e-6;
    r.x += (-ey / d) * t.dir * sp * STEP;
    r.y += (ex / d) * t.dir * sp * STEP;
    ex = r.x - s.x;
    ey = r.y - s.y;
    d = Math.hypot(ex, ey) || 1e-6;
    r.x = s.x + (ex / d) * t.r;
    r.y = s.y + (ey / d) * t.r;
    r.vx = (-ey / d) * t.dir * sp;
    r.vy = (ex / d) * t.dir * sp;
    const clear = t.r - s.r - COMET_R;
    if (clear <= 0) {
      die(r, 'burn', out);
      return;
    }
    if (clear < t.minClear) t.minClear = clear;
    r.grazing = clear < s.band;
    if (r.grazing) {
      r.score += PTS.graze * STEP * r.mult * m.graze * m.points * (1 + (1 - clear / s.band));
      r.stats.graze += STEP;
    }
  } else {
    r.vy = Math.max(-MAX_FALL, r.vy - GRAVITY * STEP);
    r.x += r.vx * STEP;
    r.y += r.vy * STEP;
  }

  // Walls bounce you back and cost the combo.
  if (r.x < COMET_R || r.x > W - COMET_R) {
    r.x = r.x < COMET_R ? COMET_R : W - COMET_R;
    r.vx = r.x < W / 2 ? Math.abs(r.vx) : -Math.abs(r.vx);
    // On a tether the bounce turns the orbit round.
    if (r.tether) r.tether.dir = r.tether.dir === 1 ? -1 : 1;
    r.stats.bounces++;
    if (r.mult > 1) emit(out, { k: 'drop', x: r.x, y: r.y });
    r.mult = 1;
    emit(out, { k: 'bounce', x: r.x, y: r.y });
  }

  // Stars and cinders: touch = burn; a close pass = a close shave once you're clear.
  const nowNear: number[] = [];
  const stars = w.stars;
  for (let i = lowerY(stars, r.y - 12); i < stars.length && stars[i].y <= r.y + 12; i++) {
    const s = stars[i];
    if (r.tether && r.tether.star === s) continue;
    const clear = Math.hypot(s.x - r.x, s.y - r.y) - s.r - COMET_R;
    if (clear <= 0) {
      die(r, 'burn', out);
      return;
    }
    if (clear < NEAR && s.id !== r.last) nowNear.push(s.id);
  }
  const cs = w.cinders;
  for (let i = lowerY(cs, r.y - 6); i < cs.length && cs[i].y <= r.y + 6; i++) {
    const c = cs[i];
    const clear = Math.hypot(cinderX(c, r.tick) - r.x, c.y - r.y) - c.r - COMET_R;
    if (clear <= 0) {
      die(r, 'cinder', out);
      return;
    }
    if (clear < NEAR) nowNear.push(1e6 + c.id);
  }
  for (const id of r.nears)
    if (!nowNear.includes(id)) {
      const p = PTS.near * r.mult * m.points;
      r.score += p;
      bump(r);
      r.stats.nears++;
      emit(out, { k: 'near', x: r.x, y: r.y, pts: p, mult: r.mult, n: id });
    }
  r.nears = nowNear;

  // Motes.
  const ms = w.motes;
  for (let i = lowerY(ms, r.y - 4); i < ms.length && ms[i].y <= r.y + 4; i++) {
    const mo = ms[i];
    if (r.got.has(mo.id)) continue;
    if (Math.hypot(mo.x - r.x, mo.y - r.y) < MOTE_R + COMET_R) {
      r.got.add(mo.id);
      const p = PTS.mote * r.mult * m.points;
      r.score += p;
      r.stats.motes++;
      if (!r.tether) r.link = LINK_TICKS;
      emit(out, { k: 'mote', x: mo.x, y: mo.y, pts: p, mult: r.mult });
    }
  }

  // Combo clock: only free flight runs it down.
  if (!r.tether) r.since++;
  if (!r.tether && r.link > 0 && --r.link === 0 && r.mult > 1) {
    r.mult = 1;
    emit(out, { k: 'drop', x: r.x, y: r.y });
  }

  // Altitude points, zones.
  if (r.y > r.maxY) {
    r.score += (r.y - r.maxY) * m.points;
    r.maxY = r.y;
    const z = zoneAt(altitude(r));
    if (z > r.zone) {
      r.zone = z;
      emit(out, { k: 'zone', x: r.x, y: r.y, n: z });
    }
  }

  // The camera follows the comet up, never down, and the void climbs behind it.
  const camT = r.y - VIEW_H * CAM_AT;
  if (camT > r.camY) r.camY += (camT - r.camY) * Math.min(1, 3 * STEP);
  r.camY += riseAt(alt) * m.speed * STEP;
  r.tick++;
  if (r.y < r.camY - COMET_R) die(r, 'void', out);
}
