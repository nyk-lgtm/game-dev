// Plant shapes: each species grows from a seeded little grammar of stems,
// fronds, blades, bells, caps and pads. A shape is a list of primitives, each
// with the growth span (g0..g1) over which it appears, so one shape draws every
// stage from sprout to full size. Units are CSS px for a front-row plant on a
// 390 px screen; up is −y, the base sits at (0, 0).

import { Rng, mixSeed } from '../../shared/rng';

export type Prim =
  | { k: 'seg'; g0: number; g1: number; g2?: number; x0: number; y0: number; x1: number; y1: number; w: number; c: string }
  | { k: 'leaf'; g0: number; g1: number; g2?: number; x: number; y: number; a: number; l: number; w: number; c: string }
  | { k: 'bell'; g0: number; g1: number; g2?: number; x: number; y: number; s: number; c: string; c2: string }
  | { k: 'cap'; g0: number; g1: number; g2?: number; x: number; y: number; rx: number; ry: number; c: string; c2: string }
  | { k: 'ell'; g0: number; g1: number; g2?: number; x: number; y: number; rx: number; ry: number; a: number; c: string }
  | { k: 'pad'; g0: number; g1: number; g2?: number; x: number; y: number; rx: number; ry: number; n: number; c: string; c2: string };

export interface Pt {
  x: number;
  y: number;
}

