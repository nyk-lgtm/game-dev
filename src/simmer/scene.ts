// Simmer's evening on a canvas: the street, the stall and its keeper (a red
// panda), lanterns, weather, and little critters who walk up, queue, order and
// walk off. The night itself is already decided (core/night.ts); this only
// replays its visits over time, with bubbles, coins and hearts.

import { DISHES, OPEN_MINUTES, type NightCtx, type NightResult, type Visit } from './core';

type C2D = CanvasRenderingContext2D;

const ell = (c: C2D, x: number, y: number, rx: number, ry: number, rot = 0) => {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fill();
};
const circ = (c: C2D, x: number, y: number, r: number) => ell(c, x, y, r, r);
const tri = (c: C2D, a: number[], b: number[], d: number[]) => {
  c.beginPath();
  c.moveTo(a[0], a[1]);
  c.lineTo(b[0], b[1]);
  c.lineTo(d[0], d[1]);
  c.closePath();
  c.fill();
};

function eyes(c: C2D, y = -19, x0 = 1.8, x1 = 5.8, r = 1.25) {
  c.fillStyle = '#1b1420';
  circ(c, x0, y, r);
  circ(c, x1, y, r);
  c.fillStyle = 'rgba(255,255,255,0.85)';
  circ(c, x0 + 0.4, y - 0.45, r * 0.38);
  circ(c, x1 + 0.4, y - 0.45, r * 0.38);
}
function blob(c: C2D, body: string, belly: string, feet: string, bodyY = -9) {
  c.fillStyle = feet;
  ell(c, -3.2, -0.6, 2.6, 1.6);
  ell(c, 3.4, -0.6, 2.6, 1.6);
  c.fillStyle = body;
  ell(c, 0, bodyY, 8, 9);
  c.fillStyle = belly;
  ell(c, 1.5, bodyY + 2, 4.6, 5.6);
}
function cheeks(c: C2D, y = -16.5) {
  c.fillStyle = 'rgba(255,120,140,0.35)';
  circ(c, 0.2, y, 1.4);
  circ(c, 7.4, y, 1.4);
}

/**
 * Draws one critter with its feet at (x, y), facing right (face 1) or left (-1).
 * `s` scales the ~26 px tall figure; `ph` animates a walk bob or a moth's wings.
 */
