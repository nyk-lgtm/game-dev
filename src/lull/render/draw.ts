// Lull's scene: sky (time of day, sun, moon, stars, clouds), cached hills and
// meadow with the pond, plants as cached sprites (re-drawn only when they grow
// a notch) swayed with a cheap skew, creatures, glows, rain and mist.
// The canvas DPR is capped at 2; per frame it is mostly drawImage calls.

import {
  COLS, LANES, ROWS, SPECIES, XS, dayTime, growth, type CritterPos, type Garden, type Plant, type Weather,
} from '../core';
import { Rng, mixSeed } from '../../shared/rng';
import { drawShape, makeShape, showGrowth, sizeAt, type Shape } from './flora';

/** Growth as drawn: sprouts shoot up quickly, then fill out. */
const vg = (p: Plant, step: number) => showGrowth(growth(p, step));

const TAU = Math.PI * 2;

export interface Layout {
  W: number;
  H: number;
  dpr: number;
  /** CSS px per design px (1 at 390 wide). */
  u: number;
  horizon: number;
  top: number;
  bot: number;
  padX: number;
}

interface Sprite {
  shape: Shape;
  cv: HTMLCanvasElement | null;
  gq: number;
  sleep: boolean;
  /** The light it was shaded for. */
  tone: string;
  /** Origin (the plant's base) inside the sprite, CSS px. */
  ox: number;
  oy: number;
  w: number;
  h: number;
  phase: number;
  kick: number;
  flash: number;
  /** A quick swell when it sings (0..1). */
  pop: number;
  /** Shadow half-width in plant units. */
  shadow: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  kind: 'dirt' | 'drop' | 'spark' | 'ring' | 'leaf';
  c: string;
  r: number;
}

export interface Ghost {
  sp: number;
  x: number;
  y: number;
  ok: boolean;
  label: string;
}

export interface Frame {
  g: Garden;
  /** The garden clock, fractional steps. */
  step: number;
  /** Seconds, for animation. */
  time: number;
  dt: number;
  weather: Weather;
  critters: CritterPos[];
  ghost: Ghost | null;
  /** Finger position for the watering can / strum (CSS px). */
  tool: { kind: 'water' | 'strum'; x: number; y: number } | null;
  reduced: boolean;
}

type RGB = [number, number, number];
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

const SKY = {
  night: [hex('#060920'), hex('#1a2152')] as RGB[],
  day: [hex('#5fb0e6'), hex('#d4f0ee')] as RGB[],
  warm: [hex('#3b3a7c'), hex('#ffa274')] as RGB[],
  grey: [hex('#59667a'), hex('#a9b4bd')] as RGB[],
};