export interface Shape {
  prims: Prim[];
  /** Flowers, caps, tips: where notes glow and creatures land (at full size). */
  heads: Pt[];
  /** Glow colour when it sings. */
  glow: string;
  /** Bounds at full size. */
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const range = (r: Rng, a: number, b: number) => a + (b - a) * r.next();

function hsl(h: number, s: number, l: number): string {
  return `hsl(${h.toFixed(0)} ${s.toFixed(0)}% ${l.toFixed(0)}%)`;
}

function bell(r: Rng): Shape {
  const prims: Prim[] = [];
  const heads: Pt[] = [];
  const hue = r.pick([258, 228, 290, 320, 200]);
  const petal = hsl(hue, 70, 76);
  const inner = hsl(hue, 55, 52);
  const stemC = hsl(r.int(100, 125), 38, 38);
  const leafC = hsl(r.int(105, 130), 42, 42);
  const nl = r.int(3, 5);
  for (let i = 0; i < nl; i++) {
    const a = -Math.PI / 2 + (i / (nl - 1) - 0.5) * 2.4 + range(r, -0.15, 0.15);
    prims.push({ k: 'leaf', g0: 0, g1: 0.3, x: 0, y: -1, a, l: range(r, 13, 20), w: range(r, 3.6, 4.8), c: leafC });
  }
  const stems = r.int(2, 3);
  for (let s = 0; s < stems; s++) {
    const lean = (s - (stems - 1) / 2) * 0.55 + range(r, -0.2, 0.2) + (stems === 1 ? r.pick([-0.4, 0.4]) : 0);
    const h = range(r, 52, 82);
    const p1 = { x: lean * h * 0.3, y: -h };
    const p2 = { x: lean * h * 0.95 + Math.sign(lean || 1) * 6, y: -h * 0.72 };
    const N = 8;
    const at = (t: number): Pt => ({ x: 2 * (1 - t) * t * p1.x + t * t * p2.x, y: 2 * (1 - t) * t * p1.y + t * t * p2.y });
    const gs = 0.05 + s * 0.06;
    for (let i = 0; i < N; i++) {
      const a = at(i / N), b = at((i + 1) / N);
      const g0 = gs + (0.5 * i) / N;
      prims.push({ k: 'seg', g0, g1: g0 + 0.5 / N + 0.03, x0: a.x, y0: a.y, x1: b.x, y1: b.y, w: lerp(2.3, 1, i / N), c: stemC });
    }
    const ts = [1, 0.82, 0.64].slice(0, r.int(2, 3));
    for (const t of ts) {
      const p = at(t);
      const dir = Math.sign(p2.x - p1.x) || 1;
      const q = { x: p.x + dir * 3, y: p.y + 5 };
      const g0 = 0.45 + 0.35 * t;
      prims.push({ k: 'seg', g0, g1: g0 + 0.08, x0: p.x, y0: p.y, x1: q.x, y1: q.y, w: 0.9, c: stemC });
      prims.push({ k: 'bell', g0: g0 + 0.04, g1: Math.min(1, g0 + 0.2), x: q.x, y: q.y, s: range(r, 6, 8.5), c: petal, c2: inner });
      heads.push({ x: q.x, y: q.y + 6 });
    }
  }
  return finish(prims, heads, hsl(hue, 90, 80));
}

function fern(r: Rng): Shape {
  const prims: Prim[] = [];
  const heads: Pt[] = [];
  const hue = r.int(100, 135);
  const spineC = hsl(hue, 40, 33);
  const n = r.int(4, 6);
  for (let f = 0; f < n; f++) {
    const u = n === 1 ? 0 : f / (n - 1) - 0.5;
    let ang = -Math.PI / 2 + u * 2 + range(r, -0.12, 0.12);
    const len = range(r, 44, 66) * (1 - Math.abs(u) * 0.45);
    const curl = (u < 0 ? -1 : 1) * range(r, 0.05, 0.1);
    const N = 10;
    let x = 0, y = 0;
    const gs = 0.02 + (Math.abs(u) < 0.2 ? 0 : 0.12);
    const leafC = hsl(hue + range(r, -8, 8), 48, range(r, 40, 50));
    for (let i = 0; i < N; i++) {
      const step = len / N;
      const nx = x + Math.cos(ang) * step, ny = y + Math.sin(ang) * step;
      const g0 = gs + (0.55 * i) / N;
      prims.push({ k: 'seg', g0, g1: g0 + 0.09, x0: x, y0: y, x1: nx, y1: ny, w: lerp(1.8, 0.6, i / N), c: spineC });
      if (i >= 1) {
        const l = (1 - i / N) * 11 + 3;
        for (const side of [-1, 1]) {
          prims.push({ k: 'leaf', g0: g0 + 0.1, g1: Math.min(1, g0 + 0.32), x: nx, y: ny, a: ang + side * 1.15, l, w: l * 0.3, c: leafC });
        }
      }
      x = nx;
      y = ny;
      ang += curl * (1 + i * 0.15);
    }
    heads.push({ x, y });
  }
  return finish(prims, heads, '#c8ff9a');
}

function reed(r: Rng): Shape {
  const prims: Prim[] = [];
  const heads: Pt[] = [];
  const n = r.int(5, 7);
  for (let b = 0; b < n; b++) {
    const bx = range(r, -6, 6);
    const h = range(r, 50, 92);
    const lean = range(r, -0.3, 0.3);
    const c = hsl(r.int(70, 105), 40, range(r, 36, 48));
    const N = 4;
    let x = bx, y = 0;
    const g0s = 0.04 * b;
    for (let i = 0; i < N; i++) {
      const t = (i + 1) / N;
      const nx = bx + lean * h * t * t, ny = -h * t;
      const g0 = g0s + (0.6 * i) / N;
      prims.push({ k: 'seg', g0, g1: g0 + 0.18, x0: x, y0: y, x1: nx, y1: ny, w: lerp(3.4, 0.7, i / (N - 1)), c });
      x = nx;
      y = ny;
    }
  }
  const tails = r.int(1, 2);
  for (let t = 0; t < tails; t++) {
    const h = range(r, 78, 104);
    const x = range(r, -5, 5);
    const top = { x: x + range(r, -4, 4), y: -h };
    prims.push({ k: 'seg', g0: 0.3, g1: 0.8, x0: x, y0: 0, x1: top.x, y1: top.y, w: 1.4, c: hsl(80, 30, 36) });
    prims.push({ k: 'ell', g0: 0.72, g1: 1, x: top.x, y: top.y + 12, rx: 3.4, ry: 10, a: 0, c: hsl(r.int(18, 28), 45, 30) });
    prims.push({ k: 'seg', g0: 0.8, g1: 1, x0: top.x, y0: top.y + 2, x1: top.x, y1: top.y - 7, w: 0.8, c: hsl(40, 30, 50) });
    heads.push({ x: top.x, y: top.y + 10 });
  }
  return finish(prims, heads, '#ffe0a0');
}

function lily(r: Rng): Shape {
  const prims: Prim[] = [];
  const pads = r.int(2, 3);
  const padC = hsl(r.int(110, 150), 40, 36);
  const padC2 = hsl(r.int(110, 150), 45, 48);
  for (let i = 0; i < pads; i++) {
    const a = (i / pads) * TAU + range(r, 0, 1);
    const rx = range(r, 13, 18);
    prims.push({ k: 'pad', g0: i * 0.1, g1: 0.35 + i * 0.1, x: Math.cos(a) * 17, y: Math.sin(a) * 4.5, rx, ry: rx * 0.36, n: range(r, 0, TAU), c: padC, c2: padC2 });
  }
  const hue = r.pick([330, 45, 200, 280, 0]);
  const outer = hsl(hue, 70, 86);
  const innerC = hsl(hue, 80, 74);
  const np = 7;
  for (let i = 0; i < np; i++) {
    const a = -Math.PI / 2 + (i / (np - 1) - 0.5) * 2.6;
    prims.push({ k: 'leaf', g0: 0.5, g1: 0.85, x: 0, y: -2, a, l: 12, w: 3.8, c: outer });
  }
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i / 4 - 0.5) * 1.5;
    prims.push({ k: 'leaf', g0: 0.65, g1: 1, x: 0, y: -2, a, l: 9, w: 3, c: innerC });
  }
  prims.push({ k: 'ell', g0: 0.8, g1: 1, x: 0, y: -4, rx: 2.6, ry: 1.8, a: 0, c: '#ffe27a' });
  return finish(prims, [{ x: 0, y: -8 }], hsl(hue, 90, 85));
}

