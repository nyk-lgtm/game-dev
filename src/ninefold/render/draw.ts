// Draws a Ninefold hole: moonlit lawn, mown fairway, timber rails, sand,
// ponds, slopes, posts and bumpers, the cup and flag, the ball and the aim.

import { BALL_R, CELL, COLS, CUP_R, ROWS, type Hole } from '../core';

export interface View {
  scale: number;
  ox: number;
  oy: number;
}

export function fitView(hole: Hole, w: number, h: number): View {
  let c0 = COLS, c1 = 0, r0 = ROWS, r1 = 0;
  hole.cells.forEach((on, i) => {
    if (!on) return;
    const c = i % COLS, r = Math.floor(i / COLS);
    c0 = Math.min(c0, c);
    c1 = Math.max(c1, c + 1);
    r0 = Math.min(r0, r);
    r1 = Math.max(r1, r + 1);
  });
  // Room for the rails, and above for the flag.
  const pad = 3, top = 10;
  const bw = (c1 - c0) * CELL + pad * 2, bh = (r1 - r0) * CELL + pad + top;
  const scale = Math.min((w - 16) / bw, (h - 16) / bh, 7);
  return { scale, ox: (w - (c1 - c0) * CELL * scale) / 2 - c0 * CELL * scale, oy: (h - bh * scale) / 2 + top * scale - r0 * CELL * scale };
}

export interface Aim {
  angle: number;
  power: number;
}

export interface Scene {
  hole: Hole;
  ball: { x: number; y: number } | null;
  trail: number[];
  aim: Aim | null;
  time: number;
  /** Bumper glow (index → 0..1). */
  glow: Map<number, number>;
  /** Ball sinking: 0..1 (shrinks into the cup). */
  sink: number;
  splash: { x: number; y: number; t: number } | null;
}

const hash = (a: number, b: number) => {
  let h = Math.imul(a * 374761393 + b * 668265263, 1274126177);
  h ^= h >>> 13;
  return ((h >>> 0) % 1000) / 1000;
};

