// Trestle drawing: a dusk ravine (sky, hills, water, mossy banks, stone spires,
// branches with hooks), the build (planks, twigs, twine, pegs), the beetle's
// cart, the lantern and its ring, stress colours during a run, splinters.

import { COLS, MATS, ROWS, RING_TOL, WATER, buildable, px, py, type Level, type Member, type Sim } from '../core';

export interface View {
  /** Pixels per grid unit and the screen position of grid point (0, 0). */
  s: number;
  ox: number;
  oy: number;
  w: number;
  h: number;
}

/** Fits the whole grid (x −0.5..12.5) across the canvas, water near the bottom. */
export function fitView(w: number, h: number, zoom = 1, cx = 6, cy = 6): View {
  const base = Math.min(w / (COLS + 0.2), (h - 8) / (ROWS - 0.6));
  const s = base * zoom;
  if (zoom <= 1.001) return { s, ox: (w - (COLS - 1) * s) / 2, oy: h - 4 - (WATER + 0.3) * s, w, h };
  return { s, ox: w / 2 - cx * s, oy: h / 2 - cy * s, w, h };
}

/** Keeps a zoomed view from drifting off the grid. */
export function clampView(v: View, fit: View): View {
  if (v.s <= fit.s * 1.001) return fit;
  const minX = v.w - (COLS - 0.5) * v.s;
  const maxX = 0.5 * v.s;
  const minY = v.h - (WATER + 0.4) * v.s;
  const maxY = 1.2 * v.s;
  return { ...v, ox: Math.min(maxX, Math.max(minX, v.ox)), oy: Math.min(maxY, Math.max(minY, v.oy)) };
}

export const toScreen = (v: View, x: number, y: number): [number, number] => [v.ox + x * v.s, v.oy + y * v.s];
export const toWorld = (v: View, X: number, Y: number): [number, number] => [(X - v.ox) / v.s, (Y - v.oy) / v.s];

export interface Ghost {
  a: number;
  b: number;
  mat: number;
  ok: boolean;
  /** The finger is past the material's reach: the end stops at the last peg in reach. */
  clamped: boolean;
}

export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  col: string;
}

