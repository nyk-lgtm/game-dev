// Sungrazer on a canvas: the sky (tinted by zone), stars with their coronas,
// cinders, motes, the tether and a short release preview, the comet's tail,
// sparks and floating points, and the void glowing at the bottom.
// World y grows upward; the bottom of the screen is the run's camY.

import { COMET_R, LOCK, MOTE_R, NEAR, NEAR_CINDER, REGRAB, VIEW_H, W, ZONES, cinderX, isLit, lowerY, type Run, type Star } from '../core';

export interface View {
  scale: number;
  ox: number;
  w: number;
  h: number;
}

/** How long a zone banner shows (seconds). */
export const BANNER_S = 1.8;

export function fitView(w: number, h: number): View {
  const scale = Math.min(w / W, h / (VIEW_H * 0.9));
  return { scale, ox: (w - W * scale) / 2, w, h };
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
}
export interface Floater {
  x: number;
  y: number;
  text: string;
  sub?: string;
  color: string;
  t: number;
  /** Points so far, for a floater that sums a string of motes. */
  mote?: number;
  /** Popups born close together stack upward by this many lines. */
  stack?: number;
}

export interface Scene {
  run: Run;
  time: number;
  /** Recent comet positions (world), oldest first. */
  trail: number[];
  particles: Particle[];
  floaters: Floater[];
  target: Star | null;
  /** The next star coming into reach (shown faintly before it can be grabbed). */
  soon: Star | null;
  /** Release path preview (world x,y pairs) while tethered. */
  preview: number[] | null;
  /** Where that path would hit a star or cinder (it turns red and ends in an ✕). */
  hit: { x: number; y: number } | null;
  /** Letting go a moment later would hit something: the line turns amber. */
  warn: boolean;
  /** The tether burns within half a second. */
  burnSoon: boolean;
  /** Holding but nothing caught yet: show the reach. */
  reaching: boolean;
  shake: number;
  flash: number;
  banner: { title: string; sub: string; t: number } | null;
  /** Coach text near the comet (tutorial), and a big centred prompt. */
  coach: string | null;
  prompt: string | null;
  /** Seconds since the comet grabbed (for the grab pulse). */
  grabT: number;
  replay: boolean;
}

const SKIES: [string, string][] = [
  ['#0a0f2c', '#1b1546'],
  ['#140b24', '#2e1530'],
  ['#061826', '#0e2e40'],
  ['#1c0c12', '#3c1a18'],
  ['#04050b', '#0d0e1c'],
  ['#100523', '#2c0a40'],
];

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/** The sky's top and bottom colours at an altitude (zones blend into each other). */
export function skyColors(alt: number): [string, string] {
  let z = 0;
  for (let i = 1; i < ZONES.length; i++) if (alt >= ZONES[i].at - 120) z = i;
  const into = Math.max(0, Math.min(1, (alt - (ZONES[z].at - 120)) / 160));
  const from = SKIES[Math.max(0, z - 1)], to = SKIES[z];
  return z === 0 ? to : [mix(from[0], to[0], into), mix(from[1], to[1], into)];
}