export function drawCritter(c: C2D, sp: number, x: number, y: number, s = 1, ph = 0, face = 1): void {
  c.save();
  c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,0.28)';
  ell(c, 0, 0, 8 * s, 2.4 * s);
  c.translate(0, -Math.abs(Math.sin(ph)) * 1.6 * s);
  c.scale(s * face, s);
  switch (sp) {
    case 0: {
      // Mouse: big round ears, a curly tail.
      c.strokeStyle = '#c99aa8';
      c.lineWidth = 1.3;
      c.beginPath();
      c.moveTo(-7, -4);
      c.quadraticCurveTo(-15, -4, -13, -12);
      c.stroke();
      blob(c, '#b9b2c6', '#e7e2ee', '#8d86a0');
      c.fillStyle = '#b9b2c6';
      circ(c, 3.5, -17, 6.5);
      circ(c, -1.5, -24, 4.4);
      circ(c, 7, -24.5, 4.2);
      c.fillStyle = '#f2b6c6';
      circ(c, -1.5, -24, 2.5);
      circ(c, 7, -24.5, 2.4);
      eyes(c, -17.5, 2.3, 6.3, 1.2);
      c.fillStyle = '#f08aa0';
      circ(c, 9.8, -15.5, 1.3);
      break;
    }
    case 1: {
      // Fox: pointed ears, white muzzle, a bushy tail.
      c.fillStyle = '#d9692a';
      ell(c, -9, -9, 7.5, 4, -0.6);
      c.fillStyle = '#fbf1e4';
      ell(c, -14, -13.5, 3, 2.2, -0.6);
      blob(c, '#e57a35', '#fbf1e4', '#5a2c18');
      c.fillStyle = '#e57a35';
      circ(c, 3.5, -17.5, 6.6);
      tri(c, [-2.5, -20], [-1.5, -29], [3, -22.5]);
      tri(c, [4, -23], [8.5, -29.5], [9.5, -19.5]);
      c.fillStyle = '#3a2016';
      tri(c, [-2.1, -24], [-1.5, -29], [0.6, -25.5]);
      tri(c, [6.9, -26.5], [8.5, -29.5], [9.1, -25]);
      c.fillStyle = '#fbf1e4';
      ell(c, 6.6, -14.8, 4.2, 2.8, 0.2);
      eyes(c, -18.5, 2.2, 6.4, 1.2);
      c.fillStyle = '#2a1712';
      circ(c, 10.4, -15.4, 1.2);
      break;
    }
    case 2: {
      // Mole: velvet grey, a pink star nose, little pink hands.
      blob(c, '#5f4d58', '#7b6873', '#f0a3b2');
      c.fillStyle = '#5f4d58';
      circ(c, 3.5, -16.5, 6.6);
      c.strokeStyle = '#1b1420';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(1, -18);
      c.lineTo(3, -18);
      c.moveTo(5, -18.2);
      c.lineTo(7, -18.2);
      c.stroke();
      c.fillStyle = '#f08aa0';
      for (let k = 0; k < 6; k++) circ(c, 10.6 + Math.cos(k) * 1.6, -15 + Math.sin(k) * 1.6, 1.1);
      circ(c, 10.6, -15, 1.4);
      c.fillStyle = '#f0a3b2';
      ell(c, 7.5, -8.5, 2.2, 1.6);
      break;
    }
    case 3: {
      // Rabbit: tall ears, a cotton tail.
      c.fillStyle = '#ffffff';
      circ(c, -8, -7, 3);
      blob(c, '#ece0cc', '#fff9ef', '#c9b8a0');
      c.fillStyle = '#ece0cc';
      circ(c, 3.5, -17, 6.6);
      ell(c, 0.5, -28, 2.6, 7.5, -0.15);
      ell(c, 5.5, -28.5, 2.6, 7.5, 0.2);
      c.fillStyle = '#f4b9c4';
      ell(c, 0.5, -28, 1.2, 5.6, -0.15);
      ell(c, 5.5, -28.5, 1.2, 5.6, 0.2);
      eyes(c, -17.5, 2.4, 6.4, 1.2);
      cheeks(c, -15);
      c.fillStyle = '#f08aa0';
      circ(c, 9.8, -15.6, 1.1);
      break;
    }
    case 4: {
      // Moth: soft wings that flutter, feathery antennae.
      const flap = 0.75 + 0.25 * Math.abs(Math.cos(ph * 2.2));
      c.fillStyle = '#b39ddc';
      ell(c, -6, -17, 8 * flap, 11, -0.5);
      c.fillStyle = '#c8b6ea';
      ell(c, -3, -9, 6 * flap, 6.5, 0.4);
      c.fillStyle = '#7f63bd';
      circ(c, -7.5 * flap, -19, 2.2);
      blob(c, '#e6dcf4', '#f7f2fc', '#9c88c4', -10);
      c.fillStyle = '#e6dcf4';
      circ(c, 3.5, -18, 6.2);
      c.strokeStyle = '#7f63bd';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(2, -23);
      c.quadraticCurveTo(0, -29, -2, -31);
      c.moveTo(6, -23);
      c.quadraticCurveTo(8, -29, 10, -31);
      c.stroke();
      c.fillStyle = '#7f63bd';
      circ(c, -2, -31, 1.4);
      circ(c, 10, -31, 1.4);
      eyes(c, -18.5, 2, 6.2, 1.5);
      break;
    }
    case 5: {
      // Badger: stocky, a black-and-white striped face.
      blob(c, '#7c7c86', '#a5a5ae', '#2c2c32');
      c.fillStyle = '#f1f1f1';
      circ(c, 3.5, -17, 7);
      c.fillStyle = '#2c2c32';
      ell(c, 1.4, -18, 1.9, 5.5, 0.15);
      ell(c, 6.4, -18, 1.9, 5.5, -0.15);
      circ(c, -1.5, -23, 2.4);
      circ(c, 8.6, -23, 2.4);
      c.fillStyle = '#f1f1f1';
      circ(c, 1.4, -18.5, 0.9);
      circ(c, 6.4, -18.5, 0.9);
      c.fillStyle = '#1b1420';
      circ(c, 1.4, -18.5, 0.6);
      circ(c, 6.4, -18.5, 0.6);
      circ(c, 10.4, -14.6, 1.4);
      break;
    }
    case 6: {
      // Heron: long legs and neck, a yellow beak, a black crest.
      c.strokeStyle = '#d8b04a';
      c.lineWidth = 1.2;
      c.beginPath();
      c.moveTo(-1.5, -7);
      c.lineTo(-2, 0);
      c.moveTo(2, -7);
      c.lineTo(2.5, 0);
      c.stroke();
      c.fillStyle = '#9fb4c9';
      ell(c, -1, -12, 7.5, 5.5, -0.25);
      c.fillStyle = '#7f93a8';
      ell(c, -4, -12, 5, 3.5, -0.3);
      c.strokeStyle = '#c9d6e3';
      c.lineWidth = 3.4;
      c.beginPath();
      c.moveTo(3, -15);
      c.quadraticCurveTo(7, -20, 3.5, -26);
      c.stroke();
      c.fillStyle = '#e4ecf3';
      circ(c, 4.5, -27.5, 3.8);
      c.fillStyle = '#e8b739';
      tri(c, [7.5, -28.5], [16, -27], [7.5, -26.2]);
      c.strokeStyle = '#1b1420';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(2.5, -29.5);
      c.lineTo(-3.5, -31);
      c.stroke();
      c.fillStyle = '#1b1420';
      circ(c, 5.4, -28.4, 0.9);
      break;
    }
    case 7: {
      // Owl: round, a pale face disc, big eyes, ear tufts.
      blob(c, '#94643f', '#c9a074', '#e0a33a', -11);
      c.fillStyle = '#94643f';
      circ(c, 3, -17, 7.6);
      tri(c, [-3.5, -20], [-3, -28], [1.5, -23]);
      tri(c, [5, -23], [9.5, -28.5], [9.8, -20]);
      c.fillStyle = '#e8cfa8';
      circ(c, 3.2, -17, 5.8);
      c.fillStyle = '#f2c94c';
      circ(c, 1, -18, 2.4);
      circ(c, 5.6, -18, 2.4);
      c.fillStyle = '#1b1420';
      circ(c, 1.2, -18, 1.3);
      circ(c, 5.8, -18, 1.3);
      c.fillStyle = '#e08a2c';
      tri(c, [2.4, -15.8], [4.4, -15.8], [3.4, -13.2]);
      break;
    }
  }
  c.restore();
}