export interface Scene {
  level: Level;
  members: Member[];
  /** Live run, or null while building. */
  sim: Sim | null;
  ghost: Ghost | null;
  /** Peak stress per member from the last run (keyed a:b), shown while building. */
  hot: Map<string, number> | null;
  /** Member under a press, and the one picked for removal (−1 none). */
  pressed: number;
  selected: number;
  /** Pegs that swing freely in the build (shown after a wobbly failure). */
  wobbly: Set<number> | null;
  /** Peg a drag starts from. */
  from: number;
  time: number;
  sparks: Spark[];
  /** Show grid dots (build mode). */
  grid: boolean;
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Stress colour: calm green, yellow at 60%, red at the snapping point. */
export function stressCol(r: number): string {
  const t = Math.max(0, Math.min(1, r));
  if (t < 0.6) {
    const k = t / 0.6;
    return `rgb(${Math.round(110 + k * 140)},${Math.round(220 - k * 10)},${Math.round(130 - k * 90)})`;
  }
  const k = (t - 0.6) / 0.4;
  return `rgb(${Math.round(250 + k * 5)},${Math.round(210 - k * 150)},${Math.round(40 + k * 10)})`;
}

const MAT_COL = ['#b0773f', '#c9b27a', '#efe2c2'];
const MAT_EDGE = ['#5a3418', '#5d5233', '#8d7d5a'];
const MAT_W = [0.2, 0.11, 0.05];

function background(ctx: CanvasRenderingContext2D, v: View, l: Level, t: number): void {
  const { w, h } = v;
  const sky = ctx.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, '#1d2547');
  sky.addColorStop(0.45, '#4d4a7a');
  sky.addColorStop(0.8, '#c9806a');
  sky.addColorStop(1, '#f0b37a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, h);
  const H = hash(l.id);
  // Stars and a moon in the upper sky.
  ctx.fillStyle = 'rgba(255,248,220,0.8)';
  for (let i = 0; i < 26; i++) {
    const x = ((H >>> (i % 16)) * (i + 7) * 97) % w;
    const y = ((H >>> ((i + 5) % 16)) * (i + 3) * 61) % Math.max(1, h * 0.32);
    const tw = 0.6 + 0.4 * Math.sin(t * 1.3 + i);
    ctx.globalAlpha = 0.35 + 0.4 * tw;
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
  const [mx, my] = [w * (0.15 + ((H >>> 3) % 70) / 100), h * 0.12];
  ctx.fillStyle = 'rgba(255,240,200,0.12)';
  ctx.beginPath();
  ctx.arc(mx, my, v.s * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#fbefc8';
  ctx.beginPath();
  ctx.arc(mx, my, v.s * 0.6, 0, Math.PI * 2);
  ctx.fill();
  // Two rows of hills, then a band of pines.
  const hills = (base: number, amp: number, col: string, seed: number) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w + 10; x += 10) {
      const k = x / w;
      const y = base - amp * (0.5 + 0.3 * Math.sin(k * 6.3 + seed) + 0.2 * Math.sin(k * 15 + seed * 2));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.fill();
  };
  const [, waterY] = toScreen(v, 0, WATER);
  hills(waterY - v.s * 4.5, v.s * 3, 'rgba(70,62,110,0.55)', (H % 100) / 10);
  hills(waterY - v.s * 2.2, v.s * 2.4, 'rgba(46,44,80,0.75)', (H % 37) / 5);
  ctx.fillStyle = 'rgba(30,34,52,0.85)';
  for (let i = 0; i < 18; i++) {
    const x = (((H >>> (i % 13)) * (i + 11)) % (w + 40)) - 20;
    const ph = v.s * (1.4 + ((H >>> i) % 10) / 6);
    const by = waterY - v.s * 0.6;
    ctx.beginPath();
    ctx.moveTo(x, by - ph);
    ctx.lineTo(x + ph * 0.32, by);
    ctx.lineTo(x - ph * 0.32, by);
    ctx.fill();
  }
  // Water with slow ripples.
  const wg = ctx.createLinearGradient(0, waterY, 0, h);
  wg.addColorStop(0, '#2c4f63');
  wg.addColorStop(1, '#14263a');
  ctx.fillStyle = wg;
  ctx.fillRect(0, waterY, w, h - waterY);
  ctx.strokeStyle = 'rgba(255,214,160,0.35)';
  ctx.lineWidth = 1.2;
  for (let r = 0; r < 3; r++) {
    ctx.beginPath();
    const y = waterY + 4 + r * v.s * 0.28;
    for (let x = 0; x <= w; x += 8) {
      const yy = y + Math.sin(x * 0.05 + t * (1 + r * 0.3) + r) * 1.4;
      if (x === 0) ctx.moveTo(x, yy);
      else ctx.lineTo(x, yy);
    }
    ctx.globalAlpha = 0.5 - r * 0.14;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Drifting streaks across the sky in the wind's direction. */
function windStreaks(ctx: CanvasRenderingContext2D, v: View, wind: number, t: number, k: number): void {
  const dir = wind > 0 ? 1 : -1;
  ctx.strokeStyle = `rgba(230,240,255,${0.12 + 0.25 * k})`;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const len = v.s * (0.8 + (i % 3) * 0.4);
    const speed = v.s * (3 + (i % 4));
    const x = (((i * 131 + t * speed) % (v.w + len * 2)) + v.w + len * 2) % (v.w + len * 2) - len;
    const X = dir > 0 ? x : v.w - x;
    const Y = v.h * (0.12 + ((i * 37) % 60) / 100);
    ctx.beginPath();
    ctx.moveTo(X, Y);
    ctx.lineTo(X - dir * len, Y + Math.sin(t * 2 + i) * 2);
    ctx.stroke();
  }
}

function rocks(ctx: CanvasRenderingContext2D, v: View, l: Level): void {
  for (const r of l.terrain) {
    const [x0, y0] = toScreen(v, r.x0, r.y0);
    const [x1, y1] = toScreen(v, r.x1, Math.min(r.y1, WATER + 1));
    const wpx = x1 - x0;
    const hpx = y1 - y0;
    if (r.kind === 'log') {
      // A fallen trunk across the gap: bark, rings at the ends.
      const lg = ctx.createLinearGradient(0, y0, 0, y1);
      lg.addColorStop(0, '#7a5a3e');
      lg.addColorStop(1, '#3e2a1c');
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.roundRect(x0 - hpx * 0.3, y0, wpx + hpx * 0.6, hpx, hpx / 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1;
      for (let x = x0 + 6; x < x1 - 4; x += 9) {
        ctx.beginPath();
        ctx.moveTo(x, y0 + hpx * 0.25);
        ctx.lineTo(x + 5, y0 + hpx * 0.3);
        ctx.stroke();
      }
      for (const ex of [x0 - hpx * 0.3 + hpx / 2, x1 + hpx * 0.3 - hpx / 2]) {
        ctx.fillStyle = '#c9a272';
        ctx.beginPath();
        ctx.ellipse(ex, y0 + hpx / 2, hpx * 0.32, hpx * 0.46, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#8a6a44';
        ctx.beginPath();
        ctx.ellipse(ex, y0 + hpx / 2, hpx * 0.16, hpx * 0.24, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = '#5f9e4f';
      ctx.fillRect(x0 + wpx * 0.2, y0 - 1, wpx * 0.25, 3);
      continue;
    }
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    if (r.kind === 'rock' || r.kind === 'floor') {
      g.addColorStop(0, '#7d7d8c');
      g.addColorStop(1, '#3d3d4c');
    } else if (r.kind === 'wall') {
      g.addColorStop(0, '#7a6a5c');
      g.addColorStop(1, '#3a2e2a');
    } else {
      g.addColorStop(0, '#7a5338');
      g.addColorStop(1, '#3a261d');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    if (r.kind === 'rock') {
      // A spire: slightly tapered with a rounded top.
      const k = wpx * 0.12;
      ctx.moveTo(x0 - k, y1);
      ctx.lineTo(x0, y0 + wpx * 0.3);
      ctx.quadraticCurveTo(x0 + wpx / 2, y0 - wpx * 0.15, x1, y0 + wpx * 0.3);
      ctx.lineTo(x1 + k, y1);
      ctx.closePath();
    } else ctx.rect(x0, y0, wpx, hpx);
    ctx.fill();
    // Strata.
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 1;
    for (let k = 1; k < 8; k++) {
      const y = y0 + k * v.s * 0.75;
      if (y > y1) break;
      ctx.beginPath();
      ctx.moveTo(Math.max(0, x0), y + (k % 2) * 2);
      ctx.lineTo(Math.min(v.w, x1), y - (k % 2) * 2);
      ctx.stroke();
    }
    // Moss caps.
    {
      ctx.fillStyle = r.kind === 'rock' ? '#6f9a52' : '#5f9e4f';
      const mh = v.s * (r.kind === 'rock' ? 0.12 : 0.18);
      if (r.kind === 'rock') {
        ctx.beginPath();
        ctx.ellipse(x0 + wpx / 2, y0 + wpx * 0.08, wpx * 0.55, mh, 0, Math.PI, 0);
        ctx.fill();
      } else {
        ctx.fillRect(Math.max(-2, x0), y0 - 1, Math.min(v.w + 2, x1) - Math.max(-2, x0), mh);
        ctx.fillStyle = '#7dbb5f';
        for (let x = Math.max(0, x0) + 3; x < Math.min(v.w, x1) - 2; x += 7) {
          ctx.fillRect(x, y0 - 3 - ((x * 7) % 3), 1.6, 4);
        }
      }
    }
  }
}

/** Branches reaching in from the nearest side to hooks that hang in the air. */
function hooks(ctx: CanvasRenderingContext2D, v: View, l: Level): void {
  for (const a of l.anchors) {
    const x = px(a);
    const y = py(a);
    let onRock = false;
    for (const r of l.terrain) if (x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) onRock = true;
    if (onRock) continue;
    const [X, Y] = toScreen(v, x, y);
    const left = x < COLS / 2;
    const ex = left ? -6 : v.w + 6;
    const ey = Y - v.s * 1.4;
    ctx.strokeStyle = '#2e2420';
    ctx.lineCap = 'round';
    ctx.lineWidth = v.s * 0.32;
    ctx.beginPath();
    ctx.moveTo(ex, ey - v.s * 0.4);
    ctx.quadraticCurveTo((ex + X) / 2, ey - v.s * 0.6, X + (left ? 1 : -1) * v.s * 0.6, Y - v.s * 0.9);
    ctx.stroke();
    ctx.lineWidth = v.s * 0.08;
    ctx.beginPath();
    ctx.moveTo(X + (left ? 1 : -1) * v.s * 0.5, Y - v.s * 0.9);
    ctx.lineTo(X, Y - v.s * 0.2);
    ctx.stroke();
    ctx.fillStyle = '#3f6a3a';
    for (let k = 0; k < 4; k++) {
      const t = 0.3 + k * 0.17;
      const lx = ex + (X - ex) * t;
      const ly = ey - v.s * 0.55 + Math.sin(k * 2.1) * v.s * 0.15;
      ctx.beginPath();
      ctx.ellipse(lx, ly - v.s * 0.15, v.s * 0.35, v.s * 0.16, k, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function anchorPeg(ctx: CanvasRenderingContext2D, v: View, p: number, glow: boolean): void {
  const [X, Y] = toScreen(v, px(p), py(p));
  const r = Math.max(5, v.s * 0.2);
  if (glow) {
    ctx.fillStyle = 'rgba(255,214,120,0.35)';
    ctx.beginPath();
    ctx.arc(X, Y, r * 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#2a2320';
  ctx.beginPath();
  ctx.arc(X, Y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#e0b25a';
  ctx.lineWidth = Math.max(1.6, r * 0.38);
  ctx.beginPath();
  ctx.arc(X, Y, r * 0.72, 0, Math.PI * 2);
  ctx.stroke();
}

function freePeg(ctx: CanvasRenderingContext2D, X: number, Y: number, s: number, glow: boolean): void {
  const r = Math.max(3.5, s * 0.12);
  if (glow) {
    ctx.fillStyle = 'rgba(255,214,120,0.35)';
    ctx.beginPath();
    ctx.arc(X, Y, r * 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#e8c88e';
  ctx.strokeStyle = '#4a321c';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(X, Y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function stroke(ctx: CanvasRenderingContext2D, ax: number, ay: number, bx: number, by: number, w: number, col: string, edge: string | null, mat: number): void {
  ctx.lineCap = 'round';
  if (edge) {
    ctx.strokeStyle = edge;
    ctx.lineWidth = w + 2.4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.stroke();
  }
  ctx.strokeStyle = col;
  ctx.lineWidth = w;
  if (mat === 2) ctx.setLineDash([w * 1.6, w * 0.9]);
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.setLineDash([]);
  if (mat === 0) {
    // Grain on planks.
    ctx.strokeStyle = 'rgba(255,230,190,0.35)';
    ctx.lineWidth = Math.max(1, w * 0.18);
    const nx = -(by - ay);
    const ny = bx - ax;
    const d = Math.hypot(nx, ny) || 1;
    const o = w * 0.22;
    ctx.beginPath();
    ctx.moveTo(ax + (nx / d) * o, ay + (ny / d) * o);
    ctx.lineTo(bx + (nx / d) * o, by + (ny / d) * o);
    ctx.stroke();
  }
}

function drawCart(ctx: CanvasRenderingContext2D, v: View, sim: Sim): void {
  const c = sim.cart!;
  const [ax, ay] = toScreen(v, sim.x[c[0]], sim.y[c[0]]);
  const [bx, by] = toScreen(v, sim.x[c[1]], sim.y[c[1]]);
  const [tx, ty] = toScreen(v, sim.x[c[2]], sim.y[c[2]]);
  const ang = Math.atan2(by - ay, bx - ax);
  // Drawn a little larger than its physics so the beetle reads at phone size.
  const s = v.s * 1.2;
  ctx.save();
  ctx.translate((ax + bx) / 2, (ay + by) / 2);
  ctx.rotate(ang);
  const up = Math.hypot(tx - (ax + bx) / 2, ty - (ay + by) / 2) * 1.2;
  // Cart bed.
  ctx.fillStyle = '#8a5a32';
  ctx.strokeStyle = '#3b2412';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-s * 0.5, -up * 0.55, s * 1.0, up * 0.42, 3);
  ctx.fill();
  ctx.stroke();
  // Acorns in the bed.
  ctx.fillStyle = '#c98a3e';
  for (const [x, y] of [[-0.25, -0.62], [0.05, -0.66], [0.3, -0.6]] as const) {
    ctx.beginPath();
    ctx.ellipse(x * s, y * up - s * 0.08, s * 0.11, s * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#6b4424';
  for (const [x, y] of [[-0.25, -0.62], [0.05, -0.66], [0.3, -0.6]] as const) {
    ctx.beginPath();
    ctx.ellipse(x * s, y * up - s * 0.18, s * 0.12, s * 0.06, 0, Math.PI, 0);
    ctx.fill();
  }
  // The beetle pulling in front.
  ctx.fillStyle = '#d0453a';
  ctx.beginPath();
  ctx.ellipse(s * 0.66, -up * 0.32, s * 0.24, s * 0.2, 0, Math.PI, 0);
  ctx.fill();
  ctx.fillStyle = '#1e1416';
  ctx.beginPath();
  ctx.arc(s * 0.9, -up * 0.36, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(s * 0.42, -up * 0.34, s * 0.48, s * 0.05);
  ctx.beginPath();
  ctx.arc(s * 0.6, -up * 0.45, s * 0.04, 0, Math.PI * 2);
  ctx.arc(s * 0.74, -up * 0.42, s * 0.04, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#1e1416';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(s * 0.95, -up * 0.42);
  ctx.lineTo(s * 1.05, -up * 0.6);
  ctx.stroke();
  ctx.restore();
  // Wheels (spokes turn with the distance rolled).
  for (const [X, Y, k] of [[ax, ay, c[0]], [bx, by, c[1]]] as const) {
    const r = 0.24 * v.s;
    ctx.fillStyle = '#5a3a20';
    ctx.strokeStyle = '#2a1a0e';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(X, Y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const rot = sim.x[k] / 0.24;
    ctx.strokeStyle = '#d8b07a';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const a = rot + (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(X - Math.cos(a) * r * 0.8, Y - Math.sin(a) * r * 0.8);
      ctx.lineTo(X + Math.cos(a) * r * 0.8, Y + Math.sin(a) * r * 0.8);
      ctx.stroke();
    }
  }
}

function lanternAt(ctx: CanvasRenderingContext2D, X: number, Y: number, s: number, t: number, alpha: number): void {
  ctx.globalAlpha = alpha;
  const glow = ctx.createRadialGradient(X, Y, 0, X, Y, s * 1.6);
  glow.addColorStop(0, `rgba(255,190,90,${0.45 + 0.08 * Math.sin(t * 5)})`);
  glow.addColorStop(1, 'rgba(255,190,90,0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(X, Y, s * 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4a24a';
  ctx.strokeStyle = '#7a3e18';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(X, Y, s * 0.26, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3a2418';
  ctx.fillRect(X - s * 0.14, Y - s * 0.38, s * 0.28, s * 0.08);
  ctx.fillRect(X - s * 0.14, Y + s * 0.3, s * 0.28, s * 0.08);
  ctx.strokeStyle = 'rgba(122,62,24,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(X, Y - s * 0.3);
  ctx.lineTo(X, Y + s * 0.3);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawScene(ctx: CanvasRenderingContext2D, v: View, sc: Scene): void {
  const { level: l, sim } = sc;
  background(ctx, v, l, sc.time);
  rocks(ctx, v, l);
  hooks(ctx, v, l);
  const g = l.goal;
  // Goal markers.
  if (g.kind === 'cross') {
    const top = l.terrain.find((r) => g.goalX >= r.x0 && g.goalX <= r.x1 && r.kind === 'bank');
    const [fx, fy] = toScreen(v, g.goalX + 0.15, top ? top.y0 : py(g.to));
    ctx.strokeStyle = '#3a2a1c';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx, fy - v.s * 1.2);
    ctx.stroke();
    ctx.fillStyle = '#ffd36a';
    ctx.beginPath();
    const wave = Math.sin(sc.time * 4) * v.s * 0.06;
    ctx.moveTo(fx, fy - v.s * 1.2);
    ctx.lineTo(fx + v.s * 0.55, fy - v.s * 1.02 + wave);
    ctx.lineTo(fx, fy - v.s * 0.84);
    ctx.fill();
  } else
    for (const ring of g.rings) {
      const [rx, ry] = toScreen(v, px(ring), py(ring));
      ctx.strokeStyle = 'rgba(255,214,120,0.9)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -sc.time * 8;
      ctx.beginPath();
      ctx.arc(rx, ry, RING_TOL * v.s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!sim) lanternAt(ctx, rx, ry + v.s * 0.95, v.s, sc.time, 0.35);
    }
  if (l.wind) windStreaks(ctx, v, l.wind, sc.time, sim ? sim.windNow() / l.wind : 0.5);
  // Grid dots where pegs can go.
  if (sc.grid) {
    ctx.fillStyle = 'rgba(255,240,215,0.28)';
    const r = Math.max(1.2, v.s * 0.045);
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        if (!buildable(l, y * COLS + x)) continue;
        const [X, Y] = toScreen(v, x, y);
        if (X < -4 || Y < -4 || X > v.w + 4 || Y > v.h + 4) continue;
        ctx.fillRect(X - r, Y - r, r * 2, r * 2);
      }
  }
  // Members: twine and twigs behind, planks in front.
  const pos = (p: number, k: number): [number, number] => {
    if (!sim) return toScreen(v, px(p), py(p));
    const i = k;
    return toScreen(v, sim.x[i], sim.y[i]);
  };
  const order = sc.members.map((_, i) => i).sort((a, b) => sc.members[b].mat - sc.members[a].mat);
  for (const i of order) {
    const m = sc.members[i];
    const [ax, ay] = pos(m.a, sim ? sim.ma[i] : -1);
    const [bx, by] = pos(m.b, sim ? sim.mb[i] : -1);
    const w = Math.max(m.mat === 2 ? 1.6 : 2.5, MAT_W[m.mat] * v.s);
    if (sim && sim.broken[i]) {
      // Snapped: a stub on each end.
      for (const [x0, y0, x1, y1] of [[ax, ay, bx, by], [bx, by, ax, ay]]) {
        const k = 0.36;
        stroke(ctx, x0, y0, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k + v.s * 0.12, w, '#ff6a4a', MAT_EDGE[m.mat], m.mat);
      }
      continue;
    }
    let col = MAT_COL[m.mat];
    let edge: string | null = MAT_EDGE[m.mat];
    if (sim) col = stressCol(Math.abs(sim.force[i]) / MATS[m.mat].strength);
    if (sc.pressed === i) (col = '#ffe7a6'), (edge = '#6a4a10');
    if (sc.selected === i) {
      // Picked for removal: a pulsing red halo.
      ctx.strokeStyle = `rgba(255,90,70,${0.55 + 0.25 * Math.sin(sc.time * 8)})`;
      ctx.lineWidth = w + 10;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.stroke();
      (col = '#ff7a6a'), (edge = '#4a1010');
    }
    if (!sim && sc.hot) {
      const h = sc.hot.get(`${m.a}:${m.b}`);
      if (h !== undefined && h >= 0.7) {
        ctx.strokeStyle = h > 1 ? 'rgba(255,70,50,0.7)' : 'rgba(255,170,60,0.55)';
        ctx.lineWidth = w + 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        ctx.stroke();
      }
    }
    stroke(ctx, ax, ay, bx, by, w, col, edge, m.mat);
  }
  // Ghost member while dragging (with the material's reach when the finger is past it).
  if (sc.ghost) {
    const { a, b, mat, ok, clamped } = sc.ghost;
    const [ax, ay] = toScreen(v, px(a), py(a));
    const [bx, by] = toScreen(v, px(b), py(b));
    if (clamped) {
      ctx.strokeStyle = 'rgba(255,214,120,0.75)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 5]);
      ctx.beginPath();
      ctx.arc(ax, ay, MATS[mat].maxLen * v.s, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha = 0.85;
    stroke(ctx, ax, ay, bx, by, Math.max(mat === 2 ? 1.6 : 2.5, MAT_W[mat] * v.s), ok ? MAT_COL[mat] : '#ff5a4a', ok ? '#fff6dc' : '#3a0a0a', mat);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = ok ? '#fff6dc' : '#ff5a4a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(9, v.s * 0.3), 0, Math.PI * 2);
    ctx.stroke();
  }
  // Pegs.
  const used = new Set<number>();
  for (const m of sc.members) used.add(m.a).add(m.b);
  const anchors = new Set(l.anchors);
  if (sim) {
    sim.pegIds.forEach((p, i) => {
      if (anchors.has(p)) return;
      const [X, Y] = toScreen(v, sim.x[i], sim.y[i]);
      freePeg(ctx, X, Y, v.s, false);
    });
  } else
    for (const p of used) {
      if (anchors.has(p)) continue;
      const [X, Y] = toScreen(v, px(p), py(p));
      freePeg(ctx, X, Y, v.s, p === sc.from);
    }
  for (const a of l.anchors) anchorPeg(ctx, v, a, a === sc.from);
  // Pegs that can swing freely (a missing diagonal), after a failed run.
  if (!sim && sc.wobbly)
    for (const p of sc.wobbly) {
      const [X, Y] = toScreen(v, px(p), py(p));
      ctx.strokeStyle = `rgba(120,200,255,${0.6 + 0.3 * Math.sin(sc.time * 6)})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(X, Y, Math.max(10, v.s * 0.36), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  // The lanterns on their cords.
  if (sim)
    sim.lanterns.forEach((li, k) => {
      const [lx, ly] = toScreen(v, sim.x[li], sim.y[li]);
      const rp = sim.ringPegs[k];
      if (rp >= 0) {
        const [qx, qy] = toScreen(v, sim.x[rp], sim.y[rp]);
        ctx.strokeStyle = '#3a2a1c';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(qx, qy);
        ctx.lineTo(lx, ly - v.s * 0.3);
        ctx.stroke();
      }
      lanternAt(ctx, lx, ly, v.s, sc.time, 1);
    });
  if (sim?.cart) drawCart(ctx, v, sim);
  // Splinters.
  for (const p of sc.sparks) {
    ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 2));
    ctx.fillStyle = p.col;
    const [X, Y] = toScreen(v, p.x, p.y);
    ctx.fillRect(X - 1.5, Y - 1.5, 3, 3);
  }
  ctx.globalAlpha = 1;
}

/** A round magnifier above the finger: the scene at 2× around the drag's landing point. */
export function drawLoupe(ctx: CanvasRenderingContext2D, v: View, sc: Scene, fx: number, fy: number, tx = fx, ty = fy): void {
  const R = 52;
  const cx = Math.min(v.w - R - 4, Math.max(R + 4, fx));
  let cy = fy - 96;
  if (cy < R + 4) cy = fy + 96;
  const z = 2;
  // Centred on where the piece ends (tx, ty), which may be short of the finger.
  const lv: View = { s: v.s * z, ox: cx - (tx - v.ox) * z, oy: cy - (ty - v.oy) * z, w: v.w, h: v.h };
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.clip();
  drawScene(ctx, lv, { ...sc, sparks: [] });
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,246,220,0.9)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,246,220,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 6, cy);
  ctx.lineTo(cx + 6, cy);
  ctx.moveTo(cx, cy - 6);
  ctx.lineTo(cx, cy + 6);
  ctx.stroke();
}

/** A small icon of a material for the buttons (SVG). */
export function matSvg(mat: number, size = 26): string {
  const c = MAT_COL[mat];
  const e = MAT_EDGE[mat];
  const w = [6, 3.4, 1.8][mat];
  const dash = mat === 2 ? ' stroke-dasharray="3 2"' : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 26 26"><path d="M4 21L22 5" stroke="${e}" stroke-width="${w + 2.4}" stroke-linecap="round"/><path d="M4 21L22 5" stroke="${c}" stroke-width="${w}" stroke-linecap="round"${dash}/><circle cx="4" cy="21" r="2.6" fill="#e8c88e" stroke="#4a321c"/><circle cx="22" cy="5" r="2.6" fill="#e8c88e" stroke="#4a321c"/></svg>`;
}