function cap(r: Rng): Shape {
  const prims: Prim[] = [];
  const heads: Pt[] = [];
  const n = r.int(2, 4);
  const hue = r.pick([175, 190, 270, 300, 150]);
  const order = Array.from({ length: n }, (_, i) => i);
  for (const i of order) {
    const big = i === 0;
    const x = big ? range(r, -2, 2) : range(r, -13, 13);
    const h = big ? range(r, 18, 26) : range(r, 7, 15);
    const rx = big ? range(r, 9, 12) : range(r, 5, 8);
    const ry = rx * range(r, 0.55, 0.75);
    const lean = range(r, -0.2, 0.2);
    const g0 = big ? 0 : 0.15 + i * 0.12;
    const top = { x: x + lean * h, y: -h };
    prims.push({ k: 'seg', g0, g1: g0 + 0.4, x0: x, y0: 0, x1: top.x, y1: top.y, w: rx * 0.42, c: '#e8e2d0' });
    prims.push({ k: 'cap', g0: g0 + 0.1, g1: Math.min(1, g0 + 0.55), x: top.x, y: top.y, rx, ry, c: hsl(hue + range(r, -10, 10), 55, 52), c2: hsl(hue, 70, 78) });
    for (let d = 0; d < 3; d++) {
      const a = range(r, -2.6, -0.5);
      prims.push({ k: 'ell', g0: g0 + 0.4, g1: Math.min(1, g0 + 0.6), x: top.x + Math.cos(a) * rx * 0.6, y: top.y + Math.sin(a) * ry * 0.6, rx: rx * 0.12, ry: rx * 0.1, a: 0, c: 'rgba(255,255,255,0.75)' });
    }
    heads.push({ x: top.x, y: top.y - ry * 0.4 });
  }
  return finish(prims, heads, hsl(hue, 100, 70));
}