export function draw(g: CanvasRenderingContext2D, w: number, h: number, v: View, s: Scene): void {
  const { hole } = s;
  // Lawn at night.
  g.fillStyle = '#0c1613';
  g.fillRect(0, 0, w, h);
  g.save();
  g.translate(v.ox, v.oy);
  g.scale(v.scale, v.scale);
  // Tufts around the course.
  g.fillStyle = 'rgba(120, 190, 140, 0.07)';
  for (let r = -2; r < ROWS + 2; r++)
    for (let c = -2; c < COLS + 2; c++)
      for (let k = 0; k < 3; k++) {
        const x = (c + hash(c * 3 + k, r)) * CELL, y = (r + hash(r * 5 + k, c + 9)) * CELL;
        g.fillRect(x, y, 0.5, 1.4);
      }
  // Rails: drawn wide first, then the fairway covers their inner half.
  g.lineCap = 'round';
  g.strokeStyle = '#5a3c22';
  g.lineWidth = 3.4;
  wallPath(g, hole);
  g.stroke();
  g.strokeStyle = '#b8875a';
  g.lineWidth = 2.6;
  wallPath(g, hole);
  g.stroke();
  // Fairway with mown stripes.
  hole.cells.forEach((on, i) => {
    if (!on) return;
    const x = (i % COLS) * CELL, y = Math.floor(i / COLS) * CELL;
    g.fillStyle = '#2f8a50';
    g.fillRect(x - 0.02, y - 0.02, CELL + 0.04, CELL + 0.04);
    g.fillStyle = '#34965a';
    for (let k = 0; k < CELL; k += 8) g.fillRect(x, y + k, CELL, 4);
  });
  // Inner lip of the rails.
  g.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  g.lineWidth = 0.7;
  wallPath(g, hole);
  g.stroke();
  // Tee mat.
  g.fillStyle = '#226b3c';
  roundRect(g, hole.tee.x - 4, hole.tee.y - 2.5, 8, 5, 1);
  g.fill();
  // Zones.
  for (const z of hole.zones) {
    if (z.kind === 'sand') {
      g.fillStyle = '#d9c08a';
      roundRect(g, z.x, z.y, z.w, z.h, 2.5);
      g.fill();
      g.fillStyle = 'rgba(120, 90, 40, 0.35)';
      for (let k = 0; k < (z.w * z.h) / 6; k++) g.fillRect(z.x + 1 + hash(k, z.x) * (z.w - 2), z.y + 1 + hash(z.y, k) * (z.h - 2), 0.35, 0.35);
    } else if (z.kind === 'water') {
      const gr = g.createLinearGradient(z.x, z.y, z.x + z.w, z.y + z.h);
      gr.addColorStop(0, '#2c6fb8');
      gr.addColorStop(1, '#1d4f8a');
      g.fillStyle = gr;
      roundRect(g, z.x, z.y, z.w, z.h, 2.5);
      g.fill();
      g.save();
      roundRect(g, z.x, z.y, z.w, z.h, 2.5);
      g.clip();
      g.strokeStyle = 'rgba(190, 225, 255, 0.35)';
      g.lineWidth = 0.35;
      for (let k = 0; k < 4; k++) {
        const yy = z.y + ((k + 0.5) / 4) * z.h;
        g.beginPath();
        for (let xx = z.x; xx <= z.x + z.w; xx += 1) g.lineTo(xx, yy + Math.sin(xx * 0.9 + s.time * 2 + k) * 0.5);
        g.stroke();
      }
      g.restore();
    } else {
      // Slope: a tint and drifting chevrons pointing downhill.
      g.fillStyle = 'rgba(255, 255, 255, 0.06)';
      g.fillRect(z.x, z.y, z.w, z.h);
      g.save();
      g.beginPath();
      g.rect(z.x, z.y, z.w, z.h);
      g.clip();
      g.strokeStyle = 'rgba(220, 255, 200, 0.45)';
      g.lineWidth = 0.6;
      const drift = ((s.time * 4) % 5) - 2.5;
      const ccx = z.x + z.w / 2, ccy = z.y + z.h / 2;
      for (let a = -1; a <= 1; a++)
        for (let b = -2; b <= 2; b++) {
          // Chevrons in rows across the slope.
          const along = b * 5 + drift, across = a * 5;
          const x = ccx + z.dx * along - z.dy * across, y = ccy + z.dy * along + z.dx * across;
          g.beginPath();
          g.moveTo(x - z.dx * 1.2 - z.dy * 1.5, y - z.dy * 1.2 - z.dx * 1.5);
          g.lineTo(x, y);
          g.lineTo(x - z.dx * 1.2 + z.dy * 1.5, y - z.dy * 1.2 + z.dx * 1.5);
          g.stroke();
        }
      g.restore();
    }
  }
  // Cup.
  g.fillStyle = '#0a0d0b';
  g.beginPath();
  g.arc(hole.cup.x, hole.cup.y, CUP_R, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 0.35;
  g.stroke();
  // Posts and bumpers.
  hole.posts.forEach((p, i) => {
    if (p.bumper) {
      const gl = s.glow.get(i) ?? 0;
      g.fillStyle = `rgb(${230 + 25 * gl}, ${90 + 120 * gl}, ${80 + 80 * gl})`;
      g.beginPath();
      g.arc(p.x, p.y, p.r + gl * 0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff3e8';
      g.beginPath();
      g.arc(p.x, p.y, p.r * 0.45, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.arc(p.x + 0.4, p.y + 0.5, p.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#8d93a0';
      g.beginPath();
      g.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#b9bfcb';
      g.beginPath();
      g.arc(p.x - 0.5, p.y - 0.5, p.r * 0.5, 0, Math.PI * 2);
      g.fill();
    }
  });
  // Trail.
  if (s.trail.length >= 4) {
    g.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    g.lineWidth = 0.9;
    g.lineJoin = 'round';
    g.beginPath();
    for (let i = 0; i < s.trail.length; i += 2) g.lineTo(s.trail[i], s.trail[i + 1]);
    g.stroke();
  }
  // Aim: an arrow from the ball whose length is the power.
  if (s.aim && s.ball) {
    const { angle, power } = s.aim;
    const len = 6 + 40 * power;
    const hue = 120 - 120 * power;
    const ux = Math.cos(angle), uy = Math.sin(angle);
    g.strokeStyle = `hsla(${hue}, 90%, 60%, 0.9)`;
    g.fillStyle = g.strokeStyle;
    g.lineWidth = 0.8;
    g.setLineDash([1.6, 1.2]);
    g.beginPath();
    g.moveTo(s.ball.x + ux * 2.5, s.ball.y + uy * 2.5);
    g.lineTo(s.ball.x + ux * len, s.ball.y + uy * len);
    g.stroke();
    g.setLineDash([]);
    const tx = s.ball.x + ux * (len + 2.2), ty = s.ball.y + uy * (len + 2.2);
    g.beginPath();
    g.moveTo(tx, ty);
    g.lineTo(tx - ux * 3 - uy * 1.7, ty - uy * 3 + ux * 1.7);
    g.lineTo(tx - ux * 3 + uy * 1.7, ty - uy * 3 - ux * 1.7);
    g.fill();
    // Power ring.
    g.lineWidth = 0.6;
    g.strokeStyle = 'rgba(255,255,255,0.2)';
    g.beginPath();
    g.arc(s.ball.x, s.ball.y, 4, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = `hsl(${hue}, 90%, 60%)`;
    g.beginPath();
    g.arc(s.ball.x, s.ball.y, 4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * power);
    g.stroke();
  }
  // Splash rings.
  if (s.splash) {
    const t = s.splash.t;
    g.strokeStyle = `rgba(200, 230, 255, ${1 - t})`;
    g.lineWidth = 0.5;
    for (const k of [1, 0.6]) {
      g.beginPath();
      g.arc(s.splash.x, s.splash.y, 1 + t * 6 * k, 0, Math.PI * 2);
      g.stroke();
    }
  }
  // Ball.
  if (s.ball) {
    const r = BALL_R * (1 - s.sink * 0.6);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.arc(s.ball.x + 0.4, s.ball.y + 0.6, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = s.sink > 0 ? `rgba(250,250,250,${1 - s.sink})` : '#fafafa';
    g.beginPath();
    g.arc(s.ball.x, s.ball.y, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(0,0,0,0.12)';
    g.beginPath();
    g.arc(s.ball.x + r * 0.3, s.ball.y + r * 0.3, r * 0.6, 0, Math.PI * 2);
    g.fill();
  }
  // Flag (lifted out when the ball is close).
  const near = s.ball ? Math.hypot(s.ball.x - hole.cup.x, s.ball.y - hole.cup.y) : 99;
  if (near > 9) {
    const fx = hole.cup.x, fy = hole.cup.y;
    g.strokeStyle = '#e8e2d0';
    g.lineWidth = 0.45;
    g.beginPath();
    g.moveTo(fx, fy);
    g.lineTo(fx, fy - 11);
    g.stroke();
    const wave = Math.sin(s.time * 3) * 0.6;
    g.fillStyle = '#ff5a4e';
    g.beginPath();
    g.moveTo(fx, fy - 11);
    g.quadraticCurveTo(fx + 3, fy - 10.5 + wave, fx + 6, fy - 9.5 + wave);
    g.lineTo(fx, fy - 7.5);
    g.fill();
  }
  g.restore();
}

function wallPath(g: CanvasRenderingContext2D, hole: Hole): void {
  g.beginPath();
  for (const s of hole.walls) {
    g.moveTo(s.ax, s.ay);
    g.lineTo(s.bx, s.by);
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}
