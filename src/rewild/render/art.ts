// Rewild canvas art: terrain, sea, plants, animals and card icons.
// Pure drawing: only the ctx passed in is touched, no images or fonts, and no
// Math.random: per-cell variation comes from hashing the `seed` argument, so a
// redraw is always identical. Shapes are designed for a hex of size ~25px
// (center to corner) and scale with `size`.

import type { AnimalId, Cell, PlantId, Pop, SpeciesId } from '../core/types';

type RGB = readonly [number, number, number];
type Ctx = CanvasRenderingContext2D;

const TAU = Math.PI * 2;

/** Species accent colors for UI chips/cards. */
export const COLORS: Record<SpeciesId, string> = {
  lichen: '#c9cf78',
  grass: '#86b84e',
  reeds: '#b39a5c',
  flowers: '#e58bb4',
  shrub: '#b9464f',
  tree: '#4d8a46',
  fungi: '#d9614a',
  bees: '#f0c03a',
  rabbit: '#a8957f',
  songbird: '#4b8fcf',
  frog: '#46a98a',
  deer: '#b98552',
  fox: '#e8863a',
  wolf: '#7f8794',
  beaver: '#8b5e3c',
};

// ---------------------------------------------------------------- helpers

/** Deterministic hash of (seed, k) to [0, 1). */
export function hash(seed: number, k: number): number {
  let x = Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul((k | 0) + 0x632be5ab, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d);
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39);
  x ^= x >>> 15;
  return (x >>> 0) / 4294967296;
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [20, 14, 10];
/** Lighten (f > 0) or darken (f < 0). Darkening leans warm, not grey. */
const shade = (c: RGB, f: number): RGB => (f >= 0 ? mix(c, WHITE, f) : mix(c, BLACK, -f));
const css = (c: RGB, a = 1): string =>
  a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a.toFixed(3)})`;

/** Season color grade: spring fresh, summer warm, autumn amber, winter pale. */
function grade(c: RGB, sea: number): RGB {
  if (sea === 0) return shade(mix(c, [165, 215, 140], 0.07), 0.03);
  if (sea === 1) return mix(c, [255, 205, 120], 0.08);
  if (sea === 2) return mix(c, [214, 142, 62], 0.16);
  const g = c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  return mix(mix(c, [g, g, g], 0.4), [226, 232, 240], 0.24);
}

const ell = (ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) => {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, TAU);
  ctx.fill();
};
const dot = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.01, r), 0, TAU);
  ctx.fill();
};
/** Set the fill and draw an ellipse / circle. */
const fe = (ctx: Ctx, c: string, x: number, y: number, rx: number, ry: number, rot = 0) => {
  ctx.fillStyle = c;
  ell(ctx, x, y, rx, ry, rot);
};
const fd = (ctx: Ctx, c: string | CanvasGradient, x: number, y: number, r: number) => {
  ctx.fillStyle = c;
  dot(ctx, x, y, r);
};
const pen = (ctx: Ctx, c: string, w: number) => {
  ctx.strokeStyle = c;
  ctx.lineWidth = w;
};
/** Stroke separate segments from flat [x1, y1, x2, y2, ...] quads. */
const segs = (ctx: Ctx, p: number[]) => {
  ctx.beginPath();
  for (let i = 0; i < p.length; i += 4) {
    ctx.moveTo(p[i], p[i + 1]);
    ctx.lineTo(p[i + 2], p[i + 3]);
  }
  ctx.stroke();
};
/** Filled polygon from flat [x, y, ...] pairs. */
const poly = (ctx: Ctx, c: string, p: number[]) => {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.closePath();
  ctx.fill();
};
const line = (ctx: Ctx, x1: number, y1: number, x2: number, y2: number) => {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
};

/** Flat-top hex path (corners at 0°, 60°, ...). */
export function hexPath(ctx: Ctx, x: number, y: number, size: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3, px = x + Math.cos(a) * size, py = y + Math.sin(a) * size;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** i-th of `count` points spread evenly (jittered sunflower) in a disc of radius R. */
function scatter(seed: number, i: number, count: number, R: number): [number, number] {
  const r = Math.sqrt((i + 0.25 + 0.5 * hash(seed, i * 7 + 1)) / count) * R;
  const a = i * 2.39996 + hash(seed, 999) * TAU + (hash(seed, i * 7 + 2) - 0.5) * 0.8;
  return [Math.cos(a) * r, Math.sin(a) * r * 0.86];
}

/** Calls fn for each of `count` scattered points (static layers only: allocates a closure). */
function each(seed: number, count: number, R: number, fn: (dx: number, dy: number, i: number) => void) {
  for (let i = 0; i < count; i++) {
    const [dx, dy] = scatter(seed, i, count, R);
    fn(dx, dy, i);
  }
}

/** `count` scattered points sorted back to front (by y). */
function spots(seed: number, count: number, R: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < count; i++) out.push(scatter(seed, i, count, R));
  return out.sort((a, b) => a[1] - b[1]);
}

/** Soft contact shadow. */
function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, a = 0.22) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, rx);
  g.addColorStop(0, `rgba(40,28,14,${a})`);
  g.addColorStop(0.6, `rgba(40,28,14,${a * 0.6})`);
  g.addColorStop(1, 'rgba(40,28,14,0)');
  ctx.fillStyle = g;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.translate(-x, -y);
  ctx.fillRect(x - rx, y - rx, rx * 2, rx * 2);
  ctx.restore();
}

// ---------------------------------------------------------------- terrain

const SHALLOWS: RGB = [92, 192, 190];
const SAND: RGB = [234, 211, 158];
const ROCK: RGB = [148, 139, 158];
const MARSH: RGB = [122, 130, 70];
const POND: RGB = [40, 92, 148];

function soilColor(fert: number): RGB {
  const f = Math.max(0, Math.min(3, fert)) / 3, brown = mix([164, 128, 90], [90, 64, 40], f);
  return mix(brown, [92, 128, 56], f * 0.32);
}

/** Fill one flat-top hex with its terrain. sea 0..3 = spring..winter, wet 0..3, seed = cell index. */
export function drawTerrain(ctx: Ctx, x: number, y: number, size: number, cell: Cell, wet: number, sea: number, seed: number): void {
  const s = size, t = cell.t, water = t === 'sea' || t === 'shallows' || t === 'pond';
  let base: RGB =
    t === 'shallows' ? SHALLOWS : t === 'sand' ? SAND : t === 'rock' ? ROCK : t === 'soil' ? soilColor(cell.fert) : t === 'marsh' ? MARSH : t === 'pond' ? mix(MARSH, SAND, 0.25) : POND;
  if (!water) base = shade(mix(base, [62, 84, 104], wet * 0.055), -wet * 0.035);
  base = grade(base, sea);

  ctx.save();
  hexPath(ctx, x, y, s + 0.5);
  ctx.fillStyle = css(base);
  ctx.fill();
  ctx.clip();
  // soft light from the upper left
  const g = ctx.createRadialGradient(x - s * 0.35, y - s * 0.45, s * 0.05, x, y, s * 1.15);
  g.addColorStop(0, 'rgba(255,248,230,0.18)');
  g.addColorStop(1, 'rgba(40,28,18,0.14)');
  ctx.fillStyle = g;
  ctx.fillRect(x - s - 1, y - s - 1, s * 2 + 2, s * 2 + 2);
  ctx.lineCap = 'round';

  if (t === 'shallows' || t === 'sea') shallowsDetail(ctx, x, y, s, base, sea, seed);
  else if (t === 'sand') sandDetail(ctx, x, y, s, base, seed);
  else if (t === 'rock') rockDetail(ctx, x, y, s, base, seed);
  else if (t === 'soil') soilDetail(ctx, x, y, s, base, cell.fert, sea, seed);
  else if (t === 'marsh') marshDetail(ctx, x, y, s, base, sea, seed);
  else if (t === 'pond') pondDetail(ctx, x, y, s, base, sea, seed);

  if (sea === 3 && !water) snow(ctx, x, y, s, seed, t === 'marsh' ? 0.6 : 1);
  if (cell.burnt > 0) ash(ctx, x, y, s, cell.burnt, seed);

  // soft inner edge so cells read as tiles without hard outlines
  hexPath(ctx, x, y, s);
  pen(ctx, 'rgba(50,34,20,0.13)', Math.max(1, s * 0.07));
  ctx.stroke();
  ctx.restore();
}

function shallowsDetail(ctx: Ctx, x: number, y: number, s: number, base: RGB, sea: number, seed: number) {
  // sandy bottom showing through
  ctx.fillStyle = css(mix(base, SAND, 0.35), 0.45);
  each(seed + 11, 3, s * 0.6, (dx, dy, i) => ell(ctx, x + dx, y + dy, s * (0.18 + 0.12 * hash(seed, i + 40)), s * 0.1));
  pen(ctx, sea === 3 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.38)', Math.max(0.8, s * 0.045));
  for (let i = 0; i < 4; i++) {
    const [dx, dy] = scatter(seed + 5, i, 4, s * 0.65), w = s * (0.14 + 0.1 * hash(seed, i + 20));
    ctx.beginPath();
    ctx.arc(x + dx, y + dy + w, w, -Math.PI * 0.78, -Math.PI * 0.22);
    ctx.stroke();
  }
}

function sandDetail(ctx: Ctx, x: number, y: number, s: number, base: RGB, seed: number) {
  pen(ctx, css(shade(base, -0.12), 0.5), Math.max(0.7, s * 0.035));
  for (let i = 0; i < 3; i++) {
    const [dx, dy] = scatter(seed + 3, i, 3, s * 0.5), w = s * 0.28;
    ctx.beginPath();
    ctx.moveTo(x + dx - w, y + dy);
    ctx.quadraticCurveTo(x + dx - w / 2, y + dy - s * 0.06, x + dx, y + dy);
    ctx.quadraticCurveTo(x + dx + w / 2, y + dy + s * 0.06, x + dx + w, y + dy);
    ctx.stroke();
  }
  each(seed + 9, 9, s * 0.78, (dx, dy, i) => fd(ctx, css(shade(base, hash(seed, i + 70) < 0.5 ? -0.18 : 0.3), 0.7), x + dx, y + dy, s * 0.03));
}

function rockDetail(ctx: Ctx, x: number, y: number, s: number, base: RGB, seed: number) {
  // cracks
  pen(ctx, css(shade(base, -0.32), 0.55), Math.max(0.7, s * 0.035));
  for (let i = 0; i < 3; i++) {
    let a = hash(seed, i + 10) * TAU;
    let px = x + Math.cos(a) * s * 0.15;
    let py = y + Math.sin(a) * s * 0.15;
    ctx.beginPath();
    ctx.moveTo(px, py);
    for (let j = 0; j < 3; j++) {
      a += (hash(seed, i * 5 + j + 30) - 0.5) * 1.2;
      px += Math.cos(a) * s * 0.22;
      py += Math.sin(a) * s * 0.22;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  // boulders
  const count = 2 + Math.floor(hash(seed, 1) * 2);
  for (const [dx, dy] of spots(seed + 17, count, s * 0.55)) {
    const r = s * (0.13 + 0.09 * hash(seed, dx * 100)), bx = x + dx, by = y + dy;
    fe(ctx, css(shade(base, -0.28), 0.5), bx + r * 0.15, by + r * 0.45, r * 1.05, r * 0.5);
    fe(ctx, css(shade(base, -0.08)), bx, by, r, r * 0.78);
    fe(ctx, css(shade(base, 0.2)), bx - r * 0.25, by - r * 0.28, r * 0.55, r * 0.35, -0.3);
  }
}

function soilDetail(ctx: Ctx, x: number, y: number, s: number, base: RGB, fert: number, sea: number, seed: number) {
  // clods
  each(seed + 23, 10, s * 0.78, (dx, dy, i) => fe(ctx, css(shade(base, hash(seed, i + 50) < 0.6 ? -0.2 : 0.16), 0.6), x + dx, y + dy, s * 0.05, s * 0.032));
  // fertility: humus patches and little green sprouts, more with richer soil
  if (fert > 0) {
    ctx.fillStyle = css(grade([76, 100, 44], sea), 0.12 + fert * 0.06);
    each(seed + 61, fert + 1, s * 0.5, (dx, dy) => ell(ctx, x + dx, y + dy, s * 0.3, s * 0.2));
    const green = grade(sea === 3 ? [120, 128, 92] : [118, 170, 66], sea), n = fert * 4;
    for (let i = 0; i < n; i++) {
      const [dx, dy] = scatter(seed + 41, i, n, s * 0.74), px = x + dx, py = y + dy, l = s * 0.045;
      fe(ctx, css(shade(green, -0.2), 0.8), px - l * 0.7, py - l * 0.3, l, l * 0.45, 0.5);
      fe(ctx, css(green, 0.9), px + l * 0.7, py - l * 0.5, l, l * 0.45, -0.5);
    }
  }
}

function marshDetail(ctx: Ctx, x: number, y: number, s: number, base: RGB, sea: number, seed: number) {
  const pool = grade(sea === 3 ? [180, 205, 220] : [70, 112, 120], sea);
  for (const [dx, dy] of spots(seed + 29, 3, s * 0.55)) {
    const rx = s * (0.2 + 0.08 * hash(seed, dx * 50)), px = x + dx, py = y + dy;
    fe(ctx, css(shade(base, -0.25), 0.6), px, py + s * 0.02, rx * 1.12, rx * 0.6);
    fe(ctx, css(pool), px, py, rx, rx * 0.5);
    fe(ctx, 'rgba(255,255,255,0.35)', px - rx * 0.3, py - rx * 0.15, rx * 0.4, rx * 0.1);
  }
  pen(ctx, css(shade(base, 0.15), 0.8), Math.max(0.7, s * 0.035));
  each(seed + 37, 8, s * 0.75, (dx, dy) => line(ctx, x + dx, y + dy, x + dx + s * 0.03, y + dy - s * 0.1));
}

function pondDetail(ctx: Ctx, x: number, y: number, s: number, base: RGB, sea: number, seed: number) {
  const ice = sea === 3, deep = grade(ice ? [176, 206, 226] : POND, sea), r = s * 0.7;
  const wob = (i: number) => r * (0.92 + 0.12 * hash(seed, i + 80));
  const pondPath = (k: number, oy: number) => {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU, px = x + Math.cos(a) * wob(i) * k, py = y + oy + Math.sin(a) * wob(i) * k * 0.86;
      if (i === 0) ctx.moveTo(px, py);
      else {
        const am = ((i - 0.5) / 8) * TAU, rr = (wob(i) + wob(i - 1)) * 0.55 * k;
        ctx.quadraticCurveTo(x + Math.cos(am) * rr, y + oy + Math.sin(am) * rr * 0.86, px, py);
      }
    }
    const am = (7.5 / 8) * TAU, rr = (wob(0) + wob(7)) * 0.55 * k;
    ctx.quadraticCurveTo(x + Math.cos(am) * rr, y + oy + Math.sin(am) * rr * 0.86, x + wob(0) * k, y + oy);
    ctx.closePath();
  };
  // sandy rim, then water
  pondPath(1.12, 0);
  ctx.fillStyle = css(shade(mix(base, SAND, 0.4), 0.1));
  ctx.fill();
  pondPath(1, 0);
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r);
  g.addColorStop(0, css(shade(deep, -0.15)));
  g.addColorStop(0.75, css(deep));
  g.addColorStop(1, css(mix(deep, SHALLOWS, 0.45)));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.save();
  pondPath(1, 0);
  ctx.clip();
  // inner shade under the near bank
  fe(ctx, 'rgba(10,20,40,0.18)', x, y - r * 0.95, r * 1.1, r * 0.35);
  pen(ctx, ice ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.4)', Math.max(0.8, s * 0.045));
  if (ice) {
    for (let i = 0; i < 3; i++) {
      const oy = (i - 1) * r * 0.35;
      line(ctx, x - r * 0.4 + i * r * 0.1, y + oy + r * 0.1, x + r * 0.2 + i * r * 0.1, y + oy - r * 0.15);
    }
  } else {
    for (let i = 0; i < 2; i++) {
      const [dx, dy] = scatter(seed + 7, i, 2, r * 0.45), w = r * 0.22;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy + w, w, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();
    }
    fe(ctx, 'rgba(255,255,255,0.5)', x + r * 0.35, y + r * 0.35, r * 0.12, r * 0.04);
  }
  ctx.restore();
}

function snow(ctx: Ctx, x: number, y: number, s: number, seed: number, amt: number) {
  ctx.fillStyle = `rgba(250,252,255,${0.16 * amt})`;
  ctx.fillRect(x - s, y - s, s * 2, s * 2);
  ctx.fillStyle = `rgba(250,252,255,${0.8 * amt})`;
  each(seed + 31, 8, s * 0.8, (dx, dy, i) => ell(ctx, x + dx, y + dy, s * (0.07 + 0.08 * hash(seed, i + 90)), s * (0.035 + 0.03 * hash(seed, i + 95))));
  ctx.fillStyle = `rgba(255,255,255,${0.9 * amt})`;
  each(seed + 47, 10, s * 0.85, (dx, dy) => dot(ctx, x + dx, y + dy, s * 0.025));
}

function ash(ctx: Ctx, x: number, y: number, s: number, burnt: number, seed: number) {
  const a = Math.min(1, 0.45 + 0.25 * burnt);
  ctx.fillStyle = `rgba(48,42,40,${0.6 * a})`;
  ctx.fillRect(x - s, y - s, s * 2, s * 2);
  ctx.fillStyle = `rgba(160,154,148,${0.5 * a})`;
  each(seed + 53, 6, s * 0.7, (dx, dy, i) => ell(ctx, x + dx, y + dy, s * 0.16, s * 0.07, hash(seed, i + 3)));
  pen(ctx, `rgba(22,18,16,${0.75 * a})`, Math.max(1, s * 0.06));
  for (let i = 0; i < 3; i++) {
    const [dx, dy] = scatter(seed + 59, i, 3, s * 0.5), ang = hash(seed, i + 7) * Math.PI, l = s * 0.18;
    line(ctx, x + dx - Math.cos(ang) * l, y + dy - Math.sin(ang) * l * 0.6, x + dx + Math.cos(ang) * l, y + dy + Math.sin(ang) * l * 0.6);
  }
  if (burnt >= 2) {
    ctx.fillStyle = 'rgba(240,120,40,0.85)';
    each(seed + 67, 3, s * 0.55, (dx, dy) => dot(ctx, x + dx, y + dy, s * 0.035));
  }
}

// ---------------------------------------------------------------- sea

interface Wave {
  x: number;
  y: number;
  ph: number;
  w: number;
}
let seaCache: { ctx: Ctx; w: number; h: number; g: CanvasGradient; waves: Wave[]; span: number } | null = null;

/**
 * The open sea behind the island (whole canvas w×h). Called every frame: the
 * gradient and wave layout are cached per (ctx, w, h); each frame strokes ~60
 * short wave crests in three alpha batches.
 */
export function drawSea(ctx: Ctx, w: number, h: number, time: number): void {
  if (!seaCache || seaCache.ctx !== ctx || seaCache.w !== w || seaCache.h !== h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#5aa7b8');
    g.addColorStop(0.5, '#3f8fa8');
    g.addColorStop(1, '#2f7898');
    const cell = 58, cols = Math.ceil(w / cell) + 1, rows = Math.ceil(h / (cell * 0.62)) + 1;
    const waves: Wave[] = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const k = r * 131 + c;
        waves.push({ x: (c + (r & 1) * 0.5 + hash(k, 1) * 0.6) * cell, y: (r + hash(k, 2) * 0.5) * cell * 0.62, ph: hash(k, 3) * TAU, w: 6 + hash(k, 4) * 6 });
      }
    seaCache = { ctx, w, h, g, waves, span: cols * cell };
  }
  const { g, waves, span } = seaCache;
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.lineCap = 'round';
  ctx.lineWidth = 1.4;
  for (let b = 0; b < 3; b++) {
    ctx.beginPath();
    for (const v of waves) {
      const life = Math.sin(time * 0.6 + v.ph);
      if (life < 0.2 || Math.min(2, Math.floor((life - 0.2) * 3.75)) !== b) continue;
      const wx = (v.x + time * 4 + Math.sin(time * 0.4 + v.ph) * 3) % span;
      const wy = v.y + Math.sin(time * 0.8 + v.ph) * 1.5;
      ctx.moveTo(wx - v.w, wy);
      ctx.quadraticCurveTo(wx - v.w / 2, wy - 3, wx, wy);
      ctx.quadraticCurveTo(wx + v.w / 2, wy - 3, wx + v.w, wy);
    }
    ctx.strokeStyle = `rgba(225,245,250,${0.1 + b * 0.09})`;
    ctx.stroke();
  }
}

// ---------------------------------------------------------------- plants

const clampN = (n: number) => Math.max(1, Math.min(3, Math.round(n)));

/** Plant population (n = 1..3) drawn within the hex at (x, y). Static; draw cells back to front (by y). */
export function drawPlant(ctx: Ctx, x: number, y: number, size: number, pop: Pop<PlantId>, sea: number, seed: number): void {
  const n = clampN(pop.n);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (pop.id) {
    case 'lichen': lichen(ctx, x, y, size, n, sea, seed); break;
    case 'grass': grass(ctx, x, y, size, n, sea, seed, false); break;
    case 'flowers': grass(ctx, x, y, size, n, sea, seed, true); break;
    case 'shrub': shrubs(ctx, x, y, size, n, sea, seed); break;
    case 'tree': tree(ctx, x, y, size, n, sea, seed); break;
    case 'reeds': reeds(ctx, x, y, size, n, sea, seed); break;
    case 'fungi': fungi(ctx, x, y, size, n, sea, seed); break;
  }
  ctx.restore();
}

function lichen(ctx: Ctx, x: number, y: number, s: number, n: number, sea: number, seed: number) {
  const pal: RGB[] = [[206, 214, 120], [182, 206, 150], [226, 170, 78], [214, 222, 160]];
  const count = [0, 5, 9, 14][n];
  for (let i = 0; i < count; i++) {
    const [dx, dy] = scatter(seed + 101, i, count, s * 0.72);
    const c = grade(pal[Math.floor(hash(seed, i + 200) * (hash(seed, i + 201) < 0.2 ? 4 : 2)) % 4], sea);
    const r = s * (0.06 + 0.05 * hash(seed, i + 202)) * (0.8 + n * 0.15);
    fd(ctx, css(shade(c, -0.25), 0.55), x + dx + r * 0.2, y + dy + r * 0.25, r * 1.05);
    ctx.fillStyle = css(c);
    for (let j = 0; j < 3; j++) {
      const a = j * 2.1 + hash(seed, i * 3 + j);
      dot(ctx, x + dx + Math.cos(a) * r * 0.7, y + dy + Math.sin(a) * r * 0.55, r * (0.55 + 0.25 * hash(seed, i + j * 9)));
    }
    fd(ctx, css(shade(c, 0.35)), x + dx - r * 0.3, y + dy - r * 0.3, r * 0.28);
  }
}

const GRASS: RGB[] = [[118, 182, 68], [126, 168, 58], [196, 166, 84], [168, 146, 92]];
const PETALS: RGB[] = [[238, 122, 164], [246, 206, 72], [252, 246, 236], [164, 124, 222], [240, 140, 90]];

function tuft(ctx: Ctx, px: number, py: number, h: number, w: number, c: RGB, seed: number) {
  ctx.strokeStyle = css(shade(c, -0.2));
  const blades = 5;
  for (let b = 0; b < blades; b++) {
    if (b === 2) ctx.strokeStyle = css(c);
    if (b === 4) ctx.strokeStyle = css(shade(c, 0.22));
    const lean = (b / (blades - 1) - 0.5) * 2 + (hash(seed, b) - 0.5) * 0.5;
    const hh = h * (0.7 + 0.3 * hash(seed, b + 5)) * (1 - Math.abs(lean) * 0.25);
    ctx.beginPath();
    ctx.moveTo(px + lean * w * 0.25, py);
    ctx.quadraticCurveTo(px + lean * w * 0.5, py - hh * 0.6, px + lean * w, py - hh);
    ctx.stroke();
  }
}

function grass(ctx: Ctx, x: number, y: number, s: number, n: number, sea: number, seed: number, flowers: boolean) {
  // Winter: grass goes silver with frost; a dried meadow stays straw-gold so the two stay apart.
  const c = sea === 3 ? (flowers ? ([196, 170, 112] as RGB) : mix(GRASS[3], [220, 226, 232], 0.12)) : grade(GRASS[sea], sea);
  // meadow wash so density reads at a glance
  ctx.fillStyle = css(shade(c, -0.1), 0.18 + n * 0.1);
  each(seed + 111, n + 1, s * 0.35, (dx, dy) => ell(ctx, x + dx, y + dy, s * (0.3 + n * 0.1), s * (0.22 + n * 0.08)));
  const count = flowers ? [0, 4, 7, 10][n] : [0, 5, 9, 14][n], pts = spots(seed + 113, count, s * 0.7);
  ctx.lineWidth = Math.max(0.8, s * 0.045);
  pts.forEach(([dx, dy], i) => {
    const h = s * (0.2 + 0.08 * n) * (0.75 + 0.5 * hash(seed, i + 300));
    shadow(ctx, x + dx, y + dy + s * 0.02, s * 0.12, s * 0.05, 0.25);
    tuft(ctx, x + dx, y + dy, h, s * 0.16, shade(c, (hash(seed, i + 301) - 0.5) * 0.15), seed + i * 13);
    if (sea === 3 && !flowers) {
      fe(ctx, 'rgba(255,255,255,0.9)', x + dx, y + dy - h * 0.15, s * 0.05, s * 0.022);
    }
  });
  if (!flowers) return;
  const fc = [0, 7, 12, 18][n];
  for (const [dx, dy] of spots(seed + 117, fc, s * 0.72)) {
    const k = Math.floor(hash(seed, dx * 977 + dy * 31) * PETALS.length), px = x + dx, py = y + dy - s * 0.12;
    const r = s * 0.065;
    if (sea <= 1) {
      const p = PETALS[k];
      pen(ctx, css(shade(c, -0.15)), Math.max(0.6, s * 0.03));
      line(ctx, px, py, px, py + s * 0.12);
      fd(ctx, css(shade(p, -0.2)), px + r * 0.2, py + r * 0.25, r * 1.05);
      fd(ctx, css(p), px, py, r);
      fd(ctx, k === 1 ? 'rgb(200,120,40)' : 'rgb(250,214,90)', px, py, r * 0.38);
    } else if (sea === 2) {
      fd(ctx, k % 2 ? 'rgb(176,104,52)' : 'rgb(214,160,70)', px, py, r * 0.75);
    } else {
      // Dry seed-heads: pale puffs on dark stalks.
      pen(ctx, 'rgb(120,96,64)', Math.max(0.6, s * 0.025));
      line(ctx, px, py, px, py + s * 0.12);
      fd(ctx, 'rgba(246,240,224,0.95)', px, py, r * 0.85);
      fd(ctx, 'rgb(150,120,84)', px, py, r * 0.3);
    }
  }
}

const LEAF: RGB[] = [[112, 172, 70], [64, 128, 58], [196, 132, 46]];

/** A lumpy, painterly foliage mass. `cols` gives per-lump color choices. */
function foliage(ctx: Ctx, cx: number, cy: number, R: number, cols: RGB[], seed: number, snowy: boolean) {
  const pick = (i: number) => cols[Math.floor(hash(seed, i + 400) * cols.length)];
  fe(ctx, css(shade(cols[0], -0.32)), cx, cy + R * 0.08, R * 0.95, R * 0.86);
  const L = 7;
  for (let i = 0; i < L; i++) {
    const a = (i / L) * TAU + hash(seed, 401) * TAU, r = R * (0.4 + 0.12 * hash(seed, i + 410));
    fd(ctx, css(shade(pick(i), -0.14)), cx + Math.cos(a) * R * 0.52, cy + Math.sin(a) * R * 0.46 + R * 0.04, r);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + hash(seed, 402) * TAU;
    fd(ctx, css(pick(i + 20)), cx + Math.cos(a) * R * 0.3 - R * 0.1, cy + Math.sin(a) * R * 0.26 - R * 0.14, R * (0.3 + 0.08 * hash(seed, i + 420)));
  }
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * (1.05 + i * 0.22) + (hash(seed, i + 430) - 0.5) * 0.3;
    fd(ctx, css(shade(pick(i + 40), 0.22), 0.9), cx + Math.cos(a) * R * 0.42, cy + Math.sin(a) * R * 0.4 - R * 0.05, R * 0.17);
  }
  if (snowy) {
    ctx.fillStyle = 'rgba(252,253,255,0.92)';
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * (1.15 + i * 0.25);
      ell(ctx, cx + Math.cos(a) * R * 0.45, cy + Math.sin(a) * R * 0.5, R * 0.22, R * 0.1);
    }
  }
}

function shrubs(ctx: Ctx, x: number, y: number, s: number, n: number, sea: number, seed: number) {
  const bushes: [number, number, number][] =
    n === 1 ? [[0, 0.05, 0.3]] : n === 2 ? [[-0.2, -0.12, 0.26], [0.12, 0.12, 0.36]] : [[-0.32, -0.12, 0.3], [0.3, -0.2, 0.27], [0.02, 0.18, 0.4]];
  const base: RGB[] =
    sea === 2 ? [[176, 96, 52], [150, 120, 50]] : sea === 3 ? [[52, 84, 60], [64, 96, 66]] : [[LEAF[sea][0] - 10, LEAF[sea][1] - 8, LEAF[sea][2]], LEAF[sea]];
  const cols = base.map((c) => (sea === 3 ? c : grade(c, sea)));
  bushes.sort((a, b) => a[1] - b[1]);
  bushes.forEach(([bx, by, br], j) => {
    const px = x + bx * s, py = y + by * s, R = br * s;
    shadow(ctx, px + R * 0.2, py + R * 0.75, R * 1.2, R * 0.5, 0.35);
    foliage(ctx, px, py, R, cols, seed + j * 17, sea === 3);
    if (sea === 3) return;
    const berries = sea >= 1, count = berries ? 6 : 4;
    for (let i = 0; i < count; i++) {
      const [dx, dy] = scatter(seed + j * 31 + 7, i, count, R * 0.75);
      if (berries) {
        fd(ctx, 'rgb(120,20,36)', px + dx + R * 0.03, py + dy + R * 0.04, R * 0.12);
        fd(ctx, sea === 1 ? 'rgb(222,44,58)' : 'rgb(196,34,64)', px + dx, py + dy, R * 0.1);
        fd(ctx, 'rgba(255,230,230,0.8)', px + dx - R * 0.03, py + dy - R * 0.03, R * 0.035);
      } else {
        fd(ctx, 'rgb(250,240,236)', px + dx, py + dy, R * 0.07);
      }
    }
  });
}

function branches(ctx: Ctx, x: number, y: number, len: number, ang: number, w: number, depth: number, seed: number, tips: [number, number][]) {
  const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
  ctx.lineWidth = w;
  line(ctx, x, y, x2, y2);
  if (depth === 0) {
    tips.push([x2, y2]);
    return;
  }
  const sp = 0.32 + 0.2 * hash(seed, depth);
  branches(ctx, x2, y2, len * 0.72, ang - sp, w * 0.62, depth - 1, seed * 3 + 1, tips);
  branches(ctx, x2, y2, len * 0.72, ang + sp, w * 0.62, depth - 1, seed * 3 + 2, tips);
}

function tree(ctx: Ctx, x: number, y: number, s: number, n: number, sea: number, seed: number) {
  const R = s * [0, 0.2, 0.46, 0.72][n], trunkH = s * [0, 0.34, 0.36, 0.42][n], trunkW = s * [0, 0.05, 0.1, 0.15][n];
  const gx = x + s * 0.04, gy = y + s * (n === 3 ? 0.32 : 0.24), cy = gy - trunkH - R * 0.45;
  shadow(ctx, gx + R * 0.25, gy, R * 1.25 + s * 0.1, (R * 1.25 + s * 0.1) * 0.42, 0.38);
  const bark: RGB = grade([104, 76, 52], sea);
  // trunk
  ctx.fillStyle = css(bark);
  ctx.beginPath();
  ctx.moveTo(gx - trunkW * 0.75, gy);
  ctx.quadraticCurveTo(gx - trunkW * 0.4, gy - trunkH * 0.5, gx - trunkW * 0.45, gy - trunkH - R * 0.2);
  ctx.lineTo(gx + trunkW * 0.45, gy - trunkH - R * 0.2);
  ctx.quadraticCurveTo(gx + trunkW * 0.4, gy - trunkH * 0.5, gx + trunkW * 0.75, gy);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = css(shade(bark, 0.2), 0.7);
  ctx.fillRect(gx - trunkW * 0.35, gy - trunkH, trunkW * 0.25, trunkH * 0.9);
  if (sea === 3) {
    // bare winter oak
    ctx.strokeStyle = css(shade(bark, 0.05));
    const tips: [number, number][] = [];
    const depth = n === 1 ? 1 : n === 2 ? 2 : 3, len = R * (n === 1 ? 0.8 : n === 2 ? 0.5 : 0.42);
    const top = gy - trunkH - R * 0.15;
    fe(ctx, css(shade(bark, 0.3), 0.18), gx, cy, R * 0.9, R * 0.8);
    for (let i = 0; i < 3; i++) branches(ctx, gx, top, len, -Math.PI / 2 + (i - 1) * 0.6, trunkW * 0.75, depth, seed * 7 + i, tips);
    ctx.fillStyle = 'rgba(252,253,255,0.95)';
    tips.forEach(([tx, ty], i) => {
      if (i % 3 === 0) ell(ctx, tx, ty, s * 0.04, s * 0.02);
    });
    return;
  }
  const cols: RGB[] =
    sea === 2
      ? [[214, 150, 52], [192, 98, 44], [228, 186, 80], [170, 120, 50]]
      : sea === 0
        ? [[124, 186, 74], [104, 166, 66], [150, 200, 90]]
        : [[66, 132, 58], [54, 114, 54], [92, 150, 64]];
  foliage(ctx, gx, cy, R, cols.map((c) => grade(c, sea)), seed + 5, false);
  if (n === 3 && sea === 1) {
    // a few acorns-in-leaf highlights for summer richness
    ctx.fillStyle = 'rgba(210,230,140,0.55)';
    each(seed + 141, 4, R * 0.6, (dx, dy) => dot(ctx, gx + dx, cy + dy, R * 0.05));
  }
  if (sea === 2 && n >= 2) {
    // fallen leaves under the tree
    const lc: RGB[] = [[214, 140, 50], [190, 90, 40], [230, 186, 80]];
    each(seed + 151, 6, s * 0.6, (dx, dy, i) => fe(ctx, css(lc[i % 3]), x + dx, gy - s * 0.05 + Math.abs(dy) * 0.5, s * 0.04, s * 0.025, i));
  }
}

function reeds(ctx: Ctx, x: number, y: number, s: number, n: number, sea: number, seed: number) {
  const stalk = sea === 3 ? ([196, 176, 128] as RGB) : grade(([[110, 168, 74], [94, 148, 64], [184, 158, 84]] as RGB[])[sea], sea);
  const head: RGB = sea === 0 ? [112, 104, 56] : sea === 3 ? [150, 112, 76] : [112, 66, 36];
  // clump wash at the waterline
  fe(ctx, css(shade(stalk, -0.35), 0.18 + n * 0.06), x, y + s * 0.12, s * (0.3 + n * 0.12), s * (0.16 + n * 0.06));
  const count = [0, 5, 9, 14][n], pts = spots(seed + 161, count, s * 0.62);
  pts.forEach(([dx, dy], i) => {
    const px = x + dx, py = y + dy + s * 0.15, h = s * (0.42 + 0.1 * n) * (0.75 + 0.4 * hash(seed, i + 500));
    const lean = (hash(seed, i + 501) - 0.5) * s * 0.14;
    pen(ctx, 'rgba(255,255,255,0.3)', Math.max(0.6, s * 0.025));
    ctx.beginPath();
    ctx.ellipse(px, py, s * 0.09, s * 0.03, 0, 0, Math.PI);
    ctx.stroke();
    // leaf blades
    pen(ctx, css(shade(stalk, 0.14)), Math.max(0.9, s * 0.045));
    const side = hash(seed, i + 503) < 0.5 ? -1 : 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + side * s * 0.06, py - h * 0.45, px + side * s * 0.15, py - h * 0.62);
    ctx.stroke();
    pen(ctx, css(shade(stalk, -0.15)), Math.max(0.9, s * 0.04));
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px, py - h * 0.5, px + lean, py - h);
    ctx.stroke();
    if (hash(seed, i + 502) < 0.7) {
      const hx = px + lean * 0.86, hy = py - h * 0.8;
      ctx.lineWidth = Math.max(0.6, s * 0.022);
      line(ctx, hx, hy, px + lean * 1.04, py - h - s * 0.07);
      fe(ctx, css(head), hx, hy, s * 0.055, s * 0.12, lean / s);
      ctx.fillStyle = sea === 3 ? 'rgba(250,246,236,0.95)' : 'rgba(255,230,200,0.3)';
      if (sea === 3) ell(ctx, hx + s * 0.02, hy - s * 0.06, s * 0.06, s * 0.05);
      else ell(ctx, hx - s * 0.018, hy - s * 0.02, s * 0.018, s * 0.07, lean / s);
    }
  });
}

function fungi(ctx: Ctx, x: number, y: number, s: number, n: number, sea: number, seed: number) {
  const count = [0, 2, 4, 7][n], pts = spots(seed + 171, count, s * 0.55);
  pts.forEach(([dx, dy], i) => {
    const px = x + dx, py = y + dy + s * 0.1, r = s * (0.1 + 0.05 * hash(seed, i + 600)) * (sea === 3 ? 0.8 : 1);
    const kind = hash(seed, i + 601);
    const cap: RGB = grade(kind < 0.45 ? [212, 58, 44] : kind < 0.8 ? [168, 112, 70] : [222, 190, 140], sea);
    shadow(ctx, px + r * 0.2, py, r * 1.3, r * 0.5, 0.35);
    ctx.fillStyle = 'rgb(240,232,214)';
    ctx.fillRect(px - r * 0.28, py - r * 1.1, r * 0.56, r * 1.1);
    fe(ctx, css(shade(cap, -0.3)), px, py - r * 1.05, r * 1.05, r * 0.35);
    ctx.fillStyle = css(cap);
    ctx.beginPath();
    ctx.ellipse(px, py - r * 1.1, r, r * 0.85, 0, Math.PI, TAU);
    ctx.fill();
    fe(ctx, css(shade(cap, 0.3), 0.8), px - r * 0.35, py - r * 1.55, r * 0.28, r * 0.16, -0.5);
    if (kind < 0.45) {
      fd(ctx, 'rgba(255,250,240,0.95)', px + r * 0.3, py - r * 1.45, r * 0.13);
      dot(ctx, px - r * 0.1, py - r * 1.75, r * 0.11);
      dot(ctx, px + r * 0.55, py - r * 1.2, r * 0.1);
    }
    if (sea === 3) {
      fe(ctx, 'rgba(252,253,255,0.95)', px, py - r * 1.8, r * 0.7, r * 0.22);
    }
  });
}

// ---------------------------------------------------------------- animals
// Each individual is drawn facing right with its feet at the origin, in units
// where a hex has size 25.

const FUR = {
  rabbit: [168, 140, 112] as RGB,
  rabbitW: [228, 224, 216] as RGB,
  deer: [178, 120, 72] as RGB,
  fox: [222, 112, 44] as RGB,
  wolf: [116, 118, 128] as RGB,
  beaver: [128, 86, 52] as RGB,
};
const CREAM = 'rgb(246,238,222)', EYE = 'rgb(30,22,18)';

function rabbit(ctx: Ctx, sea: number) {
  const c = sea === 3 ? FUR.rabbitW : FUR.rabbit;
  fe(ctx, css(shade(c, -0.18)), 2.4, -7.6, 0.85, 2.6, 0.25);
  fe(ctx, css(shade(c, -0.08)), -1.2, -3, 3, 2.7);
  fe(ctx, css(c), 0.6, -3.4, 3.4, 2.6);
  dot(ctx, 3.3, -5.2, 2.1);
  ell(ctx, 3.4, -7.9, 0.9, 2.7, 0.08);
  fe(ctx, 'rgb(232,170,170)', 3.4, -7.8, 0.4, 1.8, 0.08);
  fd(ctx, CREAM, -3.6, -3.8, 1.3);
  ell(ctx, 1.8, -1.3, 1.5, 0.7);
  fd(ctx, EYE, 4.1, -5.6, 0.5);
  fd(ctx, 'rgb(214,120,130)', 5.3, -4.9, 0.4);
}

function deer(ctx: Ctx, sea: number, t: number) {
  const c = sea === 3 ? shade(FUR.deer, -0.12) : FUR.deer, legs = css(shade(c, -0.35));
  pen(ctx, legs, 1.1);
  const sw = Math.sin(t * 5) * 0.6;
  segs(ctx, [-3.6, -5, -3.6 - sw, 0, -2.4, -5, -2.4 + sw, 0, 2.4, -5, 2.4 + sw, 0, 3.5, -5, 3.5 - sw, 0]);
  fe(ctx, css(c), 0, -6.4, 5, 2.6);
  // neck and head
  poly(ctx, css(c), [2.6, -7.8, 4.4, -11.4, 6.2, -10.6, 5, -6.2]);
  ell(ctx, 6, -11.6, 2, 1.3, 0.2);
  fe(ctx, css(shade(c, -0.2)), 4.4, -12.8, 0.6, 1.3, -0.6);
  fe(ctx, css(shade(c, 0.25)), 0.2, -7.4, 4, 1.1);
  fe(ctx, CREAM, -4.6, -6.8, 1.1, 1.6);
  ell(ctx, 0.6, -4.6, 3, 0.7);
  if (sea <= 1) {
    dot(ctx, -1.6, -7.6, 0.45);
    dot(ctx, 0.4, -7.9, 0.45);
    dot(ctx, 2, -7.5, 0.45);
  }
  // antlers
  pen(ctx, 'rgb(226,206,168)', 0.7);
  segs(ctx, [5.4, -12.7, 4.8, -15.2, 5.1, -14, 3.8, -14.8, 6.2, -12.8, 7, -15, 6.6, -14, 7.8, -14.4]);
  fd(ctx, EYE, 6.4, -11.9, 0.45);
  dot(ctx, 7.9, -11.2, 0.4);
}

function canid(ctx: Ctx, c: RGB, t: number, wolf: boolean) {
  const k = wolf ? 1.15 : 1;
  ctx.save();
  ctx.scale(k, k);
  const dark = css(shade(c, -0.45));
  // tail
  ctx.fillStyle = css(shade(c, -0.08));
  if (wolf) ell(ctx, -5.2, -3.2, 2.9, 1.3, 0.5);
  else ell(ctx, -5.8, -4.2, 3.2, 1.6, -0.25);
  ctx.fillStyle = wolf ? css(shade(c, -0.3)) : CREAM;
  if (wolf) ell(ctx, -6.9, -2.1, 1.1, 0.8, 0.5);
  else dot(ctx, -8.4, -3.6, 1.1);
  // legs
  pen(ctx, dark, 1.1);
  const sw = Math.sin(t * 6) * 0.7;
  segs(ctx, [-2.6, -2.5, -2.6 - sw, 0, -1.6, -2.5, -1.6 + sw, 0, 2.4, -2.5, 2.4 + sw, 0, 3.3, -2.5, 3.3 - sw, 0]);
  // body
  fe(ctx, css(c), 0, -3.8, 4.4, 2.2);
  fe(ctx, wolf ? css(shade(c, -0.22)) : css(shade(c, 0.12)), -0.4, -5, 3.4, 0.9);
  fe(ctx, wolf ? 'rgb(214,212,206)' : CREAM, 3.4, -3.6, 1.4, 1.3);
  // head
  fd(ctx, css(c), 4.4, -5.6, 1.9);
  poly(ctx, css(c), [5.2, -6.6, 7.8, -5, 5.4, -4.2]);
  poly(ctx, dark, [3, -6.6, 3.4, -9.2, 4.4, -7.2]);
  poly(ctx, dark, [4.4, -7.2, 5.2, -9.2, 5.6, -6.8]);
  fe(ctx, wolf ? 'rgb(214,212,206)' : CREAM, 5.6, -4.6, 1.2, 0.6, 0.2);
  fd(ctx, EYE, 7.7, -5, 0.45);
  fd(ctx, wolf ? 'rgb(220,190,90)' : EYE, 5.1, -6, 0.42);
  ctx.restore();
}

function songbird(ctx: Ctx, t: number, ph: number) {
  const peck = Math.max(0, Math.sin(t * 2.2 + ph) - 0.7) * 3;
  pen(ctx, 'rgb(90,70,60)', 0.6);
  segs(ctx, [-0.4, -1.2, -0.6, 0, 0.6, -1.2, 0.6, 0]);
  fe(ctx, 'rgb(58,104,170)', -2.6, -3.6, 2, 0.7, -0.35);
  fe(ctx, 'rgb(240,206,78)', 0, -2.9, 2.5, 2.1);
  fe(ctx, 'rgb(86,148,200)', -0.9, -3.4, 1.8, 1.3, -0.2);
  ctx.save();
  ctx.translate(1.6, -4.6);
  ctx.rotate(peck * 0.35);
  fd(ctx, 'rgb(250,248,240)', 0, 0, 1.6);
  ctx.fillStyle = 'rgb(70,128,196)';
  ctx.beginPath();
  ctx.arc(0, 0, 1.6, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  poly(ctx, 'rgb(232,160,60)', [1.4, -0.4, 2.6, 0.1, 1.4, 0.4]);
  fd(ctx, EYE, 0.7, -0.2, 0.4);
  ctx.restore();
}

function frog(ctx: Ctx) {
  const g = 'rgb(98,164,72)', dk = 'rgb(62,118,52)';
  pen(ctx, dk, 1.1);
  segs(ctx, [-1.6, -1.2, -3.4, -0.4, -3.4, -0.4, -2.6, -2.4, 1.6, -1.2, 3.4, -0.4, 3.4, -0.4, 2.6, -2.4, -1.4, -3.6, -2.8, -4.6, 1.4, -3.6, 2.8, -4.6]);
  fe(ctx, g, 0, -2.6, 2.4, 2.1);
  fe(ctx, 'rgb(140,196,96)', 0, -2.3, 1.4, 1.2);
  fd(ctx, g, -1.2, -4.4, 0.95);
  dot(ctx, 1.2, -4.4, 0.95);
  fd(ctx, EYE, -1.2, -4.5, 0.48);
  dot(ctx, 1.2, -4.5, 0.48);
}

function beaver(ctx: Ctx, t: number) {
  const c = FUR.beaver;
  ctx.save();
  ctx.translate(-4.6, -1);
  ctx.rotate(Math.sin(t * 1.5) * 0.12);
  fe(ctx, 'rgb(70,56,48)', -1.2, 0, 2.6, 1.2, -0.15);
  pen(ctx, 'rgba(30,24,20,0.5)', 0.35);
  segs(ctx, [-2.8, -0.3, 0.2, -0.6, -2.8, 0.5, 0.4, 0.2]);
  ctx.restore();
  fe(ctx, css(shade(c, -0.2)), -1, -2.8, 3.4, 2.6);
  fe(ctx, css(c), 0.4, -3.2, 3.4, 2.7);
  fe(ctx, css(shade(c, 0.18)), 0.6, -2.2, 2.4, 1.4);
  fd(ctx, css(c), 3.8, -4, 2);
  dot(ctx, 2.8, -5.8, 0.7);
  fe(ctx, css(shade(c, 0.25)), 5.2, -3.6, 1, 0.8);
  ctx.fillStyle = 'rgb(250,244,230)';
  ctx.fillRect(5, -3, 0.8, 1);
  fd(ctx, EYE, 4.4, -4.6, 0.45);
  dot(ctx, 6, -4, 0.45);
}

function bee(ctx: Ctx, x: number, y: number, k: number, t: number, ph: number, dir: number) {
  fe(ctx, 'rgba(40,28,14,0.15)', x, y + 5 * k, 1.4 * k, 0.6 * k);
  const flap = 0.35 + 0.65 * Math.abs(Math.sin(t * 38 + ph));
  fe(ctx, 'rgba(255,255,255,0.85)', x - 0.7 * k * dir, y - 1.7 * k, 1.4 * k, 1.1 * k * flap, -0.5 * dir);
  ell(ctx, x + 0.5 * k * dir, y - 1.8 * k, 1.2 * k, 1 * k * flap, 0.5 * dir);
  fe(ctx, 'rgb(246,196,48)', x, y, 1.9 * k, 1.35 * k);
  ctx.fillStyle = 'rgb(46,32,22)';
  ctx.fillRect(x - 0.5 * k, y - 1.3 * k, 0.7 * k, 2.6 * k);
  dot(ctx, x + 1.8 * k * dir, y - 0.1 * k, 0.75 * k);
}

function zzz(ctx: Ctx, x: number, y: number, k: number, t: number, ph: number) {
  pen(ctx, 'rgba(250,252,255,0.9)', Math.max(0.7, 0.5 * k));
  for (let j = 0; j < 2; j++) {
    const p = (t * 0.35 + j * 0.5 + ph) % 1, zx = x + p * 3 * k, zy = y - p * 6 * k, z = (0.7 + p * 0.6) * k;
    ctx.globalAlpha = Math.sin(p * Math.PI);
    ctx.beginPath();
    ctx.moveTo(zx - z, zy - z);
    ctx.lineTo(zx + z, zy - z);
    ctx.lineTo(zx - z, zy + z);
    ctx.lineTo(zx + z, zy + z);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Sleeping hibernators: a snowy skep for bees, mud mounds with closed eyes for frogs. */
function asleep(ctx: Ctx, x: number, y: number, k: number, id: AnimalId, n: number, t: number, seed: number) {
  if (id === 'bees') {
    fe(ctx, 'rgba(40,28,14,0.25)', x + k, y + 1.5 * k, 5.5 * k, 2 * k);
    ctx.fillStyle = 'rgb(196,152,78)';
    ctx.beginPath();
    ctx.ellipse(x, y, 4.4 * k, 6 * k, 0, Math.PI, TAU);
    ctx.lineTo(x + 4.4 * k, y + k);
    ctx.lineTo(x - 4.4 * k, y + k);
    ctx.fill();
    pen(ctx, 'rgb(150,108,52)', 0.6 * k);
    for (let i = 1; i < 4; i++) {
      const yy = y - i * 1.45 * k, ww = 4.4 * k * Math.sqrt(1 - (i * 1.45 / 6) ** 2);
      line(ctx, x - ww, yy, x + ww, yy);
    }
    fe(ctx, 'rgb(46,32,22)', x, y - 0.2 * k, 1.1 * k, 0.9 * k);
    fe(ctx, 'rgba(252,253,255,0.95)', x - 0.4 * k, y - 5.4 * k, 3 * k, 1.3 * k);
    zzz(ctx, x + 3.5 * k, y - 6 * k, k, t, hash(seed, 9));
    return;
  }
  const pos = [[0, 0], [-5, -3], [5, -2]];
  for (let i = 0; i < n; i++) {
    const px = x + pos[i][0] * k, py = y + pos[i][1] * k;
    fe(ctx, 'rgb(100,84,66)', px, py, 3 * k, 1.6 * k);
    fd(ctx, 'rgb(86,140,64)', px - 1 * k, py - 1.2 * k, 0.8 * k);
    dot(ctx, px + 1 * k, py - 1.2 * k, 0.8 * k);
    pen(ctx, 'rgb(40,60,30)', 0.4 * k);
    line(ctx, px - 1.5 * k, py - 1.2 * k, px - 0.5 * k, py - 1.2 * k);
    line(ctx, px + 0.5 * k, py - 1.2 * k, px + 1.5 * k, py - 1.2 * k);
    fe(ctx, 'rgba(252,253,255,0.9)', px + 1.4 * k, py + 0.2 * k, 1.4 * k, 0.6 * k);
  }
  zzz(ctx, x + 2 * k, y - 3 * k, k, t, hash(seed, 9));
}

interface Gait {
  /** Wander speed (rad/s) and amplitude (units). */
  sp: number;
  amp: number;
  /** Hop height (units) and rate; 0 = walks. */
  hop: number;
  hopRate: number;
  /** Approximate body length (units) for shadows and icons. */
  len: number;
}
const GAIT: Record<AnimalId, Gait> = {
  bees: { sp: 0, amp: 0, hop: 0, hopRate: 0, len: 4 },
  rabbit: { sp: 0.7, amp: 3.5, hop: 1.8, hopRate: 6, len: 10 },
  songbird: { sp: 0.9, amp: 3, hop: 1.2, hopRate: 8, len: 7 },
  frog: { sp: 0.4, amp: 2, hop: 1.5, hopRate: 1.6, len: 7 },
  deer: { sp: 0.35, amp: 3, hop: 0, hopRate: 0, len: 14 },
  fox: { sp: 0.55, amp: 3.5, hop: 0, hopRate: 0, len: 15 },
  wolf: { sp: 0.45, amp: 3.5, hop: 0, hopRate: 0, len: 17 },
  beaver: { sp: 0.3, amp: 2, hop: 0, hopRate: 0, len: 13 },
};
const ICON_BOX: Record<AnimalId, [number, number, number]> = {
  bees: [0, 0, 1],
  rabbit: [0.4, -5.3, 11],
  songbird: [0, -3.1, 9],
  frog: [0, -2.7, 7.5],
  deer: [1.3, -7.6, 15.5],
  fox: [-0.85, -4.6, 17.3],
  wolf: [-0.15, -5.3, 18.3],
  beaver: [-0.6, -3.25, 15.6],
};
/** Home spots (units) for 1..3 individuals. */
const HOMES: [number, number][][] = [[], [[0, 4]], [[-5, 0], [5, 7]], [[-7, -1], [7, 1], [0, 10]]];

function individual(ctx: Ctx, id: AnimalId, sea: number, t: number, ph: number) {
  switch (id) {
    case 'rabbit': rabbit(ctx, sea); break;
    case 'deer': deer(ctx, sea, t); break;
    case 'fox': canid(ctx, FUR.fox, t, false); break;
    case 'wolf': canid(ctx, FUR.wolf, t, true); break;
    case 'songbird': songbird(ctx, t, ph); break;
    case 'frog': frog(ctx); break;
    case 'beaver': beaver(ctx, t); break;
    case 'bees': break;
  }
}

const order = [0, 1, 2], px3 = [0, 0, 0], py3 = [0, 0, 0], dir3 = [1, 1, 1], lift3 = [0, 0, 0];

/** Animal population: n individuals that move gently inside the hex over `time` seconds. */
export function drawAnimal(ctx: Ctx, x: number, y: number, size: number, pop: Pop<AnimalId>, sea: number, time: number, seed: number): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  animal(ctx, x, y, size, pop, sea, time, seed);
  ctx.restore();
}

function animal(ctx: Ctx, x: number, y: number, size: number, pop: Pop<AnimalId>, sea: number, time: number, seed: number) {
  const id = pop.id, n = clampN(pop.n), k = size / 23;
  if (sea === 3 && (id === 'bees' || id === 'frog')) {
    asleep(ctx, x, y + 3 * k, k, id, n, time, seed);
    return;
  }
  if (id === 'bees') {
    const count = n * 2;
    for (let i = 0; i < count; i++) {
      const ph = hash(seed, i + 700) * TAU;
      const [hx, hy] = scatter(seed + 3, i, count, 12), u = time * (1.6 + hash(seed, i + 701)) + ph;
      const bx = x + (hx + Math.cos(u) * 4 + Math.sin(time * 9 + ph) * 0.7) * k;
      const by = y + (hy + Math.sin(u * 1.3) * 3 + Math.cos(time * 11 + ph) * 0.7) * k;
      bee(ctx, bx, by, k, time, ph, -Math.sin(u) >= 0 ? 1 : -1);
    }
    return;
  }
  const g = GAIT[id], homes = HOMES[n];
  for (let i = 0; i < n; i++) {
    const ph = hash(seed, i + 710) * TAU, u = time * g.sp * (0.85 + 0.3 * hash(seed, i + 711)) + ph;
    px3[i] = x + (homes[i][0] + Math.sin(u) * g.amp) * k;
    py3[i] = y + (homes[i][1] + Math.sin(u * 0.63 + ph) * g.amp * 0.4) * k;
    dir3[i] = Math.cos(u) >= 0 ? 1 : -1;
    lift3[i] = g.hop > 0 ? Math.max(0, Math.sin(time * g.hopRate + ph)) ** 2 * g.hop * k : 0;
    order[i] = i;
  }
  for (let a = 1; a < n; a++) for (let b = a; b > 0 && py3[order[b]] < py3[order[b - 1]]; b--) [order[b], order[b - 1]] = [order[b - 1], order[b]];
  for (let j = 0; j < n; j++) {
    const i = order[j], rx = g.len * 0.38 * k;
    fe(ctx, 'rgba(40,28,14,0.24)', px3[i], py3[i] + 0.3 * k, rx * (1 - lift3[i] / (8 * k)), rx * 0.32);
    ctx.save();
    ctx.translate(px3[i], py3[i] - lift3[i]);
    ctx.scale(k * (id === 'frog' ? 1 : dir3[i]), k);
    individual(ctx, id, sea, time + i, hash(seed, i + 712) * TAU);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- icons

/** Emblem for a species card, centered at (x, y), fitting a circle of radius r. */
export function drawIcon(ctx: Ctx, x: number, y: number, r: number, id: SpeciesId): void {
  const accent = hexRgb(COLORS[id]);
  ctx.save();
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.35, r * 0.1, x, y, r);
  g.addColorStop(0, css(mix(accent, [250, 244, 228], 0.78)));
  g.addColorStop(1, css(mix(accent, [236, 222, 196], 0.55)));
  fd(ctx, g, x, y, r);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.97, 0, TAU);
  ctx.clip();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const seed = 7, sea = id === 'flowers' ? 0 : 1;
  if (id in GAIT) {
    const a = id as AnimalId;
    if (a === 'bees') {
      const k = r / 9;
      bee(ctx, x - r * 0.3, y + r * 0.2, k * 1.4, 0.2, 0, 1);
      bee(ctx, x + r * 0.35, y - r * 0.25, k * 1.1, 0.25, 1, -1);
      bee(ctx, x + r * 0.15, y + r * 0.45, k * 0.9, 0.3, 2, 1);
    } else {
      // drawing bounds in units: center x, center y, extent
      const [bx, by, ext] = ICON_BOX[a], k = (r * 1.55) / ext, gy = y + (-by * k) + r * 0.04;
      fe(ctx, 'rgba(40,28,14,0.18)', x, gy, GAIT[a].len * 0.4 * k, GAIT[a].len * 0.11 * k);
      ctx.translate(x - bx * k, gy);
      ctx.scale(k, k);
      individual(ctx, a, 1, 0.3, 0);
    }
  } else {
    const p = id as PlantId;
    const cfg: Record<PlantId, [number, number, number]> = {
      lichen: [3, 1.3, 0],
      grass: [2, 1.2, 0.15],
      flowers: [2, 1.2, 0.15],
      shrub: [1, 2.2, -0.05],
      tree: [2, 1.45, -0.05],
      reeds: [2, 1.2, -0.15],
      fungi: [3, 1.6, -0.12],
    };
    const [n, sc, dy] = cfg[p];
    drawPlant(ctx, x, y + dy * r, r * sc, { id: p, n, age: 0 }, sea, seed);
  }
  ctx.restore();
}

function hexRgb(h: string): RGB {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