function willow(r: Rng): Shape {
  const prims: Prim[] = [];
  const heads: Pt[] = [];
  const bark = hsl(r.int(20, 32), 25, 30);
  const leafHue = r.int(85, 130);
  const blossom = r.pick(['#ffc6dc', '#fff0c0', '#e6d4ff']);
  const maxD = 3;
  // The trunk starts a little late: first a green sapling (below) that fades as the trunk takes over.
  const span = [0.1, 0.3, 0.48, 0.66, 0.84];
  const branch = (x: number, y: number, ang: number, len: number, w: number, d: number) => {
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
    const g1 = span[d + 1] + 0.04;
    prims.push({ k: 'seg', g0: span[d], g1, x0: x, y0: y, x1, y1, w, c: bark });
    // Leaves along the trunk and lower branches, so a young willow is a leafy sapling, not a bare stick.
    if (d <= 2) {
      const lc = hsl(leafHue + 10, 45, 50);
      const marks = d === 0 ? [0.3, 0.55, 0.8, 1] : [0.6, 1];
      marks.forEach((t, i) => {
        const lx = x + (x1 - x) * t, ly = y + (y1 - y) * t;
        const gl = span[d] + (g1 - span[d]) * t;
        const side = i % 2 ? 1 : -1;
        prims.push({ k: 'leaf', g0: gl, g1: Math.min(1, gl + 0.1), x: lx, y: ly, a: ang + side * 1.0, l: d === 0 ? 9 : 7, w: d === 0 ? 3 : 2.4, c: lc });
      });
    }
    if (d === maxD) {
      heads.push({ x: x1, y: y1 });
      const strands = r.int(2, 4);
      for (let s = 0; s < strands; s++) {
        let sx = x1 + range(r, -4, 4), sy = y1 + range(r, -2, 2);
        const L = range(r, 14, 30);
        const drift = range(r, -0.25, 0.25) + Math.cos(ang) * 0.3;
        const lc = hsl(leafHue + range(r, -10, 10), 40, range(r, 44, 58));
        const N = 4;
        for (let i = 0; i < N; i++) {
          const nx = sx + drift * (L / N), ny = sy + L / N;
          const g0 = 0.78 + (0.18 * i) / N;
          prims.push({ k: 'seg', g0, g1: g0 + 0.08, x0: sx, y0: sy, x1: nx, y1: ny, w: 0.7, c: lc });
          prims.push({ k: 'leaf', g0: g0 + 0.02, g1: Math.min(1, g0 + 0.12), x: nx, y: ny, a: Math.PI / 2 + (i % 2 ? 0.55 : -0.55), l: 5.5, w: 1.8, c: lc });
          sx = nx;
          sy = ny;
        }
        if (r.next() < 0.35) prims.push({ k: 'ell', g0: 0.9, g1: 1, x: sx, y: sy + 1, rx: 1.8, ry: 1.8, a: 0, c: blossom });
      }
      return;
    }
    const k = d === 0 ? 3 : r.int(2, 3);
    for (let i = 0; i < k; i++) {
      const spread = (i / (k - 1) - 0.5) * range(r, 1.1, 1.5);
      branch(x1, y1, ang + spread + range(r, -0.12, 0.12), len * range(r, 0.62, 0.78), w * 0.62, d + 1);
    }
  };
  // A young willow is a green sapling with a leafy top; it gives way to the trunk and branches.
  const sap = hsl(leafHue, 50, 46), sapLeaf = hsl(leafHue + 8, 55, 56);
  prims.push({ k: 'seg', g0: 0, g1: 0.16, g2: 0.36, x0: 0, y0: 0, x1: 1, y1: -26, w: 2.2, c: sap });
  [0.35, 0.6, 0.85, 1].forEach((t, i) => {
    const gl = 0.02 + 0.14 * t;
    for (const side of i === 3 ? [-1, 0, 1] : [i % 2 ? 1 : -1]) {
      prims.push({ k: 'leaf', g0: gl, g1: gl + 0.08, g2: 0.4, x: t, y: -26 * t, a: -Math.PI / 2 + side * 0.9, l: i === 3 ? 11 : 10, w: 3.6, c: sapLeaf });
    }
  });
  branch(0, 0, -Math.PI / 2 + range(r, -0.08, 0.08), range(r, 34, 42), 5.5, 0);
  // Keep a few heads (spread out) for glows and landings.
  const keep = heads.filter((_, i) => i % Math.max(1, Math.floor(heads.length / 4)) === 0).slice(0, 4);
  return finish(prims, keep, '#e9ffd0');
}

function finish(prims: Prim[], heads: Pt[], glow: string): Shape {
  // Room for the seedling's two leaves too.
  let minX = -11, maxX = 11, minY = -12, maxY = 2;
  const add = (x: number, y: number, pad: number) => {
    minX = Math.min(minX, x - pad);
    maxX = Math.max(maxX, x + pad);
    minY = Math.min(minY, y - pad);
    maxY = Math.max(maxY, y + pad);
  };
  for (const p of prims) {
    if (p.k === 'seg') {
      add(p.x0, p.y0, p.w);
      add(p.x1, p.y1, p.w);
    } else if (p.k === 'leaf') add(p.x + Math.cos(p.a) * p.l, p.y + Math.sin(p.a) * p.l, p.w + 2);
    else if (p.k === 'bell') add(p.x, p.y + p.s, p.s * 1.6);
    else if (p.k === 'cap' || p.k === 'pad') add(p.x, p.y, p.rx + 2);
    else add(p.x, p.y, Math.max(p.rx, p.ry) + 1);
  }
  return { prims, heads, glow, minX, maxX, minY, maxY };
}

