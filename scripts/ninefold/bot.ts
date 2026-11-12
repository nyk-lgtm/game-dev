// A search bot for Ninefold: tries a fan of shots and keeps the one that leaves
// the ball closest to the cup by walking distance (a BFS over a fine grid).

import { BALL_R, CELL, COLS, ROWS, simulate, type Hole, type Shot } from '../../src/ninefold/core';



export function distanceField(hole: Hole): Float32Array {
  const W = COLS * CELL, H = ROWS * CELL;
  const d = new Float32Array(W * H).fill(Infinity);
  const ok = (x: number, y: number) => {
    const px = x + 0.5, py = y + 0.5;
    const c = Math.floor(px / CELL) + Math.floor(py / CELL) * COLS;
    if (!hole.cells[c]) return false;
    for (const s of hole.walls) {
      const ex = s.bx - s.ax, ey = s.by - s.ay;
      const t = Math.max(0, Math.min(1, ((px - s.ax) * ex + (py - s.ay) * ey) / (ex * ex + ey * ey)));
      if (Math.hypot(px - s.ax - ex * t, py - s.ay - ey * t) < BALL_R) return false;
    }
    for (const p of hole.posts) if (Math.hypot(px - p.x, py - p.y) < p.r + BALL_R) return false;
    for (const z of hole.zones) if (z.kind === 'water' && px >= z.x && px <= z.x + z.w && py >= z.y && py <= z.y + z.h) return false;
    return true;
  };
  const free = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) free[y * W + x] = ok(x, y) ? 1 : 0;
  const q: number[] = [];
  const s = Math.floor(hole.cup.y) * W + Math.floor(hole.cup.x);
  d[s] = 0;
  q.push(s);
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const x = c % W, y = (c - x) / W;
    for (const [dx, dy, w] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.41], [1, -1, 1.41], [-1, 1, 1.41], [-1, -1, 1.41]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx;
      if (!free[n] || d[n] <= d[c] + w) continue;
      d[n] = d[c] + w;
      q.push(n);
    }
  }

  return d;
}

export function bestShot(hole: Hole, from: { x: number; y: number }, field: Float32Array, angles = 72, powers = [0.15, 0.25, 0.35, 0.5, 0.65, 0.8, 1]): Shot {
  const W = COLS * CELL;
  let best: Shot = { angle: 0, power: 0.5 };
  let bestScore = Infinity;
  for (let a = 0; a < angles; a++) {
    for (const power of powers) {
      const shot = { angle: Math.round(((a / angles) * Math.PI * 2 - Math.PI) * 1000) / 1000, power };
      const r = simulate(hole, from, shot);
      let score: number;
      if (r.outcome === 'sunk') score = -1;
      else if (r.outcome === 'water') score = 1000;
      else {
        const v = field[Math.floor(r.y) * W + Math.floor(r.x)];
        score = Number.isFinite(v) ? v : 500;
      }
      if (score < bestScore) {
        bestScore = score;
        best = shot;
      }
    }
  }
  return best;
}