/** The stall keeper, a red panda, from the waist up behind the counter. */
function drawKeeper(c: C2D, x: number, y: number, ph: number): void {
  c.save();
  c.translate(x, y + Math.sin(ph) * 0.8);
  c.fillStyle = '#b4492a';
  ell(c, 0, -6, 11, 9);
  c.fillStyle = '#2d1c1a';
  ell(c, -9, -3, 3, 5, 0.3);
  ell(c, 9, -3, 3, 5, -0.3);
  c.fillStyle = '#c95a30';
  circ(c, 0, -20, 9.5);
  circ(c, -8, -27, 3.6);
  circ(c, 8, -27, 3.6);
  c.fillStyle = '#fff3e6';
  circ(c, -8, -27, 1.8);
  circ(c, 8, -27, 1.8);
  ell(c, -4.6, -22.5, 2.6, 2, 0.3);
  ell(c, 4.6, -22.5, 2.6, 2, -0.3);
  ell(c, 0, -16, 4.6, 3.4);
  c.fillStyle = '#1b1420';
  circ(c, -3.6, -19.6, 1.3);
  circ(c, 3.6, -19.6, 1.3);
  circ(c, 0, -17.5, 1.2);
  // A little white headscarf.
  c.fillStyle = '#f4efe6';
  c.beginPath();
  c.ellipse(0, -27.5, 8, 3.4, 0, Math.PI, 0);
  c.fill();
  c.restore();
}

