// Ball physics for one shot, at a fixed 240 Hz step so a shot always plays out
// the same way. Returns the ball's path (every 4th step) for the renderer.

import { BALL_R, CELL, COLS, CUP_R, type Hole, type Mill, type Zone } from './course';

export const STEP = 1 / 240;
export const MAX_SPEED = 160;
const MAX_STEPS = 240 * 14;
const SINK_SPEED = 75;
/** Half the thickness of a windmill arm. */
export const MILL_HALF = 0.7;
/** A windmill's angle `step` steps into a shot (frames are every 4 steps). */
export const millAngle = (m: Mill, step: number) => m.a0 + m.w * step * STEP;

export interface Shot {
  /** Angle in radians (0 = right, π/2 = down), power 0..1. */
  angle: number;
  power: number;
}
export type Outcome = 'rest' | 'sunk' | 'water';
export interface ShotResult {
  outcome: Outcome;
  /** Where the ball ended (for water: where it went in). */
  x: number;
  y: number;
  /** x,y pairs every 4 steps (60 per second). */
  frames: number[];
  /** Frame index and speed of each hard knock (walls, posts). */
  hits: { f: number; v: number; bumper: boolean }[];
  /** Frame index where the ball entered sand, if it did. */
  sand: number[];
}

const inZone = (z: Zone, x: number, y: number) => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h;

export function simulate(hole: Hole, from: { x: number; y: number }, shot: Shot): ShotResult {
  let x = from.x, y = from.y;
  const speed0 = MAX_SPEED * Math.max(0, Math.min(1, shot.power));
  let vx = Math.cos(shot.angle) * speed0, vy = Math.sin(shot.angle) * speed0;
  const frames: number[] = [x, y];
  const hits: ShotResult['hits'] = [];
  const sand: number[] = [];
  let slow = 0;
  let wasSand = false;
  for (let i = 1; i <= MAX_STEPS; i++) {
    let sp = Math.hypot(vx, vy);
    // Ground: friction, sand, slopes.
    let fr = 30 + 0.35 * sp;
    let ax = 0, ay = 0;
    let onSand = false;
    for (const z of hole.zones) {
      if (!inZone(z, x, y)) continue;
      if (z.kind === 'sand') onSand = true;
      else if (z.kind === 'slope') {
        ax += z.dx * 48;
        ay += z.dy * 48;
      } else {
        frames.push(x, y);
        return { outcome: 'water', x, y, frames, hits, sand };
      }
    }
    if (onSand) fr += 150 + 3 * sp;
    if (onSand && !wasSand) sand.push(frames.length / 2);
    wasSand = onSand;
    // The cup pulls a slow ball in a little.
    const cdx = hole.cup.x - x, cdy = hole.cup.y - y;
    const cd = Math.hypot(cdx, cdy);
    if (cd < CUP_R * 2 && cd > 0.001) {
      ax += (cdx / cd) * 90;
      ay += (cdy / cd) * 90;
    }
    if (sp > 0) {
      const k = Math.max(0, sp - fr * STEP) / sp;
      vx *= k;
      vy *= k;
    }
    vx += ax * STEP;
    vy += ay * STEP;
    x += vx * STEP;
    y += vy * STEP;
    // Walls.
    for (const s of hole.walls) {
      const ex = s.bx - s.ax, ey = s.by - s.ay;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * ex + (y - s.ay) * ey) / (ex * ex + ey * ey)));
      const qx = s.ax + ex * t, qy = s.ay + ey * t;
      const r = bounce(qx, qy, 0.78, BALL_R);
      if (r) hits.push({ f: frames.length / 2, v: r, bumper: false });
    }
    for (const p of hole.posts) {
      const dx = x - p.x, dy = y - p.y;
      const d = Math.hypot(dx, dy);
      if (d >= p.r + BALL_R || d < 1e-6) continue;
      const nx = dx / d, ny = dy / d;
      x = p.x + nx * (p.r + BALL_R);
      y = p.y + ny * (p.r + BALL_R);
      const vn = vx * nx + vy * ny;
      if (vn < 0) {
        const e = p.bumper ? 1.25 : 0.6;
        vx -= (1 + e) * vn * nx;
        vy -= (1 + e) * vn * ny;
        if (p.bumper) {
          // A bumper always kicks out at a decent pace.
          const s2 = Math.hypot(vx, vy);
          const want = Math.min(MAX_SPEED, Math.max(s2, 45));
          vx *= want / s2;
          vy *= want / s2;
        }
        if (-vn > 15) hits.push({ f: frames.length / 2, v: -vn, bumper: p.bumper });
      }
    }
    // Windmills: four turning arms and a hub; a blade carries the ball with it.
    for (const m of hole.mills) {
      const ang = millAngle(m, i);
      for (let k = 0; k < 4; k++) {
        const a = ang + (k * Math.PI) / 2;
        const ex = Math.cos(a) * m.arm, ey = Math.sin(a) * m.arm;
        const t = Math.max(0, Math.min(1, ((x - m.x) * ex + (y - m.y) * ey) / (ex * ex + ey * ey)));
        const qx = m.x + ex * t, qy = m.y + ey * t;
        const dx = x - qx, dy = y - qy;
        const d = Math.hypot(dx, dy);
        const r = BALL_R + MILL_HALF;
        if (d >= r || d < 1e-6) continue;
        const nx = dx / d, ny = dy / d;
        x = qx + nx * r;
        y = qy + ny * r;
        const bvx = -m.w * (qy - m.y), bvy = m.w * (qx - m.x);
        const vn = (vx - bvx) * nx + (vy - bvy) * ny;
        if (vn < 0) {
          vx -= 1.6 * vn * nx;
          vy -= 1.6 * vn * ny;
          if (-vn > 15) hits.push({ f: frames.length / 2, v: -vn, bumper: false });
        }
      }
    }
    sp = Math.hypot(vx, vy);
    if (Math.hypot(hole.cup.x - x, hole.cup.y - y) < CUP_R && sp < SINK_SPEED) {
      frames.push(hole.cup.x, hole.cup.y);
      return { outcome: 'sunk', x: hole.cup.x, y: hole.cup.y, frames, hits, sand };
    }
    if (i % 4 === 0) frames.push(x, y);
    slow = sp < 1.5 ? slow + 1 : 0;
    // At rest: still on flat ground, or pinned (against a wall on a slope) for a moment.
    const tilted = ax !== 0 || ay !== 0;
    if ((sp < 1.5 && !tilted) || slow > 30) break;
  }
  frames.push(x, y);
  return { outcome: 'rest', x, y, frames, hits, sand };

  function bounce(qx: number, qy: number, e: number, r: number): number {
    const dx = x - qx, dy = y - qy;
    const d = Math.hypot(dx, dy);
    if (d >= r || d < 1e-6) return 0;
    const nx = dx / d, ny = dy / d;
    x = qx + nx * r;
    y = qy + ny * r;
    const vn = vx * nx + vy * ny;
    if (vn >= 0) return 0;
    vx -= (1 + e) * vn * nx;
    vy -= (1 + e) * vn * ny;
    // A little grip along the wall.
    vx *= 0.97;
    vy *= 0.97;
    return -vn > 15 ? -vn : 0;
  }
}

/** Which cell a point is in (-1 outside the grid). */
export function cellAt(x: number, y: number): number {
  const c = Math.floor(x / CELL), r = Math.floor(y / CELL);
  return c < 0 || r < 0 || c >= COLS ? -1 : r * COLS + c;
}