const MAKERS = [bell, fern, reed, lily, cap, willow];

export function makeShape(seed: number, sp: number, x: number, y: number): Shape {
  return MAKERS[sp](new Rng(mixSeed(mixSeed(seed, sp + 1), x * 64 + y)));
}

/** A plant's overall size at a growth stage (sprouts start small). */
export const sizeAt = (g: number): number => 0.5 + 0.5 * Math.min(1, g);
/** Growth as drawn: sprouts shoot up quickly, then fill out. */
export const showGrowth = (g: number): number => (g >= 1 ? 1 : 1 - (1 - Math.max(0, g)) ** 1.8);

/** Draws a shape at growth g into ctx (origin at the base, scaled already). `sleep` folds the bells. */
export function drawShape(ctx: CanvasRenderingContext2D, sh: Shape, g: number, sleep = false): void {
  ctx.lineCap = 'round';
  for (const p of sh.prims) {
    const t = p.g1 <= p.g0 ? (g >= p.g0 ? 1 : 0) : Math.max(0, Math.min(1, (g - p.g0) / (p.g1 - p.g0)));
    if (t <= 0 || (p.g2 !== undefined && g >= p.g2)) continue;
    const e = 1 - (1 - t) * (1 - t);
    switch (p.k) {
      case 'seg':
        ctx.strokeStyle = p.c;
        ctx.lineWidth = p.w;
        ctx.beginPath();
        ctx.moveTo(p.x0, p.y0);
        ctx.lineTo(lerp(p.x0, p.x1, t), lerp(p.y0, p.y1, t));
        ctx.stroke();
        break;
      case 'leaf': {
        const l = p.l * e, w = p.w * e;
        const ca = Math.cos(p.a), sa = Math.sin(p.a);
        const tx = p.x + ca * l, ty = p.y + sa * l;
        const mx = p.x + ca * l * 0.5, my = p.y + sa * l * 0.5;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(mx - sa * w * 1.4, my + ca * w * 1.4, tx, ty);
        ctx.quadraticCurveTo(mx + sa * w * 1.4, my - ca * w * 1.4, p.x, p.y);
        ctx.fill();
        break;
      }
      case 'bell': {
        const s = p.s * e;
        const mouth = sleep ? 0.45 : 1;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.moveTo(p.x - s * 0.28, p.y);
        ctx.quadraticCurveTo(p.x - s * 0.55, p.y + s * 0.9, p.x - s * 0.75 * mouth - s * 0.1, p.y + s * 1.35);
        ctx.lineTo(p.x + s * 0.75 * mouth + s * 0.1, p.y + s * 1.35);
        ctx.quadraticCurveTo(p.x + s * 0.55, p.y + s * 0.9, p.x + s * 0.28, p.y);
        ctx.closePath();
        ctx.fill();
        if (!sleep) {
          ctx.fillStyle = p.c2;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y + s * 1.33, s * 0.78, s * 0.2, 0, 0, TAU);
          ctx.fill();
        }
        break;
      }
      case 'cap': {
        const rx = p.rx * e, ry = p.ry * e;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rx, ry, 0, Math.PI, TAU);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = p.c2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y + 0.5, rx * 0.92, ry * 0.18, 0, 0, TAU);
        ctx.fill();
        break;
      }
      case 'ell':
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, Math.max(0.1, p.rx * e), Math.max(0.1, p.ry * e), p.a, 0, TAU);
        ctx.fill();
        break;
      case 'pad': {
        const rx = p.rx * e, ry = p.ry * e;
        ctx.fillStyle = p.c;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, rx, ry, 0, p.n + 0.35, p.n + TAU - 0.35);
        ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = p.c2;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y - ry * 0.15, rx * 0.8, ry * 0.6, 0, p.n + 0.4, p.n + TAU - 0.4);
        ctx.lineTo(p.x, p.y);
        ctx.closePath();
        ctx.fill();
        break;
      }
    }
  }
}