/** Sprite images of each critter for the page's lists (data URLs, cached). */
const spriteCache = new Map<string, string>();
export function spriteURL(sp: number, size = 40): string {
  const key = `${sp}:${size}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  let url = '';
  try {
    const cv = document.createElement('canvas');
    const k = 2;
    cv.width = cv.height = size * k;
    const c = cv.getContext('2d')!;
    c.scale(k, k);
    drawCritter(c, sp, size / 2 - 1, size - 3, size / 36, 0, 1);
    url = cv.toDataURL();
  } catch {
    url = '';
  }
  spriteCache.set(key, url);
  return url;
}

// ---------------------------------------------------------------- the evening player

interface Mob {
  v: Visit;
  x: number;
  y: number;
  face: number;
  ph: number;
  gone: boolean;
  /** Edge it came from (-1 left, 1 right). */
  side: number;
}

export interface SceneHooks {
  /** A guest's visit resolved (left, or got their food). */
  onVisit(v: Visit): void;
  /** A guest stepped up to order. */
  onOrder(v: Visit): void;
  onDone(): void;
  onTap(v: Visit): void;
  /** Every frame, with the sim clock. */
  onFrame(t: number): void;
}

/** Guests set off this many minutes before they reach the stall, walking WALK px a minute. */
const LEAD = 16;
const WALK = 15;

const REASON_ICON: Record<string, string> = { pricey: '💸', worth: '🤨', soldout: '❌', nolike: '😕', slow: '⌛', closed: '🌙' };

export class Scene {
  private c: C2D;
  private w = 360;
  private h = 300;
  private dpr = 1;
  private night: NightResult | null = null;
  private ctx: NightCtx = { weather: 'clear', festival: false, payday: false };
  private menu: { dish: number; price: number }[] = [];
  private stoves = 1;
  private mobs: Mob[] = [];
  /** Sim minutes. */
  t = 0;
  /** Sim minutes per real second. */
  speed = 8;
  private end = OPEN_MINUTES;
  private last = 0;
  private raf = 0;
  private resolved = new Set<number>();
  private ordered = new Set<number>();
  private pops: { x: number; y: number; text: string; t0: number; color: string }[] = [];
  private done = false;
  private bg: HTMLCanvasElement | null = null;
  private clock = 0;
  reduced = false;

  constructor(private cv: HTMLCanvasElement, private hooks: SceneHooks) {
    this.c = cv.getContext('2d')!;
    cv.addEventListener('pointerdown', (e) => this.tap(e));
  }

  resize(): void {
    const r = this.cv.getBoundingClientRect();
    this.w = Math.max(200, r.width);
    this.h = Math.max(200, r.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.cv.width = Math.round(this.w * this.dpr);
    this.cv.height = Math.round(this.h * this.dpr);
    this.bg = null;
    this.draw();
  }

  /** Geometry: the counter, the stoves' spots and the queue rows. */
  private get counterY(): number {
    return Math.min(118, this.h * 0.36);
  }
  private slot(s: number): [number, number] {
    const gap = 46;
    return [this.w / 2 + (s - (this.stoves - 1) / 2) * gap, this.counterY + 30];
  }
  private queueSpot(k: number): [number, number] {
    const gap = 27;
    const y0 = this.counterY + 66;
    // The head of the queue stands right under the counter; the first row runs left from
    // there, then rows wind back and forth below it.
    const half = Math.max(3, Math.floor((this.w / 2 - 16) / gap) + 1);
    if (k < half) return [this.w / 2 - k * gap, y0];
    const per = Math.max(6, Math.floor((this.w - 30) / gap));
    const j = k - half;
    const row = 1 + Math.floor(j / per);
    const col = j % per;
    const left = (this.w - (per - 1) * gap) / 2;
    const x = row % 2 === 1 ? left + col * gap : left + (per - 1 - col) * gap;
    return [x, Math.min(y0 + row * 30, this.h - 14)];
  }

  play(night: NightResult, ctx: NightCtx, menu: { dish: number; price: number }[], stoves: number): void {
    this.night = night;
    this.ctx = ctx;
    this.menu = menu;
    this.stoves = stoves;
    this.t = -LEAD;
    this.done = false;
    this.resolved.clear();
    this.ordered.clear();
    this.pops = [];
    this.bg = null;
    this.mobs = night.visits.map((v) => {
      const side = v.g.id % 2 === 0 ? -1 : 1;
      return { v, x: side < 0 ? -20 : this.w + 20, y: this.h - 30, face: -side, ph: v.g.id, gone: false, side };
    });
    this.end = Math.max(OPEN_MINUTES, ...night.visits.map((v) => v.ready)) + 10;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.step(dt);
      this.draw();
      if (!this.done) this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.done = true;
  }

  /** Jump to the end of the night: every visit resolves at once. */
  /** Fast-forward (unseen) to sim minute t: visits on the way resolve as usual. */
  seek(t: number): void {
    if (!this.night || this.done) return;
    const sp = this.speed;
    this.speed = 60;
    while (this.t < t && !this.done) this.step(0.05);
    this.speed = sp;
    this.draw();
  }

  skip(): void {
    if (!this.night || this.done) return;
    this.t = this.end;
    this.step(0);
    this.draw();
  }

  /** The visit's place at sim time t: [x, y] or null once it has walked off. */
  private target(m: Mob, t: number, queuePos: Map<number, number>): [number, number] | 'leave' {
    const v = m.v;
    if (t < v.t) {
      const k = queuePos.get(v.g.id) ?? 0;
      return this.queueSpot(k);
    }
    if (v.pick >= 0 && t < v.ready) return this.slot(v.stove);
    return 'leave';
  }

  private step(dt: number): void {
    const n = this.night;
    if (!n) return;
    this.clock += dt;
    this.t += dt * this.speed;
    const t = this.t;
    // Queue order: everyone who has arrived and not yet reached the counter or left.
    const queuePos = new Map<number, number>();
    let k = 0;
    for (const m of this.mobs) {
      const v = m.v;
      if (v.g.at <= t && t < v.t) queuePos.set(v.g.id, k++);
    }
    const walk = dt * this.speed * WALK * Math.max(0.8, this.w / 380);
    for (const m of this.mobs) {
      const v = m.v;
      if (t < v.g.at - LEAD) continue;
      if (!this.ordered.has(v.g.id) && t >= v.t && v.pick >= 0) {
        this.ordered.add(v.g.id);
        this.hooks.onOrder(v);
      }
      const resolveAt = v.pick >= 0 ? v.ready : v.t;
      if (!this.resolved.has(v.g.id) && t >= resolveAt) {
        this.resolved.add(v.g.id);
        this.hooks.onVisit(v);
        const [px, py] = [m.x, m.y - 34];
        if (v.pick >= 0) {
          this.pops.push({ x: px, y: py, text: `+${v.paid}¢`, t0: this.clock, color: '#ffd46b' });
          if (v.mood === 'delighted') this.pops.push({ x: px + 14, y: py - 8, text: '♥', t0: this.clock + 0.15, color: '#ff7aa2' });
        } else if (v.rep < 0) this.pops.push({ x: px, y: py, text: '−♥', t0: this.clock, color: '#9aa3c7' });
      }
      const tg = this.target(m, t, queuePos);
      let tx: number, ty: number;
      if (tg === 'leave') {
        tx = m.side < 0 ? -30 : this.w + 30;
        ty = this.h - 24;
        // Head out through the side they came from, below the queue.
      } else [tx, ty] = tg;
      if (dt === 0) {
        if (tg === 'leave') m.gone = true;
        m.x = tx;
        m.y = ty;
        continue;
      }
      const dx = tx - m.x, dy = ty - m.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.5) {
        const s = Math.min(1, walk / d);
        m.x += dx * s;
        m.y += dy * s;
        if (Math.abs(dx) > 1) m.face = dx > 0 ? 1 : -1;
        m.ph += dt * 10;
      } else m.face = m.x < this.w / 2 - 8 ? 1 : m.x > this.w / 2 + 8 ? -1 : m.face;
      if (tg === 'leave' && (m.x < -24 || m.x > this.w + 24)) m.gone = true;
    }
    this.hooks.onFrame(t);
    if (t >= this.end && this.mobs.every((m) => m.gone) && !this.done) {
      this.done = true;
      this.hooks.onDone();
    } else if (dt === 0 && t >= this.end && !this.done) {
      this.done = true;
      this.hooks.onDone();
    }
  }

  private tap(e: PointerEvent): void {
    const r = this.cv.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    let best: Mob | null = null, bd = 30;
    for (const m of this.mobs) {
      if (m.gone || this.t < m.v.g.at - LEAD) continue;
      const d = Math.hypot(m.x - x, m.y - 12 - y);
      if (d < bd) (bd = d), (best = m);
    }
    if (best) this.hooks.onTap(best.v);
  }

  private paintBackground(): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = this.cv.width;
    cv.height = this.cv.height;
    const c = cv.getContext('2d')!;
    c.scale(this.dpr, this.dpr);
    const w = this.w, h = this.h, cy = this.counterY;
    const sky = c.createLinearGradient(0, 0, 0, cy + 30);
    const wx = this.ctx.weather;
    sky.addColorStop(0, wx === 'rain' ? '#151a2c' : wx === 'fog' ? '#2a2c3c' : wx === 'warm' ? '#24183a' : '#141633');
    sky.addColorStop(1, wx === 'warm' ? '#4a2c4a' : '#2b2440');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, cy + 30);
    // Far stalls in silhouette.
    c.fillStyle = 'rgba(10,8,20,0.55)';
    for (let i = 0; i < 6; i++) {
      const x = (i * w) / 5 - 30 + (i % 2) * 14;
      c.fillRect(x, cy - 34 + (i % 3) * 6, 46, 64);
      c.beginPath();
      c.moveTo(x - 6, cy - 34 + (i % 3) * 6);
      c.lineTo(x + 23, cy - 50 + (i % 3) * 6);
      c.lineTo(x + 52, cy - 34 + (i % 3) * 6);
      c.fill();
    }
    // The lane: warm cobbles.
    const g = c.createLinearGradient(0, cy + 20, 0, h);
    g.addColorStop(0, '#3a2d33');
    g.addColorStop(1, '#231b24');
    c.fillStyle = g;
    c.fillRect(0, cy + 22, w, h - cy - 22);
    c.fillStyle = 'rgba(255,220,180,0.05)';
    for (let yy = cy + 30, row = 0; yy < h; yy += 11, row++)
      for (let xx = (row % 2) * 9; xx < w; xx += 18) {
        c.beginPath();
        c.ellipse(xx, yy, 7, 3.6, 0, 0, Math.PI * 2);
        c.fill();
      }
    // Glow of the stall on the lane.
    const glow = c.createRadialGradient(w / 2, cy + 30, 10, w / 2, cy + 30, w * 0.6);
    glow.addColorStop(0, 'rgba(255,190,110,0.28)');
    glow.addColorStop(1, 'rgba(255,190,110,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
    return cv;
  }

  private drawStall(c: C2D): void {
    const w = this.w, cy = this.counterY;
    const sw = Math.min(250, w * 0.7);
    const x0 = w / 2 - sw / 2;
    const top = cy - 84;
    // Back wall and posts.
    c.fillStyle = '#4a2f24';
    c.fillRect(x0 + 6, top + 22, sw - 12, 70);
    c.fillStyle = '#6b4330';
    c.fillRect(x0 + 4, top + 16, 6, 92);
    c.fillRect(x0 + sw - 10, top + 16, 6, 92);
    // Shelf with jars.
    c.fillStyle = '#7a5038';
    c.fillRect(x0 + 16, top + 44, sw - 32, 4);
    const jars = ['#c8e0a0', '#f0c080', '#e0a0b0', '#a0c8e8'];
    for (let i = 0; i < 6; i++) {
      c.fillStyle = jars[i % 4];
      c.fillRect(x0 + 22 + i * ((sw - 50) / 6), top + 34, 9, 10);
    }
    drawKeeper(c, w / 2 + (this.stoves > 1 ? -18 : 0), cy - 2, this.clock * 2);
    if (this.stoves > 2) drawKeeper(c, w / 2 + 34, cy - 2, this.clock * 2 + 1);
    // Awning: cream and red stripes with a scalloped edge.
    const stripes = 9;
    for (let i = 0; i < stripes; i++) {
      c.fillStyle = i % 2 ? '#e8d6b4' : '#c9473f';
      const sx = x0 - 8 + (i * (sw + 16)) / stripes;
      c.fillRect(sx, top, (sw + 16) / stripes + 0.5, 20);
      c.beginPath();
      c.arc(sx + (sw + 16) / stripes / 2, top + 20, (sw + 16) / stripes / 2, 0, Math.PI);
      c.fill();
    }
    // Sign.
    c.fillStyle = '#2b1a14';
    c.fillRect(w / 2 - 34, top - 16, 68, 16);
    c.fillStyle = '#ffd46b';
    c.font = '800 11px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SIMMER', w / 2, top - 7.5);
    // Counter with the menu's dishes and steaming pots.
    c.fillStyle = '#8a5a3c';
    c.fillRect(x0 - 4, cy, sw + 8, 8);
    c.fillStyle = '#6b4330';
    c.fillRect(x0, cy + 8, sw, 16);
    c.font = '13px system-ui, sans-serif';
    this.menu.forEach((m, i) => {
      const sx = x0 + 14 + i * 17;
      c.fillText(DISHES[m.dish].icon, sx, cy + 16);
    });
    for (let s = 0; s < this.stoves; s++) {
      const [px] = this.slot(s);
      c.fillStyle = '#2f2a2e';
      ell(c, px + 22, cy - 3, 8, 4);
      c.fillRect(px + 14, cy - 3, 16, 3);
      if (!this.reduced) {
        c.fillStyle = 'rgba(255,255,255,0.12)';
        for (let k = 0; k < 3; k++) {
          const ph = (this.clock * 0.7 + k / 3 + s * 0.37) % 1;
          circ(c, px + 22 + Math.sin(ph * 6 + k) * 3, cy - 8 - ph * 22, 3 + ph * 4);
        }
      }
    }
  }

  /** The rival's little stall across the lane (left edge, half off the canvas), with what it sells. */
  private drawRival(c: C2D, dishes: number[]): void {
    const cy = this.counterY;
    const x0 = -18, w = Math.max(64, this.w * 0.2), top = cy - 70;
    c.fillStyle = '#2e2a3a';
    c.fillRect(x0 + 4, top + 16, w - 8, 64);
    for (let i = 0; i < 5; i++) {
      c.fillStyle = i % 2 ? '#dfe8f2' : '#3f6fa8';
      const sx = x0 + (i * w) / 5;
      c.fillRect(sx, top, w / 5 + 0.5, 15);
      c.beginPath();
      c.arc(sx + w / 10, top + 15, w / 10, 0, Math.PI);
      c.fill();
    }
    c.fillStyle = '#4b3a2c';
    c.fillRect(x0, cy + 4, w, 12);
    // Their keeper: a grey cat in a blue cap.
    c.fillStyle = '#8d8f9c';
    circ(c, x0 + w / 2 + 6, cy - 8, 8);
    tri(c, [x0 + w / 2 - 1, cy - 13], [x0 + w / 2 + 1, cy - 22], [x0 + w / 2 + 5, cy - 15]);
    tri(c, [x0 + w / 2 + 8, cy - 15], [x0 + w / 2 + 12, cy - 22], [x0 + w / 2 + 13, cy - 12]);
    c.fillStyle = '#3f6fa8';
    c.beginPath();
    c.ellipse(x0 + w / 2 + 6, cy - 15, 8, 3, 0, Math.PI, 0);
    c.fill();
    c.fillStyle = '#1b1420';
    circ(c, x0 + w / 2 + 3.5, cy - 8, 1.1);
    circ(c, x0 + w / 2 + 8.5, cy - 8, 1.1);
    c.font = '12px system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    dishes.forEach((d, i) => c.fillText(DISHES[d].icon, x0 + 22 + i * 16, cy + 10));
    c.fillStyle = '#dfe8f2';
    c.font = '800 9px system-ui, sans-serif';
    c.fillText('RIVAL', x0 + w / 2 + 6, top - 6);
  }

  private drawLanterns(c: C2D): void {
    const w = this.w;
    const fest = this.ctx.festival;
    const n = fest ? 11 : 7;
    const cols = fest ? ['#ff8a6a', '#ffd46b', '#8fe3c0', '#ff9ad5', '#9ec5ff'] : ['#ffcf6b'];
    c.strokeStyle = 'rgba(255,230,190,0.35)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, 6);
    c.quadraticCurveTo(w / 2, 30, w, 6);
    c.stroke();
    for (let i = 1; i < n; i++) {
      const u = i / n;
      const x = u * w;
      const y = 6 + 2 * u * (1 - u) * 24 * 2 - 0;
      const col = cols[i % cols.length];
      const flick = this.reduced ? 1 : 0.85 + 0.15 * Math.sin(this.clock * 3 + i * 1.7);
      const gl = c.createRadialGradient(x, y + 5, 1, x, y + 5, 16);
      gl.addColorStop(0, col + '88');
      gl.addColorStop(1, col + '00');
      c.globalAlpha = flick;
      c.fillStyle = gl;
      circ(c, x, y + 5, 16);
      c.globalAlpha = 1;
      c.fillStyle = col;
      ell(c, x, y + 5, 4.5, 5.5);
    }
  }

  private drawWeather(c: C2D): void {
    if (this.reduced) return;
    const w = this.w, h = this.h, t = this.clock;
    const wx = this.ctx.weather;
    if (wx === 'rain') {
      c.strokeStyle = 'rgba(170,190,255,0.35)';
      c.lineWidth = 1;
      c.beginPath();
      for (let i = 0; i < 46; i++) {
        const x = ((i * 97.3 + t * 60) % (w + 40)) - 20;
        const y = (i * 53.7 + t * 340) % h;
        c.moveTo(x, y);
        c.lineTo(x - 3, y + 9);
      }
      c.stroke();
    } else if (wx === 'fog') {
      for (let i = 0; i < 4; i++) {
        c.fillStyle = 'rgba(200,205,230,0.07)';
        ell(c, ((i * 140 + t * 8) % (w + 200)) - 100, h * (0.35 + i * 0.16), 140, 22);
      }
    } else if (wx === 'warm') {
      for (let i = 0; i < 12; i++) {
        const a = 0.3 + 0.5 * Math.abs(Math.sin(t * 1.3 + i));
        c.fillStyle = `rgba(255,236,120,${a})`;
        circ(c, (i * 71.3 + Math.sin(t * 0.5 + i) * 18) % w, 40 + ((i * 37.1 + Math.cos(t * 0.4 + i) * 12) % (h - 60)), 1.6);
      }
    } else if (wx === 'chilly') {
      c.fillStyle = 'rgba(232,140,60,0.75)';
      for (let i = 0; i < 9; i++) {
        const x = (i * 83.1 + Math.sin(t + i) * 14) % w;
        const y = (i * 61.7 + t * 22) % h;
        ell(c, x, y, 3, 1.6, t + i);
      }
    } else {
      c.fillStyle = 'rgba(255,255,255,0.6)';
      for (let i = 0; i < 14; i++) {
        const a = 0.25 + 0.5 * Math.abs(Math.sin(t * 0.8 + i * 2.1));
        c.globalAlpha = a;
        c.fillRect((i * 67.7) % w, 34 + ((i * 23.3) % (this.counterY - 90 > 10 ? this.counterY - 90 : 20)), 1.4, 1.4);
      }
      c.globalAlpha = 1;
    }
  }

  draw(): void {
    const c = this.c;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (!this.bg) this.bg = this.paintBackground();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.bg, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawLanterns(c);
    if (this.ctx.rival) this.drawRival(c, this.ctx.rival);
    this.drawStall(c);
    // Critters, back to front.
    const vis = this.mobs.filter((m) => !m.gone && this.t >= m.v.g.at - LEAD).sort((a, b) => a.y - b.y);
    for (const m of vis) drawCritter(c, m.v.g.sp, m.x, m.y, 1, m.ph, m.face);
    // Bubbles: what they're having, or why they're leaving.
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    for (const m of vis) {
      const v = m.v;
      let icon = '';
      if (v.pick >= 0 && this.t >= v.t && this.t < v.ready) icon = DISHES[this.menu[v.pick].dish].icon;
      else if (v.pick < 0 && this.t >= v.t && this.t < v.t + 14) icon = REASON_ICON[v.why ?? ''] ?? '';
      if (!icon) continue;
      const bx = m.x, by = m.y - 44;
      c.fillStyle = 'rgba(255,248,235,0.95)';
      c.beginPath();
      c.roundRect(bx - 12, by - 11, 24, 21, 8);
      c.fill();
      tri(c, [bx - 3, by + 9], [bx + 3, by + 9], [bx, by + 14]);
      c.font = '14px system-ui, sans-serif';
      c.fillText(icon, bx, by);
    }
    // Floating coins and hearts.
    c.font = '800 13px system-ui, sans-serif';
    this.pops = this.pops.filter((p) => this.clock - p.t0 < 1.4);
    for (const p of this.pops) {
      const a = this.clock - p.t0;
      if (a < 0) continue;
      c.globalAlpha = Math.max(0, 1 - a / 1.4);
      c.fillStyle = p.color;
      c.fillText(p.text, p.x, p.y - a * 22);
    }
    c.globalAlpha = 1;
    this.drawWeather(c);
  }
}