const hash = (n: number) => {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const STAR_COL: Record<string, [string, string]> = {
  star: ['#fff1c4', '#ffb547'],
  giant: ['#ffd0a8', '#ff6a3a'],
  pulsar: ['#e4fbff', '#5fd4ff'],
};

export function draw(g: CanvasRenderingContext2D, v: View, sc: Scene): void {
  const r = sc.run;
  const { scale: k, ox, w, h } = v;
  const cam = r.camY;
  const X = (x: number) => ox + x * k;
  const Y = (y: number) => h - (y - cam) * k;
  const topY = cam + h / k;

  // The sky gradient is the stage's CSS background (skyColors), so a frame starts from a clear canvas.
  g.clearRect(0, 0, w, h);
  g.save();
  if (sc.shake > 0) g.translate((hash(Math.floor(sc.time * 60)) - 0.5) * sc.shake * 2, (hash(Math.floor(sc.time * 60) + 7) - 0.5) * sc.shake * 2);

  // Distant dust, drifting slower than the world: two batches (near and far), one fill each.
  g.fillStyle = '#cfd8ff';
  for (const near of [false, true]) {
    g.globalAlpha = near ? 0.72 : 0.42;
    g.beginPath();
    for (let i = 0; i < 70; i++) {
      const depth = 0.15 + hash(i * 3) * 0.35;
      if (depth > 0.32 !== near) continue;
      const px = hash(i * 3 + 1) * w;
      const span = h + 20;
      const py = ((((hash(i * 3 + 2) * span + cam * k * depth) % span) + span) % span) - 10;
      const sz = depth > 0.4 ? 1.6 : 1;
      g.rect(px, py, sz, sz);
    }
    g.fill();
  }
  g.globalAlpha = 1;

  // Walls: outside the field is darker; the edge glows when the comet is close.
  if (ox > 1) {
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(0, 0, ox, h);
    g.fillRect(ox + W * k, 0, ox + 2, h);
  }
  for (const side of [0, 1]) {
    const d = side ? W - r.x : r.x;
    const a = Math.max(0.12, Math.min(0.9, 1 - d / 14));
    const x = X(side ? W : 0);
    const grd = g.createLinearGradient(x, 0, x + (side ? -1 : 1) * 14, 0);
    grd.addColorStop(0, `rgba(140,170,255,${a * 0.5})`);
    grd.addColorStop(1, 'rgba(140,170,255,0)');
    g.fillStyle = grd;
    g.fillRect(side ? x - 14 : x, 0, 14, h);
  }

  const lo = cam - 12, hi = topY + 12;
  const tick = r.tick;

  // Motes: small turning diamonds, as plain paths (no save/rotate per mote).
  const ms = r.world.motes;
  const spin = Math.PI / 4 + sc.time * 0.8;
  const ca = Math.cos(spin) * MOTE_R * k * 0.67, sa = Math.sin(spin) * MOTE_R * k * 0.67;
  for (let i = lowerY(ms, lo); i < ms.length && ms[i].y < hi; i++) {
    const m = ms[i];
    if (r.got.has(m.id)) continue;
    const mx = X(m.x), my = Y(m.y);
    g.fillStyle = `rgba(150,245,255,${0.75 + 0.25 * Math.sin(sc.time * 5 + m.id)})`;
    g.beginPath();
    g.moveTo(mx + ca, my + sa);
    g.lineTo(mx - sa, my + ca);
    g.lineTo(mx - ca, my - sa);
    g.lineTo(mx + sa, my - ca);
    g.closePath();
    g.fill();
  }

  // Stars: glow, corona (the graze band), core.
  const stars = r.world.stars;
  const tethered = r.tether?.star ?? null;
  for (let i = lowerY(stars, lo - 20); i < stars.length && stars[i].y < hi + 20; i++) {
    const s = stars[i];
    const sx = X(s.x), sy = Y(s.y), sr = s.r * k;
    const lit = isLit(s, tick);
    const [core, glow] = STAR_COL[s.kind];
    const dim = s.kind === 'pulsar' && !lit;
    const left = s.id === r.last && !r.tether && r.since < 144;
    // Glow, dashed corona edge (graze inside it) and core come from one cached sprite per look.
    const R = sr + (s.band + 6) * k;
    blit(g, starSprite(g, sr, s.band * k, COMET_R * k, dim ? 'dim' : left ? 'left' : 'lit', core, glow), sx, sy, R);
    if (tethered === s && r.grazing) {
      g.strokeStyle = 'rgba(255,190,110,0.85)';
      g.lineWidth = 2;
      g.setLineDash([3, 4]);
      g.beginPath();
      g.arc(sx, sy, sr + (s.band + COMET_R) * k, 0, Math.PI * 2);
      g.stroke();
      g.setLineDash([]);
    }
    if (s.kind === 'pulsar') {
      // How long until it goes dark (lit) or lights up (dark).
      const ph = (tick + s.phase) % s.period;
      const frac = lit ? 1 - ph / s.lit : (ph - s.lit) / (s.period - s.lit);
      g.strokeStyle = lit ? 'rgba(160,235,255,0.9)' : 'rgba(160,190,220,0.6)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(sx, sy, sr + 3.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
      g.stroke();
    }
  }

  // The star a press would grab.
  if (sc.target && !r.tether && r.alive) {
    const s = sc.target;
    const sx = X(s.x), sy = Y(s.y);
    const pulse = 1 + 0.12 * Math.sin(sc.time * 9);
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 2;
    g.setLineDash([6, 5]);
    g.lineDashOffset = -sc.time * 30;
    g.beginPath();
    g.arc(sx, sy, (s.r + 3) * k * pulse, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([2, 6]);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(X(r.x), Y(r.y));
    g.lineTo(sx, sy);
    g.stroke();
    g.setLineDash([]);
    g.lineDashOffset = 0;
  }
  if (sc.soon && !sc.target && !r.tether && r.alive) {
    const s = sc.soon;
    g.strokeStyle = 'rgba(255,255,255,0.4)';
    g.lineWidth = 1.5;
    g.setLineDash([3, 6]);
    g.beginPath();
    g.arc(X(s.x), Y(s.y), (s.r + 3) * k, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
  if (sc.reaching && r.alive) {
    g.strokeStyle = 'rgba(200,220,255,0.18)';
    g.lineWidth = 1;
    g.setLineDash([4, 6]);
    g.beginPath();
    g.arc(X(r.x), Y(r.y), LOCK * k, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }

  // Cinders.
  const cs = r.world.cinders;
  for (let i = lowerY(cs, lo); i < cs.length && cs[i].y < hi; i++) {
    const c = cs[i];
    const cx = X(cinderX(c, tick)), cy = Y(c.y), cr = c.r * k;
    blit(g, glowSprite(g, cr * 2.6, cr * 0.5, ['rgba(255,90,40,0.5)']), cx, cy, cr * 2.6);
    g.beginPath();
    const n = 7;
    const rot = sc.time * (hash(c.id) - 0.5) * 2;
    for (let j = 0; j < n; j++) {
      const a = rot + (j / n) * Math.PI * 2;
      const rr = cr * (0.82 + hash(c.id * 13 + j) * 0.36);
      if (j) g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
      else g.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    g.closePath();
    g.fillStyle = '#3b2420';
    g.fill();
    g.strokeStyle = '#ff6a3d';
    g.lineWidth = 1.6;
    g.stroke();
    if (c.amp) {
      g.strokeStyle = 'rgba(255,106,61,0.22)';
      g.lineWidth = 1;
      g.setLineDash([2, 5]);
      g.beginPath();
      g.moveTo(X(c.x - c.amp), cy);
      g.lineTo(X(c.x + c.amp), cy);
      g.stroke();
      g.setLineDash([]);
    }
  }

  // Tether and the release preview.
  if (r.tether && r.alive) {
    const s = r.tether.star;
    const hot = r.grazing;
    const pulse = 0.5 + 0.5 * Math.sin(sc.time * 28);
    g.strokeStyle = sc.burnSoon ? `rgba(255,${60 + pulse * 60},${60 + pulse * 40},1)` : hot ? 'rgba(255,190,110,0.95)' : 'rgba(220,240,255,0.85)';
    g.lineWidth = sc.burnSoon ? 2.5 + pulse * 2 : hot ? 2.2 : 1.6;
    g.beginPath();
    g.moveTo(X(r.x), Y(r.y));
    g.lineTo(X(s.x), Y(s.y));
    g.stroke();
    if (sc.burnSoon) {
      // About to burn: the star's edge throbs red too (the tether is short by now and hides behind the comet).
      g.strokeStyle = `rgba(255,70,70,${0.55 + 0.45 * pulse})`;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(X(s.x), Y(s.y), (s.r + 1.2) * k + pulse * 3, 0, Math.PI * 2);
      g.stroke();
    }
    if (sc.grabT < 0.3) {
      g.strokeStyle = `rgba(255,255,255,${1 - sc.grabT / 0.3})`;
      g.lineWidth = 2;
      g.beginPath();
      g.arc(X(s.x), Y(s.y), (s.r + 2 + sc.grabT * 30) * k, 0, Math.PI * 2);
      g.stroke();
    }
  }
  if (sc.preview && sc.preview.length > 2) {
    const n = sc.preview.length / 2;
    const last = sc.hit ? n - 1 : n;
    if (sc.warn && !sc.hit) {
      // Amber: bright yellow dashes along the path, pulsing (not dots, so it never reads as a corona).
      const a = 0.85 + 0.15 * Math.sin(sc.time * 14);
      g.strokeStyle = `rgba(255,225,77,${a})`;
      g.lineWidth = 3;
      g.setLineDash([7, 6]);
      g.lineDashOffset = -sc.time * 40;
      g.beginPath();
      g.moveTo(X(sc.preview[0]), Y(sc.preview[1]));
      for (let i = 1; i < n; i++) g.lineTo(X(sc.preview[i * 2]), Y(sc.preview[i * 2 + 1]));
      g.stroke();
      g.setLineDash([]);
      g.lineDashOffset = 0;
    } else {
      for (let i = 1; i < last; i++) {
        g.fillStyle = sc.hit ? `rgba(255,90,90,${0.95 - 0.4 * (i / n)})` : `rgba(220,240,255,${0.75 * (1 - i / n)})`;
        g.beginPath();
        g.arc(X(sc.preview[i * 2]), Y(sc.preview[i * 2 + 1]), sc.hit ? 2.2 : 1.8, 0, Math.PI * 2);
        g.fill();
      }
    }
    if (sc.hit) {
      const hx = X(sc.hit.x), hy = Y(sc.hit.y), q = 7;
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 6;
      g.lineCap = 'round';
      for (const pass of [0, 1]) {
        if (pass) {
          g.strokeStyle = '#ff4d4d';
          g.lineWidth = 3;
        }
        g.beginPath();
        g.moveTo(hx - q, hy - q);
        g.lineTo(hx + q, hy + q);
        g.moveTo(hx + q, hy - q);
        g.lineTo(hx - q, hy + q);
        g.stroke();
      }
    }
  }

  // Close-shave rings: a faint ring shows how near counts as a shave, and lights up while you're inside it.
  if (r.alive) {
    const ring = (x: number, y: number, rad: number, clear: number) => {
      if (clear > NEAR + 7) return;
      const inside = clear < NEAR;
      g.strokeStyle = inside ? 'rgba(125,255,210,0.85)' : `rgba(125,255,210,${0.35 * (1 - (clear - NEAR) / 7)})`;
      g.lineWidth = inside ? 2 : 1.2;
      g.beginPath();
      g.arc(X(x), Y(y), rad * k, 0, Math.PI * 2);
      g.stroke();
    };
    for (let i = lowerY(stars, r.y - 20); i < stars.length && stars[i].y < r.y + 20; i++) {
      const s = stars[i];
      if (tethered === s || (s.id === r.last && r.since < REGRAB)) continue;
      ring(s.x, s.y, s.r + NEAR + COMET_R, Math.hypot(s.x - r.x, s.y - r.y) - s.r - COMET_R);
    }
    for (let i = lowerY(cs, r.y - 14); i < cs.length && cs[i].y < r.y + 14; i++) {
      const c = cs[i];
      const cx = cinderX(c, tick);
      ring(cx, c.y, c.r + NEAR_CINDER + COMET_R, Math.hypot(cx - r.x, c.y - r.y) - c.r - COMET_R - (NEAR_CINDER - NEAR));
    }
  }

  // Tail.
  const tr = sc.trail;
  const hot = r.grazing;
  const tailCol = hot ? [255, 170, 90] : r.mult >= 4 ? [255, 225, 120] : [160, 230, 255];
  // In six bands, each one stroke (fading and thinning toward the end), not one stroke per segment.
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const pts = tr.length / 2;
  const bands = 6;
  for (let b = 0; b < bands; b++) {
    const i0 = Math.floor((b * (pts - 1)) / bands), i1 = Math.floor(((b + 1) * (pts - 1)) / bands);
    if (i1 <= i0) continue;
    const f = (b + 1) / bands;
    g.strokeStyle = `rgba(${tailCol[0]},${tailCol[1]},${tailCol[2]},${f * 0.8})`;
    g.lineWidth = Math.max(1, f * COMET_R * k * 1.7);
    g.beginPath();
    g.moveTo(X(tr[i0 * 2]), Y(tr[i0 * 2 + 1]));
    for (let i = i0 + 1; i <= i1; i++) g.lineTo(X(tr[i * 2]), Y(tr[i * 2 + 1]));
    g.stroke();
  }

  // Comet.
  if (r.alive) {
    const cx = X(r.x), cy = Y(r.y);
    blit(g, glowSprite(g, COMET_R * k * 4, 0, [hot ? 'rgba(255,200,140,0.9)' : 'rgba(190,240,255,0.9)']), cx, cy, COMET_R * k * 4);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(cx, cy, COMET_R * k, 0, Math.PI * 2);
    g.fill();
    // The combo clock runs down in free flight.
    if (!r.tether && r.mult > 1 && r.link > 0) {
      const f = r.link / (2.6 * 240);
      g.strokeStyle = f < 0.3 ? 'rgba(255,110,110,0.95)' : 'rgba(255,225,120,0.85)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(cx, cy, COMET_R * k + 6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f);
      g.stroke();
    }
  }

  // Sparks.
  g.globalCompositeOperation = 'lighter';
  for (const p of sc.particles) {
    g.globalAlpha = Math.max(0, p.life / p.max);
    g.fillStyle = p.color;
    const s = p.size;
    g.fillRect(X(p.x) - s / 2, Y(p.y) - s / 2, s, s);
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  // The void.
  const near = Math.max(0, Math.min(1, 1 - (r.y - cam) / 45));
  const vh = (22 + near * 18) * k;
  // A 1-pixel-wide gradient strip per tenth of nearness, stretched across (cheaper than a gradient fill each frame).
  g.drawImage(voidStrip(Math.round(near * 10)), -20, h - vh, w + 40, vh + 20);
  g.strokeStyle = `rgba(255,120,150,${0.6 + near * 0.4})`;
  g.lineWidth = 2;
  g.beginPath();
  for (let x = 0; x <= w; x += 8) {
    const yy = h - 2 - Math.sin(x * 0.05 + sc.time * 3) * 2 - near * 3;
    if (x) g.lineTo(x, yy);
    else g.moveTo(x, yy);
  }
  g.stroke();

  // Floating points.
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const f of sc.floaters) {
    const a = Math.max(0, Math.min(1, (1.1 - f.t) * 3));
    const yy = Math.max(24, Y(f.y) - 20 - f.t * 40 - (f.stack ?? 0) * 34);
    g.globalAlpha = a;
    g.font = '800 17px system-ui, sans-serif';
    // Keep the whole text on screen, even right at a wall.
    const half = Math.max(g.measureText(f.text).width, f.sub ? f.sub.length * 6.5 : 0) / 2 + 6;
    const fx = Math.max(half, Math.min(w - half, X(f.x)));
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.strokeText(f.text, fx, yy);
    g.fillStyle = f.color;
    g.fillText(f.text, fx, yy);
    if (f.sub) {
      g.font = '700 12px system-ui, sans-serif';
      g.strokeText(f.sub, fx, yy + 16);
      g.fillText(f.sub, fx, yy + 16);
    }
  }
  g.globalAlpha = 1;

  // Coach line near the comet, prompt in the middle, zone banner.
  // Coaching sits low, over the void (what's down there is already behind you), and fades when the comet comes near.
  if (sc.coach && r.alive) {
    g.font = '700 15px system-ui, sans-serif';
    const cy = h - 26;
    g.globalAlpha = Y(r.y) > cy - 90 ? 0.35 : 1;
    pill(g, sc.coach, w / 2, cy, 'rgba(10,14,30,0.8)', '#ffffff', w);
    g.globalAlpha = 1;
  }
  if (sc.prompt) {
    const p = 0.75 + 0.25 * Math.sin(sc.time * 4);
    g.font = '800 20px system-ui, sans-serif';
    pill(g, sc.prompt, w / 2, h * 0.42, 'rgba(10,14,30,0.75)', `rgba(255,255,255,${p})`, w);
    // A thumb ring, pressing.
    g.strokeStyle = `rgba(255,255,255,${0.5 * p})`;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(w / 2, h * 0.42 + 56, 18 + 6 * Math.sin(sc.time * 4), 0, Math.PI * 2);
    g.stroke();
  }
  if (sc.banner) {
    const b = sc.banner;
    // A slim strip under the HUD, gone in under two seconds: it never hides what it introduces.
    const a = Math.max(0, Math.min(1, b.t * 5, (BANNER_S - b.t) * 2.5));
    g.globalAlpha = a;
    g.fillStyle = 'rgba(6,8,20,0.62)';
    g.fillRect(0, 0, w, 50);
    g.fillStyle = '#ffffff';
    g.font = '900 17px system-ui, sans-serif';
    g.fillText(b.title.toUpperCase(), w / 2, 16);
    g.font = '600 12.5px system-ui, sans-serif';
    g.fillStyle = '#d6dcff';
    g.fillText(b.sub, w / 2, 36);
    g.globalAlpha = 1;
  }
  if (sc.replay) {
    g.font = '800 13px system-ui, sans-serif';
    pill(g, '● REPLAY', 52, h - 64, 'rgba(255,60,90,0.85)', '#fff', w);
  }
  g.restore();

  if (sc.flash > 0) {
    g.fillStyle = `rgba(255,240,220,${sc.flash})`;
    g.fillRect(0, 0, w, h);
  }
}

// Glows are radial gradients rendered once into small sprites (keyed by size and colours) and stamped
// with drawImage: much cheaper per frame than building a gradient for every star.
const sprites = new Map<string, HTMLCanvasElement>();
function glowSprite(g: CanvasRenderingContext2D, R: number, r0: number, stops: string[]): HTMLCanvasElement {
  const scale = g.getTransform().a || 1;
  const px = Math.max(2, Math.round(R * scale));
  const key = `${px}|${Math.round(r0 * scale)}|${stops.join('|')}`;
  let c = sprites.get(key);
  if (!c) {
    if (sprites.size > 400) sprites.clear();
    c = document.createElement('canvas');
    c.width = c.height = px * 2;
    const q = c.getContext('2d')!;
    const gr = q.createRadialGradient(px, px, Math.min(px - 1, r0 * scale), px, px, px);
    if (stops.length === 2) {
      gr.addColorStop(0, stops[0]);
      gr.addColorStop(0.45, stops[1]);
    } else gr.addColorStop(0, stops[0]);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    q.fillStyle = gr;
    q.fillRect(0, 0, px * 2, px * 2);
    sprites.set(key, c);
  }
  return c;
}
function starSprite(g: CanvasRenderingContext2D, sr: number, band: number, cr: number, look: 'lit' | 'dim' | 'left', core: string, glow: string): HTMLCanvasElement {
  const scale = g.getTransform().a || 1;
  const R = sr + band + 6 * (cr / COMET_R);
  const px = Math.max(2, Math.ceil(R * scale));
  const key = `star|${px}|${Math.round(sr * scale * 4)}|${Math.round(band * scale)}|${look}|${core}`;
  let c = sprites.get(key);
  if (!c) {
    if (sprites.size > 400) sprites.clear();
    c = document.createElement('canvas');
    c.width = c.height = px * 2;
    const q = c.getContext('2d')!;
    q.setTransform(scale, 0, 0, scale, px, px);
    const dim = look === 'dim';
    const gr = q.createRadialGradient(0, 0, sr * 0.6, 0, 0, R);
    gr.addColorStop(0, dim ? 'rgba(80,120,160,0.25)' : glow + 'b8');
    gr.addColorStop(0.45, dim ? 'rgba(60,90,130,0.06)' : glow + '38');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    q.fillStyle = gr;
    q.fillRect(-R, -R, R * 2, R * 2);
    q.strokeStyle = dim ? 'rgba(120,160,200,0.18)' : 'rgba(255,220,170,0.28)';
    q.lineWidth = 1;
    q.setLineDash([3, 4]);
    q.beginPath();
    q.arc(0, 0, sr + band + cr, 0, Math.PI * 2);
    q.stroke();
    q.setLineDash([]);
    q.fillStyle = dim ? '#3a4a60' : look === 'left' ? '#c9b48a' : core;
    q.beginPath();
    q.arc(0, 0, sr, 0, Math.PI * 2);
    q.fill();
    if (!dim) {
      q.strokeStyle = glow;
      q.lineWidth = 1.5;
      q.stroke();
    }
    sprites.set(key, c);
  }
  return c;
}

function voidStrip(n10: number): HTMLCanvasElement {
  const key = `void|${n10}`;
  let c = sprites.get(key);
  if (!c) {
    const near = n10 / 10;
    c = document.createElement('canvas');
    c.width = 1;
    c.height = 128;
    const q = c.getContext('2d')!;
    // Drawn over vh + 20 px: the bottom 20/(vh+20) is solid, as the old fill below the screen edge was.
    const vg = q.createLinearGradient(0, 128, 0, 0);
    vg.addColorStop(0, `rgba(255,50,100,${0.55 + near * 0.35})`);
    vg.addColorStop(0.2, `rgba(255,50,100,${0.55 + near * 0.35})`);
    vg.addColorStop(0.2 + 0.8 * 0.35, `rgba(150,20,90,${0.25 + near * 0.25})`);
    vg.addColorStop(1, 'rgba(60,0,60,0)');
    q.fillStyle = vg;
    q.fillRect(0, 0, 1, 128);
    sprites.set(key, c);
  }
  return c;
}

const blit = (g: CanvasRenderingContext2D, c: HTMLCanvasElement, x: number, y: number, R: number) => g.drawImage(c, x - R, y - R, R * 2, R * 2);

function pill(g: CanvasRenderingContext2D, text: string, x0: number, y: number, bg: string, fg: string, w: number): void {
  const tw = g.measureText(text).width;
  const pw = tw + 24, ph = 32;
  const x = Math.max(pw / 2 + 6, Math.min(w - pw / 2 - 6, x0));
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(x - pw / 2, y - ph / 2, pw, ph, 16);
  g.fill();
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, x, y + 1);
}