const NIGHT_RGB: RGB = [10, 16, 48];
const plantKey = (p: Plant) => `${p.sp}.${p.x}.${p.y}`;

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export class Scene {
  L: Layout = { W: 1, H: 1, dpr: 1, u: 1, horizon: 0, top: 0, bot: 1, padX: 0 };
  private ctx: CanvasRenderingContext2D;
  private sprites = new Map<string, Sprite>();
  private ground: HTMLCanvasElement | null = null;
  private hills: HTMLCanvasElement | null = null;
  private stars: HTMLCanvasElement | null = null;
  private cloud: HTMLCanvasElement | null = null;
  private band: HTMLCanvasElement | null = null;
  private beatBand: HTMLCanvasElement | null = null;
  private mist: HTMLCanvasElement | null = null;
  private glows = new Map<string, HTMLCanvasElement>();
  private pondPath: Path2D | null = null;
  private pondRect: { x0: number; x1: number; y0: number; y1: number } | null = null;
  private pondSeed = -1;
  private parts: Particle[] = [];
  private seed = -1;
  /** Render stats for the perf probe. */
  stats = { sprites: 0, redraws: 0 };

  /** Device px per CSS px is capped at 2, and lowered if frames run slow (see `slower`). */
  quality = 1;

  /** `cv` is the live layer (transparent), `back` the slow layer under it (sky, hills, meadow). */
  constructor(private cv: HTMLCanvasElement, private back: HTMLCanvasElement) {
    this.ctx = cv.getContext('2d')!;
  }

  resize(cssW: number, cssH: number): void {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1) * this.quality);
    this.cv.width = this.back.width = Math.round(cssW * dpr);
    this.cv.height = this.back.height = Math.round(cssH * dpr);
    this.landKey = '';
    const u = Math.min(cssW / 390, cssH / 560);
    // The meadow gets most of a short screen (360×640 leaves ~430 px of stage); the sky shrinks first.
    const top = Math.round(cssH * (cssH < 480 ? 0.33 : cssH < 640 ? 0.4 : 0.44));
    this.L = { W: cssW, H: cssH, dpr, u, horizon: top - 36 * u, top, bot: cssH - 12 * u, padX: 22 * u };
    this.ground = this.hills = this.stars = this.cloud = this.band = this.beatBand = this.mist = null;
    this.shades.clear();
    this.glows.clear();
    for (const s of this.sprites.values()) s.cv = null;
    this.pondSeed = -1;
  }

  /** Frames have been fast for a while: draw at more device pixels again (true if it could). */
  faster(): boolean {
    if (this.quality >= 1) return false;
    this.quality = Math.min(1, this.quality + 0.25);
    this.resize(this.L.W, this.L.H);
    return true;
  }

  /** Frames are slow: draw at fewer device pixels (true if it could). */
  slower(): boolean {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (dpr * this.quality <= 1.01) return false;
    this.quality = Math.max(1 / dpr, this.quality - 0.25);
    this.resize(this.L.W, this.L.H);
    return true;
  }

  // ------------------------------------------------------------ geometry

  /** Screen position and scale of a garden point. */
  pos(x: number, y: number): { sx: number; sy: number; s: number } {
    const L = this.L;
    const d = (y + 0.5) / ROWS;
    return { sx: L.padX + ((x + 0.5) / XS) * (L.W - 2 * L.padX), sy: L.top + d * (L.bot - L.top), s: (0.6 + 0.4 * d) * L.u };
  }

  /** Garden point under a screen point (null above the meadow). */
  unpos(sx: number, sy: number): { x: number; y: number } | null {
    const L = this.L;
    if (sy < L.top - 6 || sy > L.H) return null;
    const x = Math.round(((sx - L.padX) / (L.W - 2 * L.padX)) * XS - 0.5);
    const y = Math.floor(((sy - L.top) / (L.bot - L.top)) * ROWS);
    return { x: Math.max(0, Math.min(XS - 1, x)), y: Math.max(0, Math.min(ROWS - 1, y)) };
  }

  private sprite(g: Garden, p: Plant): Sprite {
    if (this.seed !== g.seed) {
      this.sprites.clear();
      this.seed = g.seed;
    }
    const k = plantKey(p);
    let s = this.sprites.get(k);
    if (!s) {
      const shape = makeShape(g.seed, p.sp, p.x, p.y);
      s = { shape, cv: null, gq: -1, sleep: false, tone: '', ox: 0, oy: 0, w: 0, h: 0, phase: (mixSeed(p.x, p.y) % 1000) / 159, kick: 0, flash: 0, pop: 0, shadow: p.sp === 5 ? 22 : 10 };
      this.sprites.set(k, s);
    }
    return s;
  }

  /** Forget sprites of plants that are gone. */
  prune(g: Garden): void {
    const live = new Set(g.plants.map(plantKey));
    for (const k of this.sprites.keys()) if (!live.has(k)) this.sprites.delete(k);
  }

  /** Where plant i's head n is on screen right now (for creatures and glows). */
  head(g: Garden, i: number, n: number, step: number, time: number): { x: number; y: number; s: number } {
    const p = g.plants[i];
    const { sx, sy, s } = this.pos(p.x, p.y);
    const sp = this.sprite(g, p);
    const hs = sp.shape.heads;
    const h = hs.length ? hs[n % hs.length] : { x: 0, y: -10 };
    const k = s * sizeAt(vg(p, step));
    const sk = this.skew(sp, p, time, 0);
    const { f, dx } = this.fit(sp.shape, sx, k);
    const pk = 1 + 0.1 * sp.pop;
    return { x: sx + dx + (h.x * k * f + sk * h.y * k) * pk, y: sy + h.y * k * pk + (p.sp === 3 ? this.bob(sp, time) : 0), s };
  }

  /** Keeps a plant drawn inside the meadow: narrows it (to 60%) and then nudges it in. */
  private fit(sh: Shape, sx: number, k: number): { f: number; dx: number } {
    // Clear of the beat chips at both edges.
    const lo = this.edge(), hi = this.L.W - this.edge();
    const left = -sh.minX * k, right = sh.maxX * k;
    let f = 1;
    if (sx - left < lo) f = Math.min(f, (sx - lo) / left);
    if (sx + right > hi) f = Math.min(f, (hi - sx) / right);
    f = Math.max(0.6, Math.min(1, f));
    let dx = 0;
    if (sx - left * f < lo) dx = lo - (sx - left * f);
    else if (sx + right * f > hi) dx = hi - (sx + right * f);
    return { f, dx };
  }

  /**
   * Draws a plant sprite swayed by `skew`. A sheared drawImage is the slowest path for a software
   * canvas (profiled: ~17 fps of 50 under CPU ×4 with 30 plants), so the sprite goes out in
   * horizontal strips, each only shifted (snapped to device pixels): a plain, fast blit. Strips are
   * ~12 px tall, so the steps are at most a pixel or two even mid-strum.
   */
  private blitSwayed(sp: Sprite, x: number, y: number, skew: number, fx: number, pk: number): void {
    const c = this.ctx;
    const { dpr, u } = this.L;
    const cv = sp.cv!;
    const sxs = dpr * fx * pk, sys = dpr * pk;
    const snap = (v: number) => Math.round(v * dpr) / dpr;
    if (Math.abs(skew * sp.oy) < 0.5 / dpr) {
      c.setTransform(sxs, 0, 0, sys, snap(x) * dpr, snap(y) * dpr);
      c.drawImage(cv, -sp.ox, -sp.oy, sp.w, sp.h);
    } else {
      const strip = 12 * u;
      const n = Math.max(1, Math.ceil(sp.oy / strip));
      const k = cv.height / sp.h;
      for (let j = 0; j <= n; j++) {
        // Strip j covers sprite rows [y0, y1] (CSS px from the sprite's top); the last strip is below the base.
        const y0 = j === n ? sp.oy : Math.max(0, sp.oy - (n - j) * strip);
        const y1 = j === n ? sp.h : sp.oy - (n - j - 1) * strip;
        if (y1 - y0 < 0.5) continue;
        const mid = (y0 + y1) / 2 - sp.oy;
        const off = skew * mid * pk;
        const r0 = Math.round(y0 * k), r1 = Math.round(y1 * k);
        if (r1 <= r0) continue;
        c.setTransform(sxs, 0, 0, sys, snap(x + off) * dpr, snap(y) * dpr);
        c.drawImage(cv, 0, r0, cv.width, r1 - r0, -sp.ox, r0 / k - sp.oy, sp.w, (r1 - r0) / k);
      }
    }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Width kept clear at each side of the meadow for the beat chips. */
  edge(): number {
    return 2 * Math.max(7.5, Math.max(11, Math.round(11 * this.L.u)) * 0.68) + 4;
  }

  /** Where a plant's base is drawn (after `fit`). */
  baseX(g: Garden, i: number): number {
    const p = g.plants[i];
    const { sx, s } = this.pos(p.x, p.y);
    const sp = this.sprite(g, p);
    return sx + this.fit(sp.shape, sx, s * sizeAt(vg(p, g.now))).dx;
  }

  private wind = 0;
  private skew(sp: Sprite, p: Plant, time: number, extra: number): number {
    if (p.sp === 3) return 0;
    const base = Math.sin(time * 1.1 + sp.phase) * (0.025 + this.wind * 0.09) + Math.sin(time * 2.3 + sp.phase * 2) * 0.01;
    return base + sp.kick * Math.sin(time * 9 + sp.phase) + extra;
  }

  private bob(sp: Sprite, time: number): number {
    return Math.sin(time * 1.4 + sp.phase) * 1.2 * this.L.u;
  }

  /** The plant drawn at a screen point (front-most first), or -1. */
  plantAt(g: Garden, sx: number, sy: number): number {
    let best = -1;
    let bestY = -Infinity;
    g.plants.forEach((p, i) => {
      const { sx: bx, sy: by, s } = this.pos(p.x, p.y);
      const sh = this.sprite(g, p).shape;
      const k = s * sizeAt(vg(p, g.now));
      const x0 = bx + Math.min(sh.minX * k, -14 * s), x1 = bx + Math.max(sh.maxX * k, 14 * s);
      const y0 = by + Math.min(sh.minY * k * 0.9, -20 * s), y1 = by + Math.max(8 * s, sh.maxY * k);
      if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1 && by > bestY) {
        best = i;
        bestY = by;
      }
    });
    return best;
  }

  // ------------------------------------------------------------ effects

  flash(g: Garden, i: number, v: number): void {
    const p = g.plants[i];
    if (!p) return;
    const s = this.sprite(g, p);
    s.flash = Math.min(1.2, Math.max(s.flash, v));
    s.pop = Math.min(1, Math.max(s.pop, v));
  }

  /** The strum trail: recent finger points (CSS px, seconds). */
  private trail: { x: number; y: number; t: number }[] = [];
  addTrail(x: number, y: number, t: number): void {
    this.trail.push({ x, y, t });
    if (this.trail.length > 40) this.trail.shift();
  }

  kick(g: Garden, i: number, v: number): void {
    const p = g.plants[i];
    if (!p) return;
    const s = this.sprite(g, p);
    s.kick = Math.min(0.14, s.kick + v);
  }

  burst(kind: Particle['kind'], x: number, y: number, n: number, c: string): void {
    const u = this.L.u;
    for (let i = 0; i < n && this.parts.length < 160; i++) {
      const a = Math.random() * TAU;
      const sp = Math.random();
      const p: Particle = { x, y, vx: 0, vy: 0, life: 0, max: 0.8, kind, c, r: 2 * u };
      if (kind === 'dirt') {
        p.vx = Math.cos(a) * 40 * sp * u;
        p.vy = -60 * u * (0.4 + sp);
        p.max = 0.6;
        p.r = (1 + sp * 1.6) * u;
      } else if (kind === 'drop') {
        p.x += (Math.random() - 0.5) * 30 * u;
        p.y += (Math.random() - 0.5) * 10 * u;
        p.vy = 120 * u;
        p.max = 0.45;
        p.r = 1.6 * u;
      } else if (kind === 'spark') {
        p.vx = (Math.random() - 0.5) * 18 * u;
        p.vy = -(20 + 30 * sp) * u;
        p.max = 1.1 + sp * 0.6;
        p.r = (1.2 + sp) * u;
      } else if (kind === 'ring') {
        p.max = 0.9;
        p.r = 4 * u;
      } else {
        p.vx = (Math.random() - 0.3) * 60 * u;
        p.vy = -30 * u * sp;
        p.max = 1.2;
        p.r = 2.2 * u;
      }
      this.parts.push(p);
    }
  }

  // ------------------------------------------------------------ caches

  private glow(c: string): HTMLCanvasElement {
    let g = this.glows.get(c);
    if (!g) {
      const R = 64;
      g = canvas(R * 2, R * 2);
      const x = g.getContext('2d')!;
      const gr = x.createRadialGradient(R, R, 0, R, R, R);
      gr.addColorStop(0, 'rgba(255,255,255,0.95)');
      gr.addColorStop(0.18, c);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, R * 2, R * 2);
      // Fade the colour stop's own alpha out toward the rim.
      x.globalCompositeOperation = 'destination-in';
      const fade = x.createRadialGradient(R, R, 0, R, R, R);
      fade.addColorStop(0, 'rgba(0,0,0,1)');
      fade.addColorStop(0.45, 'rgba(0,0,0,0.35)');
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = fade;
      x.fillRect(0, 0, R * 2, R * 2);
      this.glows.set(c, g);
    }
    return g;
  }

  private buildStatic(g: Garden): void {
    const { W, H, dpr, u, horizon, top, bot } = this.L;
    const r = new Rng(mixSeed(g.seed, 0x5ce));
    // Stars.
    this.stars = canvas(W * dpr, top * dpr);
    let x = this.stars.getContext('2d')!;
    x.scale(dpr, dpr);
    for (let i = 0; i < 110; i++) {
      const sx = r.next() * W, sy = r.next() * horizon;
      const b = r.next();
      x.fillStyle = `rgba(235,240,255,${0.35 + b * 0.6})`;
      x.beginPath();
      x.arc(sx, sy, (0.5 + b * b * 1.2) * Math.min(1.4, u), 0, TAU);
      x.fill();
    }
    // Hills: a far blue ridge and a near green one.
    this.hills = canvas(W * dpr, (top + 4) * dpr);
    x = this.hills.getContext('2d')!;
    x.scale(dpr, dpr);
    const ridge = (base: number, amp: number, c1: string, c2: string, bumps: number) => {
      const ph = [r.next() * TAU, r.next() * TAU, r.next() * TAU];
      x.beginPath();
      x.moveTo(0, top + 4);
      for (let i = 0; i <= 48; i++) {
        const t = i / 48;
        const y = base - amp * (0.55 + 0.25 * Math.sin(t * bumps + ph[0]) + 0.15 * Math.sin(t * bumps * 2.3 + ph[1]) + 0.08 * Math.sin(t * 13 + ph[2]));
        x.lineTo(t * W, y);
      }
      x.lineTo(W, top + 4);
      x.closePath();
      const gr = x.createLinearGradient(0, base - amp, 0, top);
      gr.addColorStop(0, c1);
      gr.addColorStop(1, c2);
      x.fillStyle = gr;
      x.fill();
    };
    ridge(horizon + 6 * u, 46 * u, '#7d97b8', '#9fb7c6', 5);
    ridge(top + 2, 34 * u, '#5d8c6a', '#6f9c70', 7);
    // Meadow: lane bands, tufts, pebbles, the pond, a soil lip at the front.
    this.ground = canvas(W * dpr, (H - top + 30 * u) * dpr);
    x = this.ground.getContext('2d')!;
    x.scale(dpr, dpr);
    x.translate(0, -top + 30 * u);
    const gg = x.createLinearGradient(0, top, 0, H);
    gg.addColorStop(0, '#6a9a5e');
    gg.addColorStop(1, '#4f8a4a');
    x.fillStyle = gg;
    x.fillRect(0, top - 2, W, H - top + 2);
    for (let l = 0; l < LANES; l++) {
      const y0 = top + (l / LANES) * (bot - top), y1 = top + ((l + 1) / LANES) * (bot - top);
      x.fillStyle = l % 2 ? 'rgba(255,255,230,0.045)' : 'rgba(20,40,20,0.05)';
      x.fillRect(0, y0, W, y1 - y0);
    }
    // Column dots along the front: where each note starts.
    for (let c = 1; c < COLS; c++) {
      const cx = this.pos((c * XS) / COLS, 0).sx;
      x.fillStyle = 'rgba(255,255,230,0.12)';
      for (let l = 0; l < LANES; l++) {
        const yy = top + ((l + 0.5) / LANES) * (bot - top);
        x.beginPath();
        x.arc(cx, yy, (0.8 + l * 0.12) * u, 0, TAU);
        x.fill();
      }
    }
    for (let i = 0; i < 260; i++) {
      const d = r.next();
      const sx = r.next() * W, sy = top + d * (bot - top);
      const s = (0.6 + 0.4 * d) * u;
      x.strokeStyle = `hsla(${95 + r.int(-12, 18)}, 40%, ${30 + r.int(0, 22)}%, 0.8)`;
      x.lineWidth = 0.9 * s;
      x.beginPath();
      for (let b = 0; b < 3; b++) {
        x.moveTo(sx + b * 1.6 * s, sy);
        x.lineTo(sx + b * 1.6 * s + (r.next() - 0.5) * 4 * s, sy - (3 + r.next() * 5) * s);
      }
      x.stroke();
    }
    for (let i = 0; i < 26; i++) {
      const d = r.next();
      const sx = r.next() * W, sy = top + d * (bot - top);
      const s = (0.6 + 0.4 * d) * u;
      x.fillStyle = `hsl(${r.int(30, 60)}, 10%, ${50 + r.int(0, 20)}%)`;
      x.beginPath();
      x.ellipse(sx, sy, (1.5 + r.next() * 2) * s, (1 + r.next()) * s, 0, 0, TAU);
      x.fill();
    }
    // The pond: shore, water, a lighter rim.
    const path = (scale: number) => {
      const p = new Path2D();
      for (const e of g.pond) {
        const c = this.pos(e.cx, e.cy - 0.5);
        const rx = (e.rx / XS) * (W - 2 * this.L.padX) * scale, ry = (e.ry / ROWS) * (bot - top) * scale;
        p.ellipse(c.sx, c.sy, rx, ry, 0, 0, TAU);
      }
      return p;
    };
    // The shore (where reeds grow): sand with a darker edge, so it reads as its own ground.
    const shore = path(Math.sqrt(1.8));
    x.fillStyle = '#b3a56c';
    x.fill(shore);
    x.save();
    x.clip(shore);
    x.fillStyle = 'rgba(255,245,200,0.18)';
    for (let i = 0; i < 160; i++) x.fillRect(r.next() * W, top + r.next() * (bot - top), 1.2 * u, 1.2 * u);
    x.restore();
    x.strokeStyle = 'rgba(70,58,25,0.45)';
    x.lineWidth = 1.4 * u;
    x.setLineDash([3 * u, 3 * u]);
    x.stroke(shore);
    x.setLineDash([]);
    x.fillStyle = '#c4b47c';
    x.fill(path(1.12));
    const water = path(1);
    const wg = x.createLinearGradient(0, top, 0, bot);
    wg.addColorStop(0, '#2e6a83');
    wg.addColorStop(1, '#4a93a8');
    // A lighter rim along the far edge: fill pale, then the water again a little lower.
    x.fillStyle = 'rgba(200,235,240,0.55)';
    x.fill(water);
    x.save();
    x.clip(water);
    x.translate(0, 1.8 * u);
    x.fillStyle = wg;
    x.fill(water);
    x.restore();
    this.pondPath = water;
    this.pondRect = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const e of g.pond) {
      const c = this.pos(e.cx, e.cy - 0.5);
      const rx = (e.rx / XS) * (W - 2 * this.L.padX), ry = (e.ry / ROWS) * (bot - top);
      this.pondRect.x0 = Math.min(this.pondRect.x0, c.sx - rx);
      this.pondRect.x1 = Math.max(this.pondRect.x1, c.sx + rx);
      this.pondRect.y0 = Math.min(this.pondRect.y0, c.sy - ry);
      this.pondRect.y1 = Math.max(this.pondRect.y1, c.sy + ry);
    }
    this.pondSeed = g.seed;
    // Front lip: the terrarium's soil bed.
    const lip = x.createLinearGradient(0, bot, 0, H);
    lip.addColorStop(0, '#4a3a2a');
    lip.addColorStop(1, '#2a2018');
    x.fillStyle = lip;
    x.beginPath();
    x.moveTo(0, bot + 4 * u);
    for (let i = 0; i <= 30; i++) x.lineTo((i / 30) * W, bot + (4 + 2.5 * Math.sin(i * 1.7 + g.seed)) * u);
    x.lineTo(W, H);
    x.lineTo(0, H);
    x.closePath();
    x.fill();
    // Cloud puff.
    this.cloud = canvas(160 * dpr, 60 * dpr);
    x = this.cloud.getContext('2d')!;
    x.scale(dpr, dpr);
    for (const [cx, cy, rr] of [[40, 38, 18], [64, 28, 22], [92, 32, 20], [116, 40, 15], [78, 42, 18]]) {
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)');
      gr.addColorStop(0.7, 'rgba(255,255,255,0.6)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr;
      x.beginPath();
      x.arc(cx, cy, rr, 0, TAU);
      x.fill();
    }
    // The bar's sweep: a soft band of light across the meadow.
    this.band = canvas(W * dpr, 24 * dpr);
    x = this.band.getContext('2d')!;
    x.scale(dpr, dpr);
    const bg = x.createLinearGradient(0, 0, 0, 24);
    bg.addColorStop(0, 'rgba(255,250,220,0)');
    bg.addColorStop(0.5, 'rgba(255,250,220,0.5)');
    bg.addColorStop(1, 'rgba(255,250,220,0)');
    x.fillStyle = bg;
    x.fillRect(0, 0, W, 24);
  }

  private landKey = '';
  private landAt = -1;

  private renderLand(g: Garden, light: number, warm: number, grey: number, dark: number, sun: { x: number; y: number; fade?: number } | null, moon: { x: number; y: number; fade?: number } | null): void {
    const { W, H, dpr, u, horizon, top } = this.L;
    const c = this.back.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sk = [0, 1].map((i) => mix(mix(mix(SKY.night[i], SKY.day[i], light), SKY.warm[i], warm * 0.8), SKY.grey[i], grey * (0.3 + 0.7 * light)));
    const sg = c.createLinearGradient(0, 0, 0, top);
    sg.addColorStop(0, css(sk[0]));
    sg.addColorStop(1, css(sk[1]));
    c.fillStyle = sg;
    c.fillRect(0, 0, W, top + 2);
    if (light < 0.9) {
      // Stars are gone by the time dawn is a third of the way up.
      c.globalAlpha = Math.max(0, 1 - light / 0.35) * (1 - grey);
      c.drawImage(this.stars!, 0, 0, W, top);
    }
    if (sun) {
      c.globalAlpha = (1 - grey * 0.8) * (sun.fade ?? 1);
      c.drawImage(this.glow(warm > 0.3 ? 'rgba(255,170,90,0.6)' : 'rgba(255,240,170,0.55)'), sun.x - 60 * u, sun.y - 60 * u, 120 * u, 120 * u);
      c.fillStyle = warm > 0.3 ? '#ffd09a' : '#fff6d8';
      c.beginPath();
      c.arc(sun.x, sun.y, 13 * u, 0, TAU);
      c.fill();
    }
    if (moon) {
      c.globalAlpha = (1 - light * 0.7) * (1 - grey * 0.7) * (moon.fade ?? 1);
      c.drawImage(this.glow('rgba(190,210,255,0.5)'), moon.x - 50 * u, moon.y - 50 * u, 100 * u, 100 * u);
      c.fillStyle = '#f4f2e6';
      c.beginPath();
      c.arc(moon.x, moon.y, 10 * u, 0, TAU);
      c.fill();
      c.fillStyle = css(sk[0], 0.85);
      c.beginPath();
      c.arc(moon.x + 4.5 * u, moon.y - 2.5 * u, 9 * u, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
    c.drawImage(this.hills!, 0, 0, W, top + 4);
    c.drawImage(this.ground!, 0, top - 30 * u, W, H - top + 30 * u);
    // The pond mirrors the sky.
    if (this.pondPath) {
      c.globalAlpha = 0.35;
      c.fillStyle = css(sk[0]);
      c.fill(this.pondPath);
    }
    // Dusk and night darken the land (the sky is already coloured); the shade fades out
    // above the hills so it never draws a line across the sky.
    const y0 = horizon - 120 * u;
    if (dark > 0.01) {
      c.globalAlpha = dark;
      c.fillStyle = this.shade(c, '10,16,48', y0, horizon - 40 * u);
      c.fillRect(0, y0, W, H - y0);
    }
    if (warm > 0.05) {
      c.globalAlpha = warm * 0.1;
      c.fillStyle = this.shade(c, '255,120,60', y0, horizon - 40 * u);
      c.fillRect(0, y0, W, H - y0);
    }
    c.globalAlpha = 1;
    this.drawChips(c, -1);
    void g;
  }

  private shades = new Map<string, CanvasGradient>();
  /** A vertical fade-in of a colour (cached per size). */
  private shade(c: CanvasRenderingContext2D, rgb: string, y0: number, y1: number): CanvasGradient {
    const k = `${rgb}|${y0}|${y1}`;
    let gr = this.shades.get(k);
    if (!gr) {
      gr = c.createLinearGradient(0, y0, 0, y1);
      gr.addColorStop(0, `rgba(${rgb},0)`);
      gr.addColorStop(1, `rgba(${rgb},1)`);
      this.shades.set(k, gr);
    }
    return gr;
  }

  private redrawSprite(sp: Sprite, s: number, gq: number, sleep: boolean, tone = ''): void {
    const { dpr } = this.L;
    const sh = sp.shape;
    const w = (sh.maxX - sh.minX) * s + 2, h = (sh.maxY - sh.minY) * s + 2;
    if (!sp.cv || sp.w !== w || sp.h !== h) {
      sp.cv = canvas(w * dpr, h * dpr);
      sp.w = w;
      sp.h = h;
    }
    sp.ox = -sh.minX * s + 1;
    sp.oy = -sh.minY * s + 1;
    const x = sp.cv.getContext('2d')!;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, sp.cv.width, sp.cv.height);
    const k = s * sizeAt(gq);
    x.setTransform(dpr * k, 0, 0, dpr * k, sp.ox * dpr, sp.oy * dpr);
    // The soft shadow lives in the sprite (one fewer path fill per plant per frame).
    x.fillStyle = 'rgba(20,35,20,0.22)';
    x.beginPath();
    x.ellipse(0, 1 / k, sp.shadow, (3 * s) / k, 0, 0, TAU);
    x.fill();
    drawShape(x, sh, gq, sleep);
    // A seedling is a pair of tiny leaves even before its first prims show.
    if (gq < 0.15) {
      x.globalAlpha = 1 - gq / 0.15;
      // Drawn at full size (the sprite is scaled down for sprouts).
      x.scale(1 / sizeAt(gq), 1 / sizeAt(gq));
      x.fillStyle = '#9ad884';
      x.strokeStyle = '#6aa85a';
      x.lineWidth = 1.4;
      x.beginPath();
      x.moveTo(0, 0);
      x.lineTo(0, -7);
      x.stroke();
      for (const d of [-1, 1]) {
        x.beginPath();
        x.ellipse(d * 4.5, -8, 5, 2.4, d * -0.45, 0, TAU);
        x.fill();
      }
      x.globalAlpha = 1;
    }
    // Shade it for the time of day (only its own pixels).
    if (tone) {
      const [dk, wm] = tone.split('|').map(Number);
      x.setTransform(1, 0, 0, 1, 0, 0);
      x.globalCompositeOperation = 'source-atop';
      if (dk > 0) {
        x.fillStyle = `rgba(10,16,48,${dk / 20})`;
        x.fillRect(0, 0, sp.cv.width, sp.cv.height);
      }
      if (wm > 0) {
        x.fillStyle = `rgba(255,120,60,${wm / 100})`;
        x.fillRect(0, 0, sp.cv.width, sp.cv.height);
      }
      x.globalCompositeOperation = 'source-over';
    }
    sp.gq = gq;
    sp.sleep = sleep;
    sp.tone = tone;
    this.stats.redraws++;
  }

  // ------------------------------------------------------------ frame

  draw(f: Frame): void {
    const { g, step, time, dt } = f;
    const L = this.L;
    const { W, H, dpr, u, horizon, top } = L;
    const c = this.ctx;
    if (!this.ground || this.pondSeed !== g.seed) {
      this.buildStatic(g);
      this.landKey = '';
    }
    const dtm = dayTime(step);
    const light = dtm.light;
    const wk = f.weather;
    this.wind = wk.kind === 'breezy' ? wk.amt : wk.kind === 'rain' ? wk.amt * 0.5 : 0;
    const grey = wk.kind === 'rain' ? wk.amt * 0.55 : wk.kind === 'mist' ? wk.amt * 0.35 : 0;
    // Warm light around sunrise and sunset.
    const cyc = (a: number, b: number) => Math.min(Math.abs(a - b), 1 - Math.abs(a - b));
    const warm = Math.max(0, 1 - cyc(dtm.t, 0.555) / 0.075, 1 - cyc(dtm.t, 0.995) / 0.06);
    // Sky, hills, meadow and pond, shaded for the time of day: a cached layer,
    // re-drawn a few times a second at most and only when the light has moved.
    const arc = (t: number, t0: number, t1: number) => {
      const k = (t - t0) / (t1 - t0);
      return { x: W * (0.08 + 0.84 * k), y: horizon - Math.sin(Math.PI * k) * (horizon - 34 * u) };
    };
    // The sun rises at dawn (t 0.97) and sets mid-dusk (t 0.57), fading as it goes down: never up at night.
    const sunT = dtm.t < 0.6 ? dtm.t + 0.03 : dtm.t - 0.97;
    const sun = sunT >= 0 && sunT <= 0.6 ? { ...arc(sunT, 0, 0.6), fade: Math.min(1, (0.6 - sunT) / 0.03) } : null;
    const moonT = dtm.t >= 0.56 ? dtm.t - 0.56 : dtm.t + 0.44;
    // The moon sets as dawn begins (t 0.97), so the sky never shows night while the label says Dawn.
    const moon = moonT <= 0.41 ? { ...arc(moonT, 0, 0.41), fade: Math.min(1, (0.41 - moonT) / 0.03) } : null;
    const dark = (1 - light) * 0.6 + grey * 0.15;
    const key = [light * 40, warm * 20, grey * 20, (sun?.x ?? -9) / 2, (sun?.y ?? 0) / 2, (moon?.x ?? -9) / 2, (moon?.y ?? 0) / 2].map(Math.round).join('|');
    if (!this.landKey || (key !== this.landKey && time - this.landAt > 0.4) || Math.abs(time - this.landAt) > 30) {
      this.renderLand(g, light, warm, grey, dark, sun, moon);
      this.landKey = key;
      this.landAt = time;
    }
    // The live layer is transparent: clearing it is far cheaper than blending a full picture.
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.cv.width, this.cv.height);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Clouds drift (drawn every frame, they're small); more and greyer in rain and mist.
    const nClouds = 3 + Math.round(grey * 5);
    for (let i = 0; i < nClouds; i++) {
      const sp = 4 + (i % 3) * 2.5;
      const cw = (140 + (i % 2) * 60) * u;
      const cx = ((time * sp * u + i * 197 * u) % (W + cw * 1.5)) - cw;
      const cy = (18 + ((i * 53) % 90)) * u;
      c.globalAlpha = (0.14 + 0.5 * light) * (0.6 + grey * 0.6);
      c.drawImage(this.cloud!, cx, cy, cw, cw * 0.38);
    }
    c.globalAlpha = 1;
    // A few glints on the pond.
    c.strokeStyle = `rgba(255,255,255,${(0.15 + 0.25 * light).toFixed(2)})`;
    c.lineWidth = 1.2 * u;
    c.beginPath();
    for (const e of g.pond) {
      const p = this.pos(e.cx, e.cy - 0.5);
      const rx = (e.rx / XS) * (W - 2 * L.padX);
      for (let k = 0; k < 2; k++) {
        const ph = time * 0.6 + k * 2.1 + e.cx;
        const gx = p.sx + Math.sin(ph) * rx * 0.5, gy = p.sy + (k - 0.5) * 6 * u;
        const len = (6 + 4 * Math.sin(ph * 1.7)) * u;
        c.moveTo(gx - len, gy);
        c.lineTo(gx + len, gy);
      }
    }
    c.stroke();
    // Plants, back to front (shaded for the light; sprites re-draw when it moves a notch).
    const tone = `${Math.round(dark * 20)}|${Math.round(warm * 10)}`;
    let nSprites = 0;
    // Lilies float on the pond: drawn after everything else so a willow never hides them.
    const order: number[] = [];
    for (let i = 0; i < g.plants.length; i++) if (g.plants[i].sp !== 3) order.push(i);
    for (let i = 0; i < g.plants.length; i++) if (g.plants[i].sp === 3) order.push(i);
    const pr = this.pondRect;
    for (const i of order) {
      const p = g.plants[i];
      const sp = this.sprite(g, p);
      const { sx, sy, s } = this.pos(p.x, p.y);
      const gr = vg(p, step);
      const gq = gr >= 1 ? 1 : Math.round(gr * 48) / 48;
      const sleep = SPECIES[p.sp].sleepsAtNight && light < 0.25;
      if (!sp.cv || sp.gq !== gq || sp.sleep !== sleep || sp.tone !== tone) this.redrawSprite(sp, s, gq, sleep, tone);
      sp.kick *= Math.exp(-dt * 2.2);
      sp.flash *= Math.exp(-dt * 3.2);
      sp.pop *= Math.exp(-dt * 9);
      const { f: fx, dx } = this.fit(sp.shape, sx, s * sizeAt(gq));
      const pk = 1 + (f.reduced ? 0.04 : 0.1) * sp.pop;
      const skew = this.skew(sp, p, time, 0) * (f.reduced ? 0.5 : 1);
      const by = p.sp === 3 ? this.bob(sp, time) : 0;
      // A willow standing in front of the pond lets it show through its canopy.
      let alpha = 1;
      if (p.sp === 5 && pr && sy > pr.y0) {
        const k = s * sizeAt(gq);
        const x0 = sx + dx + sp.shape.minX * k * fx, x1 = sx + dx + sp.shape.maxX * k * fx, y0 = sy + sp.shape.minY * k;
        if (x1 > pr.x0 && x0 < pr.x1 && y0 < pr.y1) alpha = 0.62;
      }
      c.globalAlpha = alpha;
      this.blitSwayed(sp, sx + dx, sy + by, skew, fx, pk);
      c.globalAlpha = 1;
      nSprites++;
    }
    this.stats.sprites = nSprites;
    // Creatures (bodies; their glows come after the dark).
    const heads = (i: number, k: number) => this.head(g, i, k, step, time);
    const crit = f.critters.map((cr) => {
      const b = heads(cr.to, cr.k);
      const a = cr.from >= 0 ? heads(cr.from, cr.k) : { x: b.x + (cr.k % 2 ? 1 : -1) * 120 * u, y: b.y - 140 * u, s: b.s };
      const t = cr.f;
      const e = t * t * (3 - 2 * t);
      const lift = (cr.kind === 'frog' ? 26 : cr.kind === 'bee' ? 34 : 18) * u;
      let x = a.x + (b.x - a.x) * e;
      let y = a.y + (b.y - a.y) * e - Math.sin(Math.PI * e) * lift;
      const s = a.s + (b.s - a.s) * e;
      if (cr.kind === 'fly') {
        x += Math.sin(time * 1.7 + cr.k * 2) * 7 * u;
        y += Math.cos(time * 1.3 + cr.k) * 5 * u - 6 * u;
      } else if (cr.kind === 'bee' && t >= 1) {
        x += Math.sin(time * 6 + cr.k) * 2 * u;
        y += Math.cos(time * 5 + cr.k) * 1.5 * u - 3 * u;
      }
      return { cr, x, y, s, dir: Math.sign(b.x - a.x) || 1 };
    });
    for (const { cr, x, y, s: s0, dir } of crit) {
      const s = cr.kind === 'bee' ? s0 * 1.35 : s0;
      if (cr.kind === 'bee') {
        const flap = Math.sin(time * 60 + cr.k) * 0.5 + 0.5;
        c.fillStyle = 'rgba(255,255,255,0.7)';
        c.beginPath();
        c.ellipse(x - dir * 0.5 * s, y - 3.2 * s, 2.6 * s, (1 + flap * 1.2) * s, -0.3 * dir, 0, TAU);
        c.fill();
        c.fillStyle = '#ffcc33';
        c.beginPath();
        c.ellipse(x, y, 4 * s, 2.8 * s, 0, 0, TAU);
        c.fill();
        c.fillStyle = '#3a2a1a';
        c.fillRect(x - 1.4 * s, y - 2.6 * s, 1.1 * s, 5.2 * s);
        c.fillRect(x + 0.8 * s, y - 2.4 * s, 1 * s, 4.8 * s);
      } else if (cr.kind === 'frog') {
        const sx = x, sy = y + 2 * s;
        c.fillStyle = css(mix(hex('#5fa04a'), NIGHT_RGB, dark));
        c.beginPath();
        c.ellipse(sx, sy, 6.5 * s, 4.6 * s, 0, 0, TAU);
        c.fill();
        c.beginPath();
        c.arc(sx - 3 * s, sy - 4 * s, 2.2 * s, 0, TAU);
        c.arc(sx + 3 * s, sy - 4 * s, 2.2 * s, 0, TAU);
        c.fill();
        c.fillStyle = '#1a2a14';
        c.beginPath();
        c.arc(sx - 3 * s, sy - 4.3 * s, 0.9 * s, 0, TAU);
        c.arc(sx + 3 * s, sy - 4.3 * s, 0.9 * s, 0, TAU);
        c.fill();
        c.fillStyle = css(mix(hex('#cfe6a0'), NIGHT_RGB, dark));
        c.beginPath();
        c.ellipse(sx, sy + 1.5 * s, 4 * s, 2 * s, 0, 0, TAU);
        c.fill();
      } else {
        c.fillStyle = '#3a3a2a';
        c.beginPath();
        c.arc(x, y, 1.5 * s, 0, TAU);
        c.fill();
      }
    }
    // Glows: notes as they sound, glowcaps and lilies at night, fireflies.
    c.globalCompositeOperation = 'lighter';
    const night = 1 - light;
    for (let i = 0; i < g.plants.length; i++) {
      const p = g.plants[i];
      const sp = this.sprite(g, p);
      const gr = growth(p, step);
      const ambient = p.sp === 4 ? night * 0.55 * Math.min(1, gr * 2) : p.sp === 3 ? night * 0.3 * gr : 0;
      const v = Math.min(1.2, sp.flash * (f.reduced ? 0.6 : 1) + ambient);
      if (v < 0.08) continue;
      const img = this.glow(sp.shape.glow);
      // At most three glows a plant (bells have up to nine heads): glows were the next-biggest raster cost.
      const n = Math.min(3, Math.max(1, sp.shape.heads.length));
      for (let k = 0; k < n; k++) {
        const h = this.head(g, i, k, step, time);
        const R = (10 + 10 * Math.min(1, v)) * h.s;
        c.globalAlpha = Math.min(1, v) * (0.75 + 0.2 * night);
        c.drawImage(img, h.x - R, h.y - R, R * 2, R * 2);
      }
    }
    for (const { cr, x, y, s } of crit) {
      if (cr.kind !== 'fly') continue;
      const pulse = 0.55 + 0.45 * Math.sin(time * 2.4 + cr.k * 1.9);
      const R = 11 * s * (0.8 + pulse * 0.4);
      c.globalAlpha = 0.5 + 0.5 * pulse;
      c.drawImage(this.glow('rgba(200,255,120,0.7)'), x - R, y - R, R * 2, R * 2);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    // Particles.
    const keep: Particle[] = [];
    for (const p of this.parts) {
      p.life += dt;
      if (p.life >= p.max) continue;
      keep.push(p);
      const k = p.life / p.max;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'dirt') p.vy += 260 * u * dt;
      if (p.kind === 'leaf') {
        p.vy += 20 * u * dt;
        p.vx *= 0.99;
      }
      c.globalAlpha = 1 - k;
      if (p.kind === 'ring') {
        c.strokeStyle = p.c;
        c.lineWidth = 1.2 * u;
        c.beginPath();
        c.ellipse(p.x, p.y, p.r + k * 22 * u, (p.r + k * 22 * u) * 0.3, 0, 0, TAU);
        c.stroke();
      } else if (p.kind === 'drop') {
        c.strokeStyle = p.c;
        c.lineWidth = p.r;
        c.beginPath();
        c.moveTo(p.x, p.y);
        c.lineTo(p.x, p.y - 5 * u);
        c.stroke();
      } else {
        c.fillStyle = p.c;
        c.beginPath();
        c.arc(p.x, p.y, p.r * (p.kind === 'spark' ? 1 - k * 0.5 : 1), 0, TAU);
        c.fill();
      }
    }
    this.parts = keep;
    c.globalAlpha = 1;
    // Rain and mist.
    if (wk.kind === 'rain' && wk.amt > 0) {
      const n = Math.round((f.reduced ? 30 : 70) * wk.amt);
      c.strokeStyle = `rgba(200,220,255,${(0.25 + 0.15 * light).toFixed(2)})`;
      c.lineWidth = 1 * u;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const sx = ((i * 7919) % 1000) / 1000;
        const sy = ((i * 104729) % 1000) / 1000;
        const y = ((sy * H + time * (420 + (i % 5) * 40) * u) % (H + 20)) - 10;
        const x = (sx * W + y * 0.12) % W;
        c.moveTo(x, y);
        c.lineTo(x - 2 * u, y - 12 * u);
      }
      c.stroke();
    }
    if (wk.kind === 'mist' && wk.amt > 0) {
      // One pre-composed haze image (four soft bands) instead of four full-width draws: mist was the
      // costliest weather under CPU throttling. It drifts and breathes as a whole.
      const { dpr } = L;
      if (!this.mist) {
        // At device resolution, so the per-frame draw is an unscaled blit.
        this.mist = canvas((W + 20 * u) * dpr, 375 * u * dpr);
        const x = this.mist.getContext('2d')!;
        x.scale(dpr, dpr);
        for (let i = 0; i < 4; i++) {
          x.globalAlpha = 0.5 + 0.15 * Math.sin(i * 1.7);
          x.drawImage(this.band!, (i % 2) * -20 * u, i * 75 * u, W + 40 * u, 130 * u);
        }
      }
      c.globalAlpha = wk.amt * (0.9 + 0.1 * Math.sin(time * 0.3));
      c.setTransform(1, 0, 0, 1, Math.round(-((time * 3) % 20) * u * dpr), Math.round((top - 70 * u) * dpr));
      c.drawImage(this.mist, 0, 0);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.globalAlpha = 1;
    }
    this.drawBeat(step, light, f.reduced);
    this.drawTrail(time);
    // Tools under the finger.
    if (f.ghost) this.drawGhost(g, f.ghost, time);
    if (f.tool?.kind === 'water') this.drawCan(f.tool.x, f.tool.y, time);
  }

  private drawGhost(g: Garden, gh: Ghost, time: number): void {
    const c = this.ctx;
    const { dpr, u, W, top, bot } = this.L;
    const { sx, sy, s } = this.pos(gh.x, gh.y);
    // Column stripe and lane line: which note, which beat.
    const col = Math.floor((gh.x * COLS) / XS);
    const x0 = this.pos((col * XS) / COLS, 0).sx - 0.5 * ((W - 2 * this.L.padX) / XS);
    const cw = (W - 2 * this.L.padX) / COLS;
    c.fillStyle = gh.ok ? 'rgba(255,250,220,0.10)' : 'rgba(255,90,90,0.10)';
    c.fillRect(x0, top, cw, bot - top);
    c.fillStyle = gh.ok ? 'rgba(255,250,220,0.16)' : 'rgba(255,90,90,0.14)';
    const lane = Math.floor((gh.y * LANES) / ROWS);
    c.fillRect(0, top + (lane / LANES) * (bot - top), W, (bot - top) / LANES);
    const key = `ghost.${gh.sp}`;
    let sp = this.sprites.get(key);
    if (!sp) {
      sp = { shape: makeShape(7, gh.sp, 500, 18), cv: null, gq: -1, sleep: false, tone: '', ox: 0, oy: 0, w: 0, h: 0, phase: 0, kick: 0, flash: 0, pop: 0, shadow: 10 };
      this.sprites.set(key, sp);
    }
    if (!sp.cv || Math.abs(sp.w - (sp.shape.maxX - sp.shape.minX) * s - 2) > 0.5) this.redrawSprite(sp, s, 1, false);
    c.globalAlpha = gh.ok ? 0.75 : 0.35;
    c.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
    c.drawImage(sp.cv!, -sp.ox, -sp.oy, sp.w, sp.h);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = 1;
    c.strokeStyle = gh.ok ? 'rgba(255,250,220,0.8)' : 'rgba(255,110,110,0.9)';
    c.lineWidth = 1.5 * u;
    c.beginPath();
    c.ellipse(sx, sy, 12 * s, 4 * s, 0, 0, TAU);
    c.stroke();
    // Label well above the finger.
    const ly = Math.max(16 * u, sy - 96 * u);
    c.font = `700 ${Math.round(14 * Math.max(1, u))}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    const tw = c.measureText(gh.label).width + 20;
    const lx = Math.max(tw / 2 + 4, Math.min(W - tw / 2 - 4, sx));
    c.fillStyle = gh.ok ? 'rgba(20,28,40,0.82)' : 'rgba(70,16,24,0.88)';
    c.beginPath();
    c.roundRect(lx - tw / 2, ly - 15, tw, 30, 15);
    c.fill();
    c.fillStyle = gh.ok ? '#fff6dc' : '#ffd0d0';
    c.fillText(gh.label, lx, ly + 1);
    void time;
    void g;
  }

  /**
   * The bar's sweep, back row to front: a bright band on the current half-beat's lane
   * (added light, so it shows at night and through mist) and ticks down both edges of
   * the meadow, numbered on the beats, the current one lit.
   */
  private drawBeat(step: number, light: number, reduced: boolean): void {
    const c = this.ctx;
    const { W, u, top, bot } = this.L;
    const lh = (bot - top) / LANES;
    const pos = (((step % 16) + 16) % 16) / 16;
    const lane = Math.floor(pos * LANES);
    const within = pos * LANES - lane;
    // The band glides across its lane and fades as the next one takes over.
    const y = top + pos * (bot - top);
    const { dpr } = this.L;
    // Built at its exact size in device pixels, so each frame is a plain blit (a scaled or
    // 'lighter' draw of it cost ~9 fps under CPU ×4).
    const bw = Math.round((W - 28 * u) * dpr), bh = Math.max(2, Math.round(lh * dpr));
    if (!this.beatBand || this.beatBand.width !== bw || this.beatBand.height !== bh) {
      this.beatBand = canvas(bw, bh);
      const x = this.beatBand.getContext('2d')!;
      const gr = x.createLinearGradient(0, 0, 0, bh);
      gr.addColorStop(0, 'rgba(255,240,180,0)');
      gr.addColorStop(0.5, 'rgba(255,240,180,1)');
      gr.addColorStop(1, 'rgba(255,240,180,0)');
      x.fillStyle = gr;
      x.fillRect(0, 0, bw, bh);
    }
    // Profiled (CDP trace, CPU ×4): the live layer's raster is most of the frame, so the band
    // is one lane tall (it was 1.8) and the edge chips are drawn once into the landscape layer;
    // only the lit chip is drawn per frame.
    c.globalAlpha = (reduced ? 0.26 : 0.36) + 0.1 * (1 - light);
    c.setTransform(1, 0, 0, 1, Math.round(14 * u * dpr), Math.round((y - lh * 0.5) * dpr));
    c.drawImage(this.beatBand, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalAlpha = 0.45 + 0.2 * (1 - light);
    c.fillStyle = '#fff3c4';
    c.fillRect(14 * u, y - 0.75 * u, W - 28 * u, 1.5 * u);
    this.drawChips(c, lane, within);
    c.globalAlpha = 1;
  }

  /**
   * Edge markers (plants are kept clear of the edges, see `fit`): numbered chips on the beats,
   * small dots on the "and"s. Dark chips with pale numbers read on bright grass, in mist and at
   * night alike. lit < 0 draws them all unlit (into the landscape layer); else only lane `lit`, lit.
   */
  private drawChips(c: CanvasRenderingContext2D, lit: number, within = 0): void {
    const { W, u, top, bot } = this.L;
    const lh = (bot - top) / LANES;
    const fs = Math.max(11, Math.round(11 * u));
    const R = Math.max(7.5, fs * 0.68);
    c.font = `800 ${fs}px system-ui, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (let l = 0; l < LANES; l++) {
      if (lit >= 0 && l !== lit) continue;
      const ly = top + (l + 0.5) * lh;
      const on = l === lit;
      for (const ex of [R + 1, W - R - 1]) {
        if (l % 2 === 0) {
          c.globalAlpha = on ? 1 : 0.82;
          c.fillStyle = on ? '#fff3c4' : 'rgba(16,24,30,0.78)';
          c.beginPath();
          c.arc(ex, ly, on ? R * 1.12 : R, 0, TAU);
          c.fill();
          c.fillStyle = on ? '#2a1e08' : '#f6f0d6';
          c.fillText(String(l / 2 + 1), ex, ly + 0.5);
        } else {
          c.globalAlpha = on ? 1 - 0.4 * within : 0.75;
          c.fillStyle = on ? '#fff3c4' : 'rgba(16,24,30,0.7)';
          c.beginPath();
          c.arc(ex, ly, R * 0.38, 0, TAU);
          c.fill();
        }
      }
    }
    c.globalAlpha = 1;
  }

  private drawTrail(time: number): void {
    const pts = this.trail.filter((p) => time - p.t < 0.45);
    this.trail = pts;
    if (pts.length < 2) return;
    const c = this.ctx;
    const u = this.L.u;
    c.globalCompositeOperation = 'lighter';
    c.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {
      const a = 1 - (time - pts[i].t) / 0.45;
      c.strokeStyle = `rgba(255,240,190,${(0.75 * a).toFixed(2)})`;
      c.lineWidth = (2 + 6 * a) * u;
      c.beginPath();
      c.moveTo(pts[i - 1].x, pts[i - 1].y);
      c.lineTo(pts[i].x, pts[i].y);
      c.stroke();
    }
    c.globalCompositeOperation = 'source-over';
  }

  private drawCan(x: number, y: number, time: number): void {
    const c = this.ctx;
    const u = this.L.u;
    const cy = y - 70 * u + Math.sin(time * 8) * 1.5 * u;
    c.fillStyle = '#7fb3c8';
    c.strokeStyle = '#3d6a7c';
    c.lineWidth = 1.5 * u;
    c.beginPath();
    c.roundRect(x - 2 * u, cy - 9 * u, 20 * u, 15 * u, 3 * u);
    c.fill();
    c.stroke();
    c.beginPath();
    c.moveTo(x, cy - 4 * u);
    c.lineTo(x - 14 * u, cy + 6 * u);
    c.lineWidth = 3 * u;
    c.stroke();
  }
}
