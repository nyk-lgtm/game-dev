// Scene illustrations: the player's only source of truth about what a
// sentence means. Everything is drawn with canvas paths in a virtual space
// W units wide (250 for panels, 210 for thumbnails so figures read larger),
// subject on the left acting toward the object on the right, destination at
// the far right. Tense, negation, plural and adjectives each get one
// consistent visual treatment (see drawScene).

import { CONCEPT } from '../core/concepts';
import type { Frame, NP } from '../core/sentence';
import type { Backdrop } from '../core/world';

type Pt = [number, number];

interface R {
  c: CanvasRenderingContext2D;
  W: number;
  H: number;
  /** Ground line where figures stand. */
  gy: number; small: boolean;
  /** Outline width in scene units. */
  lw: number;
  /** Accumulated scale of the current local transform (for line widths). */
  k: number;
  /** Outline-only dashed drawing (future tense, unfinished things). */
  ghost: boolean; ghostInk: string; ink: string; adj: string | undefined; t: number; seed: number;
}

const TAU = Math.PI * 2;
const INK = '#4a3326';
const ARROW = '#8a4e30';

function hash(n: number): number {
  let h = (n ^ 0x9e3779b9) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0; h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  h ^= h >>> 16; return (h >>> 0) / 4294967296;
}
const rnd = (r: R, i: number) => hash((r.seed * 31 + i * 7919 + 13) | 0);

// ---------------------------------------------------------------- colour

const rgbCache = new Map<string, number[]>();
function rgbOf(hex: string): number[] {
  let v = rgbCache.get(hex);
  if (!v) {
    const n = parseInt(hex.slice(1), 16); v = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; rgbCache.set(hex, v);
  }
  return v;
}
function mix(a: string, b: string, f: number): string {
  const A = rgbOf(a), B = rgbOf(b); const h = (i: number) => Math.round(A[i] + (B[i] - A[i]) * f).toString(16).padStart(2, '0');
  return '#' + h(0) + h(1) + h(2);
}
const toneCache = new Map<string, string>();
/** Adjective colouring: old = weathered grey, dark = deep indigo shadow, new = fresh. */
function tone(r: R, col: string): string {
  if (!r.adj || col[0] !== '#') return col; const key = col + r.adj; let v = toneCache.get(key);
  if (!v) {
    v = r.adj === 'old' ? mix(col, '#9d968a', 0.6) : r.adj === 'dark' ? mix(col, '#26233b', 0.68) : r.adj === 'new' ? mix(col, '#ffffff', 0.1) : col;
    toneCache.set(key, v);
  }
  return v;
}

// ---------------------------------------------------------------- primitives

function paint(r: R, fill: string | null, stroke = true): void {
  const c = r.c;
  if (r.ghost) {
    if (!stroke) return;
    c.setLineDash([5 / r.k, 3.5 / r.k]); c.lineWidth = (r.lw * 0.9) / r.k; c.strokeStyle = r.ghostInk; c.stroke(); c.setLineDash([]);
    return;
  }
  if (fill) {
    c.fillStyle = tone(r, fill); c.fill();
  }
  if (stroke) {
    c.lineWidth = r.lw / r.k; c.strokeStyle = r.ink; c.stroke();
  }
}
function circ(r: R, x: number, y: number, rad: number, fill: string | null, stroke = true) {
  r.c.beginPath(); r.c.arc(x, y, rad, 0, TAU); paint(r, fill, stroke);
}
function ell(r: R, x: number, y: number, rx: number, ry: number, fill: string | null, rot = 0, stroke = true) {
  r.c.beginPath(); r.c.ellipse(x, y, rx, ry, rot, 0, TAU); paint(r, fill, stroke);
}
function poly(r: R, p: number[], fill: string | null, stroke = true) {
  const c = r.c; c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.closePath();
  paint(r, fill, stroke);
}
/** Closed smooth curve through the midpoints of a polygon. */
function smooth(r: R, p: number[], fill: string | null, stroke = true) {
  const c = r.c, n = p.length / 2; const X = (i: number) => p[(i % n) * 2], Y = (i: number) => p[(i % n) * 2 + 1];
  c.beginPath(); c.moveTo((X(0) + X(1)) / 2, (Y(0) + Y(1)) / 2);
  for (let i = 1; i <= n; i++) c.quadraticCurveTo(X(i), Y(i), (X(i) + X(i + 1)) / 2, (Y(i) + Y(i + 1)) / 2); c.closePath();
  paint(r, fill, stroke);
}
function cap(r: R, x1: number, y1: number, x2: number, y2: number, rad: number, fill: string) {
  const c = r.c, a = Math.atan2(y2 - y1, x2 - x1);
  c.beginPath(); c.arc(x1, y1, rad, a + Math.PI / 2, a + Math.PI * 1.5); c.arc(x2, y2, rad, a - Math.PI / 2, a + Math.PI / 2); c.closePath();
  paint(r, fill);
}
function rr(r: R, x: number, y: number, w: number, h: number, rad: number | number[], fill: string | null, stroke = true) {
  r.c.beginPath(); r.c.roundRect(x, y, w, h, rad); paint(r, fill, stroke);
}
/** Cloud / foliage / hair-puff outline. */
function bumpy(r: R, cx: number, cy: number, rx: number, ry: number, n: number, b: number, fill: string, stroke = true, ph = 0) {
  const c = r.c; c.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = ph + (i / n) * TAU; const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry; if (i === 0) c.moveTo(x, y);
    else {
      const m = a - TAU / n / 2; c.quadraticCurveTo(cx + Math.cos(m) * rx * (1 + b), cy + Math.sin(m) * ry * (1 + b), x, y);
    }
  }
  c.closePath(); paint(r, fill, stroke);
}
/** A thick outlined stroke (tails, horns, staffs, handles). */
function tube(r: R, p: number[], width: number, color: string, curve = false) {
  const c = r.c; c.beginPath(); c.moveTo(p[0], p[1]); if (curve) c.quadraticCurveTo(p[2], p[3], p[4], p[5]);
  else for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]);
  if (r.ghost) {
    c.setLineDash([5 / r.k, 3.5 / r.k]); c.lineWidth = (r.lw * 0.9) / r.k; c.strokeStyle = r.ghostInk; c.stroke(); c.setLineDash([]);
    return;
  }
  c.strokeStyle = r.ink; c.lineWidth = width + (2 * r.lw) / r.k; c.stroke(); c.strokeStyle = tone(r, color); c.lineWidth = width; c.stroke();
}
/** An unoutlined detail stroke; skipped in ghost mode. */
function line(r: R, p: number[], color: string, width: number, curve = false) {
  if (r.ghost) return; const c = r.c; c.beginPath(); c.moveTo(p[0], p[1]); if (curve) c.quadraticCurveTo(p[2], p[3], p[4], p[5]);
  else for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.strokeStyle = tone(r, color); c.lineWidth = width; c.stroke();
}
function glow(r: R, x: number, y: number, rad: number, rgb: string, a: number) {
  if (r.ghost || r.adj === 'dark') return; const g = r.c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(1, `rgba(${rgb},0)`); r.c.fillStyle = g; r.c.beginPath(); r.c.arc(x, y, rad, 0, TAU); r.c.fill();
}
/** Run fn in a local frame at (x, y), rotated, scaled (dir = -1 mirrors). */
function at(r: R, x: number, y: number, sc: number, dir: number, rot: number, fn: () => void) {
  const c = r.c; c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.scale(sc * dir, sc); const k = r.k; r.k = k * sc; fn(); r.k = k;
  c.restore();
}
function mp(x: number, y: number, sc: number, dir: number, rot: number, p: Pt): Pt {
  const sx = p[0] * sc * dir, sy = p[1] * sc; const co = Math.cos(rot), si = Math.sin(rot);
  return [x + sx * co - sy * si, y + sx * si + sy * co];
}
function unmp(x: number, y: number, sc: number, dir: number, rot: number, p: Pt): Pt {
  const dx = p[0] - x, dy = p[1] - y; const co = Math.cos(-rot), si = Math.sin(-rot);
  return [(dx * co - dy * si) / (sc * dir), (dx * si + dy * co) / sc];
}

// ---------------------------------------------------------------- people

interface PS {
  h: number; hr: number; skin: string; body: string; legs: string; hem: number; shW: number; hemW: number;
}
const PEOPLE: Record<string, PS> = {
  ama: { h: 70, hr: 10.5, skin: '#d59c72', body: '#e6bd6a', legs: '#6e4630', hem: -6, shW: 8, hemW: 14 },
  tor: { h: 56, hr: 12, skin: '#ecbd92', body: '#f3e6c8', legs: '#8a5a3a', hem: -20, shW: 8.5, hemW: 11 },
  sef: { h: 70, hr: 10.5, skin: '#e0b08e', body: '#45707a', legs: '#4a4038', hem: -15, shW: 9.5, hemW: 13.5 },
  person: { h: 70, hr: 10.5, skin: '#c99068', body: '#a3936f', legs: '#6e5a46', hem: -16, shW: 8.5, hemW: 12.5 },
  child: { h: 44, hr: 14, skin: '#f0c49c', body: '#86b25e', legs: '#8a5a3a', hem: -18, shW: 8, hemW: 11.5 },
  elder: { h: 64, hr: 10.5, skin: '#d8ac88', body: '#8f7398', legs: '#5a4a40', hem: -8, shW: 8.5, hemW: 13.5 },
}; const PERSON_COLS = ['#a3936f', '#8f9c84', '#a98b78']; const CHILD_COLS = ['#86b25e', '#d9a650', '#7fa6b8'];

interface Pose {
  lean: number; stride: number; f: Pt; b: Pt; eyes: 'open' | 'closed' | 'wide'; mouth: 'smile' | 'o';
}
const pz = (lean: number, stride: number, f: Pt, b: Pt, eyes: Pose['eyes'] = 'open', mouth: Pose['mouth'] = 'smile'): Pose => ({ lean, stride, f, b, eyes, mouth });
const POSE: Record<string, Pose> = {
  stand: pz(0, 0, [6, 21], [-6, 21]),
  see: pz(0.04, 0.2, [7, 20], [-6, 21]),
  walk: pz(0.06, 1, [11, 17], [-10, 17]),
  carry: pz(0, 1, [17, 6], [14, 8]),
  hold: pz(0, 0, [17, 6], [14, 8]),
  give: pz(0.05, 0.5, [25, 1], [-6, 20]),
  receive: pz(-0.03, 0.2, [21, 0], [18, 3]),
  take: pz(-0.16, 0.7, [24, 4], [-12, 10]),
  eat: pz(0, 0, [0, 0], [-6, 21]),
  make: pz(0.16, 0.6, [19, 12], [16, 15]),
  fear: pz(-0.24, 0.8, [13, -17], [7, -20], 'wide', 'o'),
  find: pz(0.22, 0.6, [21, 17], [-9, 14], 'wide', 'o'),
  strike: pz(0.06, 0.8, [10, -25], [-7, 17]),
  lie: pz(0, 0, [14, 22], [-4, 20], 'closed'),
};

interface PG {
  hr: number; hy: number; sh: number; hf: Pt; hb: Pt; feet: Pt; eye: Pt; mouth: Pt;
}
function personGeo(n: string, pose: string, hand?: Pt): PG {
  const P = PEOPLE[n], ps = POSE[pose] ?? POSE.stand; const hr = P.hr, hy = -72 + hr, sh = hy + hr + 2; const sj: Pt = [2, sh + 4];
  let hf: Pt = [sj[0] + ps.f[0], sj[1] + ps.f[1]]; if (pose === 'eat') hf = [1 + hr * 1.4, hy + hr * 1.0];
  return { hr, hy, sh, hf: hand ?? hf, hb: [sj[0] + ps.b[0], sj[1] + ps.b[1]], feet: [4 + 8 * ps.stride, -4 - 7 * ps.stride], eye: [1 + hr * 0.4, hy - hr * 0.1], mouth: [1 + hr * 0.62, hy + hr * 0.42] };
}

function face(r: R, cx: number, cy: number, hr: number, eyes: Pose['eyes'], mouth: Pose['mouth'], beard: boolean) {
  if (r.ghost) return; const c = r.c;
  c.fillStyle = 'rgba(232,110,90,0.35)'; c.beginPath(); c.arc(cx + hr * 0.36, cy + hr * 0.36, hr * 0.2, 0, TAU); c.fill();
  const ink = r.adj === 'dark' ? '#f2e8d8' : INK;
  for (const ex of [cx + hr * 0.16, cx + hr * 0.62]) {
    const ey = cy - hr * 0.1; c.fillStyle = ink; c.strokeStyle = ink; c.lineWidth = Math.max(1, hr * 0.1);
    if (eyes === 'closed') {
      c.beginPath(); c.arc(ex, ey, hr * 0.15, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    } else if (eyes === 'wide') {
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ex, ey, hr * 0.2, 0, TAU); c.fill(); c.lineWidth = Math.max(0.8, hr * 0.07); c.stroke();
      c.fillStyle = ink; c.beginPath(); c.arc(ex + hr * 0.05, ey, hr * 0.1, 0, TAU); c.fill();
    } else {
      c.beginPath(); c.arc(ex, ey, Math.max(1.1, hr * 0.12), 0, TAU); c.fill();
    }
  }
  if (beard) return; c.beginPath();
  if (mouth === 'o') {
    c.ellipse(cx + hr * 0.5, cy + hr * 0.45, hr * 0.12, hr * 0.17, 0, 0, TAU); c.fillStyle = '#7a3a2a'; c.fill();
  } else {
    c.lineWidth = Math.max(0.9, hr * 0.09); c.arc(cx + hr * 0.45, cy + hr * 0.3, hr * 0.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  }
}

/** Hair covering the top and back of a head facing right. */
function hairCap(r: R, cx: number, cy: number, hr: number, col: string, low = 0.15) {
  const c = r.c; c.beginPath(); c.arc(cx, cy, hr * 1.06, Math.PI * (0.85 - low), Math.PI * 1.93);
  c.quadraticCurveTo(cx + hr * 0.1, cy - hr * 0.55, cx - hr * 0.5, cy + hr * 0.05); c.closePath(); paint(r, col);
}

function drawPerson(r: R, n: string, g: PG, pose: string, part: 'all' | 'body' | 'arm', v: number) {
  const P = PEOPLE[n], ps = POSE[pose] ?? POSE.stand; const { hr, hy, sh } = g;
  const body = n === 'person' ? PERSON_COLS[v % 3] : n === 'child' ? CHILD_COLS[v % 3] : P.body;
  const arm = (h: Pt, col: string) => {
    cap(r, 2, sh + 4, h[0], h[1], 3.5, col); circ(r, h[0], h[1], 3.2, P.skin);
  }; if (part === 'arm') return arm(g.hf, body); const c = r.c;
  if (n === 'elder' && pose !== 'lie') tube(r, [g.hb[0] + 1, g.hb[1] - 12, g.hb[0] - 1, Math.min(0, g.hb[1] + 46)], 3.4, '#8a6a48');
  arm(g.hb, mix(body, '#3a2a20', 0.18)); const [ff, bf] = g.feet;
  for (const fx of [bf, ff]) {
    cap(r, fx < 0 ? -3.5 : 3.5, P.hem - 2, fx, -3.5, 3.3, P.legs); ell(r, fx + 2.2, -2.4, 4.6, 2.6, '#4a3a30');
  }
  // body
  const { shW, hemW, hem } = P;
  c.beginPath(); c.moveTo(-shW, sh + 4); c.quadraticCurveTo(-shW, sh, -shW + 4, sh); c.lineTo(shW - 4, sh); c.quadraticCurveTo(shW, sh, shW, sh + 4);
  c.lineTo(hemW, hem - 2.5); c.quadraticCurveTo(hemW, hem, hemW - 3, hem); c.lineTo(-hemW + 3, hem); c.quadraticCurveTo(-hemW, hem, -hemW, hem - 2.5);
  c.closePath(); paint(r, body); if (n === 'tor') line(r, [-10, hem - 4, 10, hem - 4], '#b08a5a', 2.2);
  if (n === 'sef') for (let i = 0; i < 2; i++) circ(r, 4, sh + 9 + i * 8, 1.2, '#e8d8a0', false);
  if (n === 'ama') smooth(r, [-shW - 3, sh + 1, 0, sh - 2.5, shW + 3, sh + 1, shW + 2, sh + 12, 4, sh + 20, -shW - 2, sh + 14], '#c8463a');
  if (n === 'elder') line(r, [-12, hem - 6, 12, hem - 6], '#bfa6c6', 2.2);
  // head
  const cx = 1, cy = hy;
  if (n === 'ama') {
    ell(r, cx - hr * 0.2, cy - hr * 0.1, hr * 1.02, hr * 1.06, '#4a2c22'); circ(r, cx - hr * 0.95, cy - hr * 0.45, hr * 0.48, '#4a2c22');
  }
  if (n === 'elder') bumpy(r, cx - hr * 0.55, cy - hr * 0.15, hr * 0.72, hr * 0.85, 6, 0.28, '#f6f3ec'); circ(r, cx, cy, hr, P.skin);
  face(r, cx, cy, hr, ps.eyes, ps.mouth, n === 'sef');
  switch (n) {
    case 'ama':
      hairCap(r, cx, cy, hr, '#4a2c22', 0.05); break;
    case 'tor':
      hairCap(r, cx, cy, hr, '#7a4a2a', 0.1); c.beginPath(); c.arc(cx, cy - hr * 0.12, hr * 1.08, Math.PI, TAU); c.closePath();
      paint(r, '#2f6db3'); ell(r, cx + hr * 1.05, cy - hr * 0.16, hr * 0.78, hr * 0.24, '#245a9a');
      circ(r, cx, cy - hr * 1.18, hr * 0.15, '#245a9a'); break;
    case 'sef':
      ell(r, cx - hr * 0.75, cy + hr * 0.15, hr * 0.35, hr * 0.45, '#c9c4bb');
      smooth(r, [cx - hr * 0.15, cy + hr * 0.05, cx + hr * 1.0, cy + hr * 0.12, cx + hr * 0.9, cy + hr * 0.95, cx + hr * 0.4, cy + hr * 1.7, cx - hr * 0.1, cy + hr * 0.9], '#d2cdc5');
      line(r, [cx + hr * 0.25, cy + hr * 0.42, cx + hr * 0.55, cy + hr * 0.25, cx + hr * 0.9, cy + hr * 0.42], '#b0aaa0', hr * 0.16, true);
      c.beginPath(); c.arc(cx, cy - hr * 0.2, hr * 1.06, Math.PI, TAU); c.closePath(); paint(r, '#e4ae36');
      ell(r, cx - hr * 0.15, cy - hr * 0.22, hr * 1.7, hr * 0.32, '#d29a2c', 0.1); break;
    case 'person':
      hairCap(r, cx, cy, hr, '#6a4a34'); break;
    case 'child':
      hairCap(r, cx, cy, hr, '#8a5a30', 0.12);
      tube(r, [cx - hr * 0.1, cy - hr * 1.0, cx + hr * 0.2, cy - hr * 1.6, cx + hr * 0.55, cy - hr * 1.25], 2, '#8a5a30', true); break;
    case 'elder':
      line(r, [cx + hr * 0.02, cy - hr * 0.4, cx + hr * 0.3, cy - hr * 0.45], '#f6f3ec', hr * 0.16); break;
  }
  if (part === 'all') arm(g.hf, body);
}

// ---------------------------------------------------------------- animals

/** Head centre of an animal in a pose (shared by drawing and anchors). */
function animalHead(n: string, pose: string): Pt {
  const down = pose === 'eat' || pose === 'find';
  switch (n) {
    case 'dog':
      return pose === 'lie' ? [17, -10] : down ? [22, -12] : pose === 'fear' ? [14, -24] : [17, -29];
    case 'goat':
      return pose === 'lie' ? [20, -18] : down ? [25, -13] : [21, -37];
    case 'bird':
      return pose === 'lie' ? [6, -12] : down ? [10, -8] : [8, -19];
    default:
      return [8, -9];
  }
}
function animalAnchors(n: string, pose: string): { eye: Pt; mouth: Pt } {
  const [hx, hy] = animalHead(n, pose); if (n === 'dog') return { eye: [hx + 3, hy - 2], mouth: [hx + 11, hy + 3] };
  if (n === 'goat') return { eye: [hx + 1, hy - 2], mouth: [hx + 8, hy + 5] };
  if (n === 'bird') return { eye: [hx + 2, hy - 1], mouth: [hx + 10, hy + 1] }; return { eye: [hx, hy], mouth: [hx + 6, hy + 1] };
}
function eye(r: R, x: number, y: number, rad: number, closed: boolean, wide: boolean) {
  if (r.ghost) return; const c = r.c; c.fillStyle = c.strokeStyle = r.adj === 'dark' ? '#f2e8d8' : INK; c.beginPath();
  if (closed) {
    c.lineWidth = rad * 0.8; c.arc(x, y, rad * 1.2, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); return;
  }
  if (wide) {
    c.fillStyle = '#ffffff'; c.arc(x, y, rad * 1.8, 0, TAU); c.fill(); c.lineWidth = rad * 0.5; c.stroke(); c.fillStyle = INK; c.beginPath();
  }
  c.arc(x, y, rad, 0, TAU); c.fill();
}

function drawAnimal(r: R, n: string, pose: string) {
  const lie = pose === 'lie', fear = pose === 'fear'; const [hx, hy] = animalHead(n, pose);
  if (n === 'dog') {
    const col = '#c38a52', dark = '#8a5a34';
    if (!lie) {
      for (const [x, d] of [[-13, 1], [9, 1], [-7, 0], [14, 0]] as const) cap(r, x, fear ? -10 : -14, x + (x < 0 ? -1 : 1), -2.5, 2.9, d ? dark : col);
    }
    tube(r, fear ? [-15, -14, -19, -8, -17, -3] : lie ? [-16, -6, -22, -2, -10, -1] : [-15, -20, -21, -25, -22, -32], 3, col, true);
    ell(r, 0, lie ? -8.5 : fear ? -15 : -19, 17.5, lie ? 8.5 : 9, col); ell(r, 6, lie ? -6 : fear ? -12 : -16, 7, 4, '#ecd2ac', 0, false);
    circ(r, hx, hy, 8.5, col); ell(r, hx + 7, hy + 2.5, 5.5, 4, '#e0b88a'); circ(r, hx + 12, hy + 1.5, 2.1, INK, false);
    ell(r, hx - 3, hy + 1, 3.3, 6.8, dark, fear ? 1.3 : 0.35); eye(r, hx + 3, hy - 2, 1.5, lie, fear);
  } else if (n === 'goat') {
    const col = '#efe8da';
    if (!lie) {
      for (const [x, d] of [[-14, 1], [10, 1], [-8, 0], [16, 0]] as const) {
        cap(r, x, fear ? -14 : -18, x + (x < 0 ? -1 : 1), -2.5, 2.3, d ? '#d8cfbd' : col);
        rr(r, x - 2.5 + (x < 0 ? -1 : 1), -3.5, 5, 3.5, 1, '#5a4a40', false);
      }
    }
    ell(r, -19, lie ? -16 : -31, 3, 5, col, -0.5); rr(r, -20, lie ? -22 : fear ? -30 : -34, 40, 20, 10, col);
    ell(r, hx - 6, hy + 1, 5, 2.4, '#ddd3c0', -0.3); ell(r, hx, hy, 7.5, 6.5, col, 0.5); ell(r, hx + 5, hy + 4, 4.5, 4, col);
    poly(r, [hx + 2, hy + 8, hx + 6, hy + 8, hx + 3.5, hy + 15], '#d8cfbd');
    tube(r, [hx - 2, hy - 5, hx - 10, hy - 14, hx - 12, hy - 6], 3.4, '#9a8466', true); eye(r, hx + 1, hy - 2, 1.4, lie, fear);
  } else if (n === 'bird') {
    const col = '#4f8fc4', dark = '#3a72a8'; if (!lie) for (const x of [-2, 3]) line(r, [x, -5, x, 0, x + 2.5, 0], INK, 1.4);
    poly(r, [-8, -13, -17, -18, -16, -9], dark); ell(r, 0, lie ? -8 : -12, 10, lie ? 7 : 8.5, col);
    ell(r, 2.5, lie ? -6 : -9, 6, 4.5, '#f3d8aa', 0, false); circ(r, hx, hy, 6, col);
    poly(r, [hx + 5, hy - 2, hx + 11, hy + 0.5, hx + 5, hy + 2.5], '#f0a040'); ell(r, -2, lie ? -9 : -13, 7, 4.5, dark, -0.3);
    eye(r, hx + 2, hy - 1.5, 1.3, lie, fear);
  } else {
    // fish (also used held), centred on y = -9
    poly(r, [-9, -9, -18, -16, -18, -2], '#d9733e'); poly(r, [-2, -15, 5, -15, 1, -19], '#d9733e'); ell(r, 2, -9, 12.5, 7, '#ec8d52');
    ell(r, 3, -6.5, 8, 3, '#f6c08e', 0, false); line(r, [6, -14, 4, -9, 6, -4], '#c46430', 1.6, true); eye(r, 9, -10.5, 1.4, false, false);
  }
}

// ---------------------------------------------------------------- things, nature, places

function flame(r: R, x: number, y: number, s: number, outer: string, inner: string) {
  const c = r.c, f = Math.sin(r.t * 7 + x) * 1.2;
  const path = (k: number) => {
    c.beginPath(); c.moveTo(x + f * k, y - 34 * s * k); c.quadraticCurveTo(x + 4 * s * k, y - 22 * s * k, x + 12 * s * k, y - 12 * s * k);
    c.quadraticCurveTo(x + 14 * s * k, y, x, y); c.quadraticCurveTo(x - 14 * s * k, y, x - 12 * s * k, y - 12 * s * k);
    c.quadraticCurveTo(x - 4 * s * k, y - 22 * s * k, x + f * k, y - 34 * s * k);
  }; path(1); paint(r, outer); path(0.55); paint(r, inner, false);
}

function drawThing(r: R, n: string, reach: number, fierce: boolean) {
  const c = r.c, dark = r.adj === 'dark';
  switch (n) {
    case 'bread':
      smooth(r, [-15, -2, -14, -12, -4, -16.5, 7, -16, 14.5, -11, 15, -2, 8, 0.5, -8, 0.5], '#d99a4e');
      for (const i of [-1, 0, 1]) line(r, [i * 7 - 2, -13, i * 7 + 3, -7], '#f4d29a', 2.4); break;
    case 'basket':
      tube(r, [-10, -20, 0, -40, 10, -20], 2.6, '#a8743a', true);
      c.beginPath(); c.moveTo(-14, -21); c.lineTo(14, -21); c.lineTo(11, -2); c.quadraticCurveTo(10.5, 0, 8, 0); c.lineTo(-8, 0);
      c.quadraticCurveTo(-10.5, 0, -11, -2); c.closePath(); paint(r, '#d49d55'); line(r, [-12, -14, 12, -14], '#a8743a', 1.8);
      line(r, [-11, -7, 11, -7], '#a8743a', 1.8); for (let i = -2; i <= 2; i++) line(r, [i * 4.5, -20, i * 4.2, -1], '#b8843f', 1.2);
      rr(r, -15.5, -24, 31, 5, 2.5, '#b8803e'); break;
    case 'boat':
      tube(r, [0, -15, 0, -46], 2.6, '#7a5236');
      c.beginPath(); c.moveTo(3, -44); c.quadraticCurveTo(16, -30, 25, -18); c.lineTo(3, -18); c.closePath(); paint(r, '#f4ead2');
      c.beginPath(); c.moveTo(-34, -17); c.lineTo(34, -17); c.quadraticCurveTo(30, 0, 18, 0); c.lineTo(-18, 0); c.quadraticCurveTo(-30, 0, -34, -17);
      paint(r, '#ab6a3e'); line(r, [-29, -11, 29, -11], '#f2dcb2', 2.8); break;
    case 'fire':
      glow(r, 0, -16, 32, '255,180,80', 0.5); cap(r, -13, -3, 13, -8, 3.5, '#8a5a3a'); cap(r, -13, -8, 13, -3, 3.5, '#7a4e32');
      flame(r, 0, -5, 1, dark ? '#7a5a5a' : '#ef7f3a', dark ? '#8a7060' : '#f8cd52'); break;
    case 'lamp':
      glow(r, 0, -16, 28, '255,214,120', 0.55); tube(r, [-5, -29, 0, -40, 5, -29], 1.8, '#6a5a4a', true);
      poly(r, [-8, -24, 8, -24, 5, -30, -5, -30], '#7a6a58'); rr(r, -7, -24, 14, 17, 3, dark ? '#4e4d60' : '#f9dc84');
      if (!dark) flame(r, 0, -11, 0.3, '#f08a3a', '#fff0a0'); line(r, [0, -23, 0, -8], '#7a6a58', 1.2); rr(r, -9, -8, 18, 8, 2, '#7a6a58');
      break;
    case 'stone':
      smooth(r, [-15, -2, -13.5, -11, -4, -18, 7, -17, 14.5, -10, 15, -2, 6, 0.5, -6, 0.5], '#a7a196');
      ell(r, -3, -12, 5, 2.4, '#c9c4b9', -0.3, false); circ(r, 6, -6, 1.2, '#857f75', false); circ(r, -6, -5, 1, '#857f75', false); break;
    case 'sun':
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + r.t * 0.15;
        poly(r, [Math.cos(a - 0.17) * 17, Math.sin(a - 0.17) * 17, Math.cos(a) * 25, Math.sin(a) * 25, Math.cos(a + 0.17) * 17, Math.sin(a + 0.17) * 17], '#f3b94a');
      }
      circ(r, 0, 0, 15.5, '#f7cd55'); break;
    case 'moon': {
      circ(r, 0, 0, 23, '#4a5a8c'); c.save(); c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.clip(); circ(r, 0, 0, 14, '#f6e6a2', false);
      circ(r, 7, -4, 12.5, '#4a5a8c', false);
      if (!r.ghost) {
        c.lineWidth = (r.lw * 2) / r.k; c.strokeStyle = r.ink;
        for (const [x, y, rad] of [[0, 0, 14], [7, -4, 12.5]]) {
          c.beginPath(); c.arc(x, y, rad, 0, TAU); c.stroke();
        }
      }
      c.restore(); if (!r.ghost) for (const [x, y] of [[-13, -12], [13, 11], [16, -6]]) star4(r, x, y, 2.6, '#f6e6a2', null); break;
    }
    case 'rain': {
      const rows = Math.max(2, Math.floor(reach / 14));
      for (let j = 0; j < rows; j++)
        for (let i = 0; i < 6; i++) {
          const y = 16 + ((j * 14 + i * 5 + r.t * 30) % (rows * 14)); const x = -22 + i * 9 + (j % 2) * 4 - y * 0.15;
          line(r, [x, y, x - (fierce ? 3 : 2), y + (fierce ? 9 : 6)], '#5b8fd0', fierce ? 3 : 2.4);
        }
      bumpy(r, 0, 0, 30, 13, 7, 0.4, fierce ? '#a3aebd' : '#bcc6d2'); break;
    }
    case 'tree':
      c.beginPath(); c.moveTo(-7, 0); c.quadraticCurveTo(-4, -22, -5, -46); c.lineTo(5, -46); c.quadraticCurveTo(4, -22, 8, 0); c.closePath();
      paint(r, '#8a6242'); bumpy(r, 0, -66, 28, 26, 9, 0.28, '#78a656'); circ(r, -9, -74, 7, '#95c06d', false);
      circ(r, 10, -60, 5, '#95c06d', false); break;
    case 'river': {
      // Seen in perspective: narrow far away (upper right), wide near (lower left).
      const at = (t: number): Pt => [44 - 76 * t + Math.sin(t * 4.2) * 8, -46 + 86 * t]; const hw = (t: number) => 6 + 40 * t * t;
      const L: number[] = [], Rr: number[] = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10, [cx, cy] = at(t); L.push(cx - hw(t), cy); Rr.unshift(cx + hw(t), cy);
      }
      poly(r, [...L, ...Rr], fierce ? '#4f8cc4' : '#74aede');
      for (let i = 0; i < 5; i++) {
        const t = 0.3 + i * 0.15, [cx, cy] = at(t), w = hw(t) * 0.55, o = Math.sin(r.t * 2 + i) * 2;
        line(r, [cx - w + o, cy, cx - w * 0.5 + o, cy - 3, cx + o, cy, cx + w * 0.5 + o, cy - 3, cx + w + o, cy], '#e6f3fb', 2 + t);
        if (fierce) for (const sd of [-1, 1]) bumpy(r, cx + sd * hw(t) * 0.95, cy - 2, 3 + t * 4, 2.5 + t * 3, 5, 0.5, '#f4f8fa');
      }
      break;
    }
    case 'house': {
      const lit = !dark; rr(r, 12, -68, 8, 16, 1, '#a86a4a'); rr(r, -27, -43, 54, 43, 2, '#ecd9b5');
      c.beginPath(); c.moveTo(-35, -40); c.lineTo(0, -71); c.lineTo(35, -40); c.closePath(); paint(r, '#bb5b3d');
      rr(r, -18, -25, 12, 25, [6, 6, 0, 0], '#8a5a3a'); if (lit) glow(r, 12.5, -26, 14, '255,210,110', 0.5);
      rr(r, 6, -33, 13, 13, 2, lit ? '#f8d57c' : '#3a394f'); line(r, [12.5, -33, 12.5, -20], INK, 1.2);
      line(r, [6, -26.5, 19, -26.5], INK, 1.2); break;
    }
    case 'mountain':
      c.beginPath(); c.moveTo(-78, 0); c.lineTo(-24, -88); c.quadraticCurveTo(-4, -126, 4, -124); c.lineTo(20, -100); c.lineTo(78, 0); c.closePath();
      paint(r, '#a29db8', false); poly(r, [4, -124, 20, -100, 78, 0, 14, 0], '#8e88a6', false);
      c.beginPath(); c.moveTo(-78, 0); c.lineTo(-24, -88); c.quadraticCurveTo(-4, -126, 4, -124); c.lineTo(20, -100); c.lineTo(78, 0);
      paint(r, null); poly(r, [-17, -100, -4, -122, 4, -124, 16, -106, 9, -103, 3, -110, -4, -101, -10, -106], '#f8f6f2'); break;
    case 'market': {
      tube(r, [-37, 0, -37, -70], 3.2, '#8a6040'); tube(r, [37, 0, 37, -70], 3.2, '#8a6040');
      for (const [x, col] of [[-26, '#e0703a'], [-15, '#f0b840'], [-4, '#8fb455'], [8, '#e0703a'], [19, '#f0b840'], [29, '#8fb455']] as const) circ(r, x, -33, 5, col);
      rr(r, -41, -30, 82, 30, 2, '#b98a5c'); line(r, [-41, -16, 41, -16], '#9a6e44', 1.6);
      const aw = () => {
        c.beginPath(); c.moveTo(-45, -82); c.lineTo(45, -82); c.lineTo(45, -69);
        for (let i = 0; i < 6; i++) c.quadraticCurveTo(45 - i * 15 - 7.5, -60, 45 - (i + 1) * 15, -69); c.closePath();
      }; aw(); paint(r, '#f5e8d0', false);
      if (!r.ghost) {
        c.save(); aw(); c.clip(); c.fillStyle = tone(r, '#d9614a'); for (let i = 0; i < 6; i++) c.fillRect(-45 + i * 15, -84, 7.5, 30);
        c.restore();
      }
      aw(); paint(r, null); break;
    }
  }
}

// ---------------------------------------------------------------- nouns in the scene

const cat = (n: string) => CONCEPT.get(n)?.cat ?? 'thing'; const isAgent = (n: string) => n in PEOPLE;
const isAnimal = (n: string) => cat(n) === 'animal'; const SKY = new Set(['sun', 'moon', 'rain']);
const DIM: Record<string, Pt> = {
  dog: [50, 34], goat: [56, 50], bird: [28, 25], fish: [34, 18],
  bread: [30, 17], basket: [31, 40], boat: [68, 46], fire: [32, 38], lamp: [20, 40], stone: [30, 19],
  sun: [50, 50], moon: [48, 48], rain: [64, 34], tree: [62, 96], river: [90, 84],
  house: [70, 72], mountain: [156, 126], market: [90, 82],
};
/** Picture-book exaggeration: small things and animals drawn larger than life so they read. */
const BASE: Record<string, number> = { bread: 1.35, basket: 1.2, lamp: 1.3, stone: 1.35, fish: 1.3, fire: 1.25, bird: 1.3, dog: 1.2, goat: 1.1 };
function dims(n: string): Pt {
  if (isAgent(n)) return [(30 * PEOPLE[n].h) / 72, PEOPLE[n].h]; const [w, h] = DIM[n] ?? [30, 30], b = BASE[n] ?? 1; return [w * b, h * b];
}
const adjScale = (np: NP) => (np.adj === 'big' ? 1.65 : np.adj === 'small' ? 0.52 : 1);
function sizeOf(np: NP): Pt {
  if (np.n === 'Q') return [30, 28]; const [w, h] = dims(np.n), s = adjScale(np); return [w * s, h * s];
}

interface Got {
  x0: number; y0: number; x1: number; y1: number; cx: number; cy: number; eye: Pt; mouth: Pt; hand: Pt;
}
interface PO {
  pose?: string; dir?: number; scale?: number;
  /** Called after the body and before the front arm (agents), so the hand grips the item. */
  held?: (g: Got) => void; heldAll?: boolean; handAt?: Pt; dry?: boolean; layout?: 'trail' | 'pile' | 'stack'; broken?: boolean;
  half?: boolean; outline?: boolean; bite?: boolean; fierce?: boolean; q?: Pt; rot?: number;
}

function qShape(r: R, x: number, y: number, [w, h]: Pt, dry: boolean | undefined, centred = false): Got {
  const y0 = centred ? y - h / 2 : y - h;
  if (!dry) {
    const c = r.c;
    c.beginPath(); c.roundRect(x - w / 2, y0, w, h, Math.min(w, h) * 0.4); c.fillStyle = 'rgba(255,252,240,0.55)'; c.fill(); c.setLineDash([5, 4]);
    c.lineWidth = r.lw * 1.2; c.strokeStyle = INK; c.stroke(); c.setLineDash([]); c.fillStyle = INK;
    c.font = `bold ${Math.min(w, h) * 0.85}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', x, y0 + h * 0.54);
  }
  const cy = y0 + h / 2;
  return { x0: x - w / 2, y0, x1: x + w / 2, y1: y0 + h, cx: x, cy, eye: [x + w * 0.2, y0 + h * 0.2], mouth: [x + w / 2, y0 + h * 0.3], hand: [x + w / 2, cy] };
}

/** Place a noun phrase with its base (feet / bottom centre; centre for sky things) at (x, y). */
function place(r: R, np: NP, x: number, y: number, o: PO = {}): Got {
  if (np.n === 'Q') return qShape(r, x, y, o.q ?? [34, 34], o.dry, SKY.has(np.n)); const prev = r.adj; r.adj = np.adj;
  let sc = adjScale(np) * (o.scale ?? 1); const dir = o.dir ?? 1; const [w, h] = dims(np.n);
  let mem: [number, number, number][] = [[0, 0, 1]];
  if (np.pl) {
    const lie = o.pose === 'lie'; let f = o.layout === 'stack' ? 0.4 : 0.62;
    if (o.layout !== 'stack') {
      // A group of three may not take over the scene: overlap more, then shrink a little
      // (never much, or it would read as "small"). Big groups get more room.
      const bw = (lie ? 80 : w) * sc, cap = r.W * 0.44 * (np.adj === 'big' ? 1.3 : 1);
      if ((1 + 2 * f) * bw > cap) f = Math.max(0.4, (cap / bw - 1) / 2);
      if ((1 + 2 * f) * bw > cap) sc *= Math.max(0.8, cap / ((1 + 2 * f) * bw));
    }
    const d = (lie ? h : w) * sc * f * dir;
    mem =
      o.layout === 'trail' ? [[-2 * d, -8, 0.9], [-d, -4, 0.95], [0, 0, 1]]
      : o.layout === 'stack' ? [[-d, 0, 0.72], [d, 0, 0.72], [0, -h * sc * 0.6, 0.72]]
      : [[-d, -7, 0.88], [d, -7, 0.88], [0, 0, 1]];
  }
  if (np.pl && o.layout !== 'stack') {
    // Keep the whole group inside the frame.
    const half = ((o.pose === 'lie' ? 80 : w) * sc) / 2;
    const lo = Math.min(...mem.map((m) => m[0])) - half, hi = Math.max(...mem.map((m) => m[0])) + half;
    x += Math.max(0, 14 - (x + lo)) - (o.layout === 'trail' ? Math.max(0, x + hi - (r.W - 14)) : 0);
  }
  let front!: Got; const box = [1e9, 1e9, -1e9, -1e9];
  mem.forEach(([dx, dy, ms], i) => {
    const isFront = i === mem.length - 1; const g = one(r, np.n, x + dx, y + dy, sc * ms, o, i, isFront); box[0] = Math.min(box[0], g.x0);
    box[1] = Math.min(box[1], g.y0); box[2] = Math.max(box[2], g.x1); box[3] = Math.max(box[3], g.y1); front = g;
  }); r.adj = prev;
  return { ...front, x0: box[0], y0: box[1], x1: box[2], y1: box[3], cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2 };
}

function one(r: R, n: string, x: number, y: number, sc: number, o: PO, v: number, isFront: boolean): Got {
  const dir = o.dir ?? 1, pose = o.pose ?? 'stand'; const [w, h] = dims(n); const sky = SKY.has(n);
  const bs = isAgent(n) ? 1 : BASE[n] ?? 1; let got: Got; let body: () => void;
  if (isAgent(n)) {
    const P = PEOPLE[n], ps = (sc * P.h) / 72, lie = pose === 'lie'; const lean = (POSE[pose]?.lean ?? 0) + (n === 'elder' ? 0.07 : 0);
    let bx = x, by = y, rot = lean * dir;
    if (lie) {
      rot = (-Math.PI / 2) * dir; bx = x + 36 * ps * dir; by = y - 14 * ps;
    }
    const hand = isFront && o.handAt ? unmp(bx, by, ps, dir, rot, o.handAt) : undefined; const g = personGeo(n, pose, hand);
    const M = (p: Pt) => mp(bx, by, ps, dir, rot, p); const top = M([1, g.hy - g.hr * 1.2]);
    got = lie
      ? { x0: x - 40 * ps, y0: y - 30 * ps, x1: x + 40 * ps, y1: y, cx: x, cy: y - 15 * ps, eye: M(g.eye), mouth: M(g.mouth), hand: M(g.hf) }
      : { x0: x - (w * sc) / 2, y0: top[1], x1: x + (w * sc) / 2, y1: y, cx: x, cy: y - (h * sc) / 2, eye: M(g.eye), mouth: M(g.mouth), hand: M(g.hf) };
    if (o.dry) return got; const held = o.held && (isFront || o.heldAll) ? o.held : null;
    at(r, bx, by, ps, dir, rot, () => {
      if (!lie) return drawPerson(r, n, g, pose, held ? 'body' : 'all', v);
      // Asleep on a mat: pillow under the head, striped blanket up to the chest, arm on top.
      rr(r, -18, g.hy - g.hr - 10, 5, 18 - g.hy + g.hr, 2.5, '#d8c7a0'); ell(r, 1 - g.hr - 3, g.hy, 5, g.hr * 1.15, '#f3ead6');
      drawPerson(r, n, g, pose, 'body', v); rr(r, -15, g.sh + 7, 33, -g.sh - 4, 8, '#7d9fc4');
      for (let i = 1; i < 4; i++) line(r, [-13, g.sh + 7 + ((-g.sh - 4) * i) / 4, 16, g.sh + 7 + ((-g.sh - 4) * i) / 4], '#f0e6d0', 2.4);
    });
    if (held) {
      held(got); at(r, bx, by, ps, dir, rot, () => drawPerson(r, n, g, pose, 'arm', v));
    }
    return got;
  }
  if (isAnimal(n)) {
    const ap = pose === 'fear' || pose === 'lie' || pose === 'eat' || pose === 'find' ? pose : pose === 'take' ? 'stand' : 'stand';
    const rot = (pose === 'take' ? -0.12 : 0) * dir; const a = animalAnchors(n, ap); const M = (p: Pt) => mp(x, y, sc * bs, dir, rot, p);
    got = { x0: x - (w * sc) / 2, y0: y - h * sc, x1: x + (w * sc) / 2, y1: y, cx: x, cy: y - (h * sc) / 2, eye: M(a.eye), mouth: M(a.mouth), hand: M(a.mouth) };
    if (o.dry) return got; body = () => at(r, x, y, sc * bs, dir, rot, () => drawAnimal(r, n, ap));
  } else {
    const y0 = sky ? y - (h * sc) / 2 : y - h * sc; const cx = n === 'river' ? x + 6 * sc : x;
    got = { x0: x - (w * sc) / 2, y0, x1: x + (w * sc) / 2, y1: y0 + h * sc, cx, cy: y0 + (h * sc) / 2, eye: [cx, y0 + h * sc * 0.4], mouth: [cx, y0], hand: [x + (w * sc) / 2, y0 + (h * sc) / 2] };
    if (n === 'river') got = { ...got, y0: y - 46 * sc, y1: y + 40 * sc, cy: y - 6 * sc }; if (o.dry) return got;
    const reach = (r.gy - y) / sc - 10;
    const rot = (o.rot ?? 0) + (o.layout === 'pile' && !SKY.has(n) && cat(n) === 'thing' ? (v - 1) * 0.07 : 0);
    body = () => at(r, x, y, sc * bs, dir, rot, () => drawThing(r, n, reach, !!o.fierce));
  }
  if (r.adj === 'dark' && !r.ghost) {
    const rad = Math.max(got.x1 - got.x0, got.y1 - got.y0) * 0.75;
    const g = r.c.createRadialGradient(got.cx, got.cy, rad * 0.2, got.cx, got.cy, rad); g.addColorStop(0, 'rgba(38,32,64,0.5)');
    g.addColorStop(1, 'rgba(38,32,64,0)'); r.c.fillStyle = g; r.c.beginPath();
    r.c.ellipse(got.cx, got.cy, rad, rad * 0.85, 0, 0, TAU); r.c.fill();
  }
  const c = r.c;
  if (o.broken) {
    // Split down a jagged crack; the halves tilt apart.
    const mx = got.cx, t0 = got.y0 - 30, t1 = got.y1 + 30, jag: number[] = [];
    for (let i = 0; i <= 6; i++) jag.push(mx + (i % 2 ? 4 : -3) * sc, t0 + ((t1 - t0) * i) / 6);
    for (const s of [-1, 1]) {
      c.save(); c.beginPath(); c.moveTo(mx + s * 400, t0); for (let i = 0; i < jag.length; i += 2) c.lineTo(jag[i], jag[i + 1]);
      c.lineTo(mx + s * 400, t1); c.closePath(); c.clip(); c.translate(mx + s * 6, got.y1); c.rotate(s * 0.2); c.translate(-mx, -got.y1);
      body(); c.restore();
    }
  } else if (o.half && isFront) {
    const my = got.y0 + (got.y1 - got.y0) * 0.5; c.save(); c.beginPath(); c.rect(got.x0 - 60, my, got.x1 - got.x0 + 120, 400); c.clip();
    body(); c.restore(); c.save(); c.beginPath(); c.rect(got.x0 - 60, my - 400, got.x1 - got.x0 + 120, 400); c.clip(); const gh = r.ghost;
    r.ghost = true; body(); r.ghost = gh; c.restore();
  } else if (o.outline) {
    const gh = r.ghost; r.ghost = true; body(); r.ghost = gh;
  } else if (o.bite && isFront) {
    const bx = dir < 0 ? got.x0 + 1 : got.x1 - 1, by = got.cy - (got.y1 - got.y0) * 0.15, br = (got.y1 - got.y0) * 0.42;
    c.save(); c.beginPath(); c.rect(-1e4, -1e4, 2e4, 2e4); c.moveTo(bx + br, by); c.arc(bx, by, br, 0, TAU); c.clip('evenodd'); body();
    c.restore();
    if (!r.ghost) {
      c.save(); c.beginPath(); c.ellipse(got.cx, got.cy, (got.x1 - got.x0) * 0.48, (got.y1 - got.y0) * 0.46, 0, 0, TAU); c.clip(); c.beginPath();
      c.arc(bx, by, br, 0, TAU); c.lineWidth = r.lw; c.strokeStyle = INK; c.stroke(); c.restore();
    }
  } else body(); adjMarks(r, n, got, v); return got;
}

/** Extra marks for adjectives: cracks for old things, sparkles for new ones. */
function adjMarks(r: R, n: string, g: Got, v: number) {
  const c = r.c, bw = g.x1 - g.x0, bh = g.y1 - g.y0;
  if (r.adj === 'old' && !isAgent(n) && !isAnimal(n) && n !== 'river') {
    c.strokeStyle = '#3a2a20'; c.lineWidth = r.lw * 0.8;
    for (let k = 0; k < 2; k++) {
      let x = g.x0 + bw * (0.3 + 0.4 * k + (rnd(r, v * 9 + k) - 0.5) * 0.1), y = g.y0 + bh * (0.3 + 0.15 * k);
      c.beginPath(); c.moveTo(x, y);
      for (let i = 0; i < 3; i++) {
        x += (i % 2 ? 1 : -1) * bw * 0.08; y += bh * 0.14; c.lineTo(x, y);
      }
      c.stroke();
    }
  }
  if (r.adj === 'new') {
    const tw = (0.85 + 0.15 * Math.sin(r.t * 3 + v)) * (r.small ? 1.35 : 1);
    line(r, [g.x0 + bw * 0.3, g.y0 + bh * 0.55, g.x0 + bw * 0.45, g.y0 + bh * 0.3], '#ffffff', r.lw * 1.2);
    star4(r, g.x1 + 2, g.y0 + 4, 8 * tw, '#fff6c0', '#c8962a'); star4(r, g.x0 - 2, g.y0 + bh * 0.35, 6 * tw, '#fff6c0', '#c8962a');
    star4(r, g.x1 + 1, g.y1 - bh * 0.3, 4.5 * tw, '#fff6c0', '#c8962a');
  }
}

// ---------------------------------------------------------------- marks

function star4(r: R, x: number, y: number, s: number, fill: string, stroke: string | null) {
  const c = r.c;
  c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y);
  c.quadraticCurveTo(x, y, x, y - s); c.fillStyle = fill; c.fill();
  if (stroke) {
    c.strokeStyle = stroke; c.lineWidth = r.lw * 0.6; c.stroke();
  }
}
const mid = (a: Pt, b: Pt): Pt => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
function arrowHead(r: R, x: number, y: number, ang: number, s: number, col: string) {
  const c = r.c;
  c.beginPath(); c.moveTo(x + Math.cos(ang) * s, y + Math.sin(ang) * s); c.lineTo(x + Math.cos(ang + 2.5) * s, y + Math.sin(ang + 2.5) * s);
  c.lineTo(x + Math.cos(ang - 2.5) * s, y + Math.sin(ang - 2.5) * s); c.closePath(); c.fillStyle = col; c.fill();
}
/** Curved arrow a -> b bulging by `bend` (negative = up). */
function arrow(r: R, a: Pt, b: Pt, bend: number, col: string, dash: number[] = [], width = 1.5) {
  const c = r.c; const m = mid(a, b), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const cp: Pt = [m[0] - (dy / L) * bend, m[1] + (dx / L) * bend]; const hs = r.lw * 3.4;
  const ang = Math.atan2(b[1] - cp[1], b[0] - cp[0]); const end: Pt = [b[0] - Math.cos(ang) * hs * 0.6, b[1] - Math.sin(ang) * hs * 0.6];
  c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo(cp[0], cp[1], end[0], end[1]); c.setLineDash(dash.map((d) => d * r.lw * 0.5));
  c.strokeStyle = col; c.lineWidth = r.lw * width; c.lineCap = 'round'; c.stroke(); c.setLineDash([]);
  arrowHead(r, b[0] - Math.cos(ang) * hs * 0.2, b[1] - Math.sin(ang) * hs * 0.2, ang, hs, col);
  // Point at the arrow's middle, for the "not" emblem.
  return [0.25 * a[0] + 0.5 * cp[0] + 0.25 * b[0], 0.25 * a[1] + 0.5 * cp[1] + 0.25 * b[1]] as Pt;
}
function sight(r: R, e: Pt, g: Got): Pt {
  const t: Pt = [g.cx, g.cy]; const L = Math.hypot(t[0] - e[0], t[1] - e[1]); const stop = Math.min(g.x1 - g.x0, g.y1 - g.y0) * 0.5 + 5;
  const f = Math.max(0.3, (L - stop) / L); const b: Pt = [e[0] + (t[0] - e[0]) * f, e[1] + (t[1] - e[1]) * f];
  const a: Pt = [e[0] + (t[0] - e[0]) * (6 / L), e[1] + (t[1] - e[1]) * (6 / L)]; return arrow(r, a, b, 0, '#3f5f95', [1.2, 2.6], 1.3);
}
function text(r: R, s: string, x: number, y: number, size: number, col: string, alpha = 1) {
  const c = r.c;
  c.globalAlpha *= alpha; c.font = `bold ${size}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = size * 0.22;
  c.strokeStyle = '#fffaf0'; c.strokeText(s, x, y); c.fillStyle = col; c.fillText(s, x, y); c.globalAlpha /= alpha;
}
function zzz(r: R, x: number, y: number, alpha = 1) {
  const sz = r.small ? 1.35 : 1;
  for (let i = 0; i < 3; i++) {
    const b = Math.sin(r.t * 2 + i) * 1.5; text(r, 'z', x + i * 11 * sz, y - i * 11 * sz + b, (10 + i * 4) * sz, '#4b5c9a', alpha);
  }
}
function drop(r: R, x: number, y: number, s: number) {
  const c = r.c; c.beginPath(); c.moveTo(x, y - s * 1.6); c.quadraticCurveTo(x + s, y - s * 0.2, x, y + s * 0.6);
  c.quadraticCurveTo(x - s, y - s * 0.2, x, y - s * 1.6); c.fillStyle = '#86c3ee'; c.fill(); c.strokeStyle = '#3f6f9a'; c.lineWidth = r.lw * 0.6;
  c.stroke();
}
function strokes(r: R, segs: number[][], col: string, width: number) {
  const c = r.c; c.strokeStyle = col; c.lineWidth = r.lw * width; c.lineCap = 'round';
  for (const s of segs) {
    c.beginPath(); c.moveTo(s[0], s[1]); if (s.length === 6) c.quadraticCurveTo(s[2], s[3], s[4], s[5]); else c.lineTo(s[2], s[3]);
    c.stroke();
  }
}
function burst(r: R, x: number, y: number, s: number) {
  const c = r.c; c.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * TAU, rad = i % 2 ? s * 0.45 : s; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  c.closePath(); c.fillStyle = '#ffe48a'; c.fill(); c.strokeStyle = '#c0582a'; c.lineWidth = r.lw * 0.9; c.stroke();
}
function hammer(r: R, h: Pt, ang: number) {
  at(r, h[0], h[1], 1, 1, ang, () => {
    tube(r, [0, 4, 0, -15], 2.4, '#8a6040'); rr(r, -7, -21, 14, 7, 2, '#8e9098');
  });
}
function footsteps(r: R, x: number, n: number) {
  const c = r.c; c.fillStyle = 'rgba(110,80,50,0.45)';
  for (let i = 0; i < n; i++) {
    c.beginPath(); c.ellipse(x - i * 13, r.gy + 3 + (i % 2 ? 4 : -1), 4, 2, 0, 0, TAU); c.fill();
  }
}
function speed(r: R, x: number, y0: number, y1: number, len: number, dir = -1) {
  const segs: number[][] = [];
  for (let i = 0; i < 3; i++) {
    const y = y0 + ((y1 - y0) * (i + 0.5)) / 3, l = len * (i === 1 ? 1 : 0.7); segs.push([x, y, x + dir * l, y]);
  }
  strokes(r, segs, 'rgba(90,60,40,0.55)', 1.1);
}
function spikes(r: R, g: Got) {
  const segs: number[][] = []; const cx = g.cx, cy = g.cy, rx = (g.x1 - g.x0) / 2 + 8, ry = (g.y1 - g.y0) / 2 + 6;
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (1.05 + i * 0.15);
    const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry, ox = Math.cos(a) * 9, oy = Math.sin(a) * 9;
    segs.push([x, y, x + ox * 0.5 - oy * 0.25, y + oy * 0.5 + ox * 0.25], [x + ox * 0.5 - oy * 0.25, y + oy * 0.5 + ox * 0.25, x + ox, y + oy]);
  }
  strokes(r, segs, '#d0502e', 1.3);
}
/** The river in flood: the same winding band as the calm river, coming from the distance and
 *  spilling over its banks toward toX, with a foaming front. (Not a sea wave.) */
function riverSurge(r: R, x0: number, toX: number, flip = false) {
  const c = r.c, gy = r.gy;
  if (flip) {
    c.save(); c.translate(r.W, 0); c.scale(-1, 1); riverSurge(r, x0, r.W - toX); c.restore(); return;
  }
  const F: Pt = [x0 + 40, gy - 50], E: Pt = [toX - 10, gy + 2];
  const at = (t: number): Pt => [F[0] + (E[0] - F[0]) * t * t - Math.sin(t * Math.PI) * 26, F[1] + (E[1] - F[1]) * Math.sqrt(t)];
  const hw = (t: number) => 3 + 19 * t * t;
  const L: number[] = [], Rr: number[] = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, [x, y] = at(t), [x2, y2] = at(Math.min(1, t + 0.02)), [x1, y1] = at(Math.max(0, t - 0.02));
    const dx = x2 - x1, dy = y2 - y1, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d, w = hw(t);
    L.push(x + nx * w, y + ny * w); Rr.unshift(x - nx * w, y - ny * w);
  }
  // The flood front: a rounded lobe pushing on along the ground.
  const [ex, ey] = at(1), w1 = hw(1);
  const front: number[] = [];
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI / 2 - (k / 8) * Math.PI; front.push(ex + Math.cos(a) * w1 * 1.25, ey + Math.sin(a) * w1 * 0.75);
  }
  poly(r, [...L, ...front, ...Rr], '#4f8cc4'); if (r.ghost) return;
  // Ripples like the calm river's, and foam where it spills.
  for (let i = 0; i < 5; i++) {
    const t = 0.25 + i * 0.16, [cx, cy] = at(t), w = hw(t) * 0.5, o = Math.sin(r.t * 3 + i) * 2;
    line(r, [cx - w + o, cy, cx - w * 0.5 + o, cy - 3, cx + o, cy, cx + w * 0.5 + o, cy - 3, cx + w + o, cy], '#e6f3fb', 1.6 + t);
  }
  for (let k = 1; k < 8; k += 1.5) {
    const a = -Math.PI / 2 + (k / 8) * Math.PI;
    bumpy(r, ex + Math.cos(a) * w1 * 1.2, ey + Math.sin(a) * w1 * 0.72, 5, 3.5, 5, 0.5, '#f4f8fa');
  }
  for (const t of [0.55, 0.75, 0.9]) {
    const [cx, cy] = at(t); bumpy(r, cx, cy - hw(t) * 0.95, 3 + t * 3, 2 + t * 2, 5, 0.5, '#f4f8fa');
  }
}

// ---------------------------------------------------------------- composition

function natY(r: R, n: string) {
  return SKY.has(n) ? r.H * 0.25 : r.gy;
}
function faceOn(r: R, g: Got) {
  if (r.ghost) return; const c = r.c, s = Math.min(g.x1 - g.x0, g.y1 - g.y0) * 0.09; c.fillStyle = INK;
  for (const dx of [-1.2, 1.4]) {
    c.beginPath(); c.arc(g.cx + dx * s * 1.6, g.cy - s, s * 0.7, 0, TAU); c.fill();
  }
  c.beginPath(); c.arc(g.cx + s * 0.2, g.cy + s * 0.6, s * 1.4, 0.15 * Math.PI, 0.85 * Math.PI); c.lineWidth = s * 0.5; c.strokeStyle = INK;
  c.stroke();
}
function subj(r: R, np: NP, x: number, pose: string, o: PO = {}): Got {
  const n = np.n; if (n === 'Q') return place(r, np, x, r.gy, { q: [32, 64], ...o });
  if (isAgent(n) || isAnimal(n)) return place(r, np, x, r.gy, { pose, layout: 'trail', ...o }); const g = place(r, np, x, natY(r, n), o);
  if (!o.dry) faceOn(r, g); return { ...g, eye: [g.cx + 4, g.cy - 2] };
}
function obj(r: R, np: NP, x: number, o: PO = {}): Got {
  if (np.n === 'Q') return place(r, np, x, r.gy, { q: [38, 38], ...o }); return place(r, np, x, natY(r, np.n), { layout: 'pile', ...o });
}
function dest(r: R, np: NP, x: number): Got {
  if (np.n === 'Q') return place(r, np, x, r.gy, { q: [46, 58] });
  return place(r, np, x, natY(r, np.n), { layout: 'pile', scale: np.n === 'mountain' ? 0.72 : 1 });
}
const single = (np: NP): NP => ({ ...np, pl: false });
/** Centre x for a held thing of width ow so it sits beside the holder's body, not over it. */
const besideBody = (g: Got, x: number, ow: number) => Math.max(x, g.cx + 18 + ow / 2);
/** Where the hand goes to grip a thing centred at (x, y). */
const gripAt = (x: number, y: number, ow: number, oh: number): Pt => [x - ow / 2 + 4, y + oh * 0.25];
/** Draw something held at hand height (a plural thing becomes a little pile). */
function heldThing(r: R, np: NP, cx: number, cy: number, o: PO = {}) {
  const [, oh] = sizeOf(np); const isSky = SKY.has(np.n);
  return place(r, np, cx, isSky ? cy : cy + oh / 2, { layout: 'stack', ...o, q: [30, 28] });
}

/** Draw all participants and action marks. Returns where the "not" emblem goes. */
function compose(r: R, f: Frame): Pt {
  const { W, gy } = r; const s = f.s, o = f.o ?? { n: 'stone' }, neg = !!f.neg; const [ow, oh] = sizeOf(o);
  switch (f.v) {
    case 'see': {
      const S = subj(r, s, W * 0.21, neg ? 'stand' : 'see'); const O = obj(r, o, W * 0.7); return sight(r, S.eye, O);
    }
    case 'eat': {
      if (isAgent(s.n)) {
        const sx = W * 0.36;
        if (!neg) {
          const g = subj(r, s, sx, 'eat', { dry: true }); const oc: Pt = [g.mouth[0] + 3 + ow / 2, g.mouth[1] + 1];
          if (o.pl) obj(r, single(o), sx + 70, { scale: 1, layout: 'pile' });
          subj(r, s, sx, 'eat', { handAt: [oc[0] - ow * 0.1, oc[1] + oh * 0.4], held: () => heldThing(r, single(o), oc[0], oc[1], { dir: -1, bite: true }) });
          strokes(r, [[g.mouth[0] - 6, g.mouth[1] + 3, g.mouth[0] - 2, g.mouth[1] + 8, g.mouth[0] - 6, g.mouth[1] + 11]], INK, 0.9);
          return oc;
        }
        const g = subj(r, s, W * 0.3, 'give', { dry: true }); const oc: Pt = [g.hand[0] + ow * 0.4, g.hand[1] - 2];
        subj(r, s, W * 0.3, 'give', { held: () => heldThing(r, o, oc[0], oc[1], { dir: -1 }) }); return [oc[0] + 4, oc[1] - oh / 2 - 22];
      }
      const sx = W * 0.4; const g = subj(r, s, sx, neg ? 'stand' : 'eat', { dry: true });
      if (!neg) {
        obj(r, o, g.mouth[0] - 3 + ow / 2, { dir: -1, bite: true }); subj(r, s, sx, 'eat'); return [g.mouth[0] + ow / 2, g.mouth[1] - 20];
      }
      const O = obj(r, o, g.mouth[0] + 50 + ow / 2, { dir: -1 }); subj(r, s, sx, 'stand'); return [(g.mouth[0] + O.x0) / 2, g.mouth[1] - 8];
    }
    case 'give': {
      const sx = W * 0.2; const pose = neg ? 'hold' : 'give'; const g = subj(r, s, sx, pose, { dry: true });
      const Rc = f.d ? place(r, f.d, W * 0.8, gy, { pose: neg ? 'stand' : 'receive', dir: -1, layout: 'trail', q: [32, 64] }) : null;
      const oc0: Pt = neg ? [g.hand[0] + 2, g.hand[1] - 2] : [g.hand[0] + ow * 0.32, g.hand[1] - 3];
      const oc: Pt = isAgent(s.n) ? [besideBody(g, oc0[0], ow), oc0[1]] : oc0;
      const grip = isAgent(s.n) && oc[0] !== oc0[0] ? { handAt: gripAt(oc[0], oc[1], ow, oh) } : {};
      subj(r, s, sx, pose, { ...grip, held: () => heldThing(r, o, oc[0], oc[1]) }); const a: Pt = [oc[0] + ow * 0.5 + 4, oc[1] - oh * 0.5 - 6];
      const b: Pt = Rc ? [Rc.hand[0] + 2, Rc.hand[1] - 10] : [W - 20, oc[1]]; return arrow(r, a, b, -18, ARROW, [], 1.8);
    }
    case 'take': {
      if (s.n === 'river' || s.n === 'rain') {
        if (s.n === 'river') riverSurge(r, 4, W * (neg ? 0.5 : 0.42)); else subj(r, s, W * 0.3, 'stand'); const ox = W * (neg ? 0.72 : 0.56);
        const O = obj(r, o, ox, neg ? {} : { rot: -0.3, scale: 0.9 }); if (!neg) speed(r, O.x1 + 4, O.y0, O.y1, 14, 1);
        return arrow(r, [O.x1 + 6, gy + 8], [W * 0.25, gy + 8], 8, ARROW, [], 1.8);
      }
      const sx = W * 0.3; const g = subj(r, s, sx, 'take', { dry: true }); const animal = isAnimal(s.n);
      if (neg) {
        subj(r, s, sx, 'take'); const O = obj(r, o, W * 0.7); return [(g.hand[0] + O.x0) / 2, g.hand[1] - 4];
      }
      const oc: Pt = animal ? [g.mouth[0] + ow / 2 - 3, g.mouth[1] + 1] : [g.hand[0] + ow / 2 - 1, g.hand[1]]; let O: Got;
      if (animal) {
        O = heldThing(r, o, oc[0], oc[1], { dir: -1 }); subj(r, s, sx, 'take');
      } else {
        oc[0] = besideBody(g, oc[0], ow);
        O = place(r, o, 0, 0, { dry: true });
        subj(r, s, sx, 'take', { handAt: gripAt(oc[0], oc[1], ow, oh), held: () => (O = heldThing(r, o, oc[0], oc[1])) });
      }
      speed(r, O.x1 + 5, O.y0, O.y1, 16, 1); return arrow(r, [O.x1 + 16, O.y1 + 12], [g.x1 - 4, O.y1 + 12], 6, ARROW, [], 1.8);
    }
    case 'carry': {
      const sx = W * (f.d ? (s.pl ? 0.36 : 0.3) : 0.46); const g = subj(r, s, sx, neg ? 'stand' : 'carry', { dry: true }); let end: Pt;
      if (!neg) {
        footsteps(r, g.x0 - 6, 4); const both = !!o.pl && !!s.pl;
        const hx = isAgent(s.n) && !s.pl ? besideBody(g, g.hand[0] + ow * (o.pl && !both ? 0.1 : 0.22), ow) : 0;
        const grip = hx ? { handAt: gripAt(hx, g.hand[1] - 2, ow, oh) } : {};
        const S = subj(r, s, sx, 'carry', { ...grip, heldAll: both, held: (m) => heldThing(r, both ? single(o) : o, hx || m.hand[0] + ow * (o.pl && !both ? 0.1 : 0.22), m.hand[1] - 2) });
        end = [S.x1 + ow * 0.4 + 8, gy - 6];
      } else {
        // Left on the ground behind them.
        obj(r, o, g.x0 - ow * 0.5 + 4, {}); subj(r, s, sx, 'stand'); end = [g.x1 + 8, gy - 6];
      }
      if (f.d) {
        const D = dest(r, f.d, W * 0.86); return arrow(r, end, [D.x0 - 4, gy - 8], -10, ARROW, [3, 2.4], 1.8);
      }
      if (!neg) speed(r, g.x0 - 4, g.y0 + 10, g.y0 + 40, 16); return [g.x1 + 14, g.y0 + 10];
    }
    case 'go': {
      const S = subj(r, s, W * (s.pl ? 0.3 : 0.19), neg ? 'stand' : 'walk');
      if (!neg) {
        speed(r, S.x0 - 3, S.y0 + (S.y1 - S.y0) * 0.25, S.y0 + (S.y1 - S.y0) * 0.7, 16); footsteps(r, S.x0 - 4, 2);
      }
      const D = f.d ? dest(r, f.d, W * 0.85) : null;
      return arrow(r, [S.x1 + 8, gy - 6], [D ? D.x0 - 4 : W - 10, gy - 8], -10, ARROW, [3, 2.4], 1.8);
    }
    case 'sleep': {
      if (!neg) {
        const g = subj(r, s, W * 0.47, 'lie', { scale: 1.2 }); zzz(r, g.eye[0] + 6, g.eye[1] - 14); return [W * 0.5, gy - 40];
      }
      // Awake beside an empty bed: the sleep is crossed out.
      subj(r, s, W * 0.3, 'stand'); const bx = W * 0.62, prev = r.adj; r.adj = undefined; rr(r, bx - 24, gy - 6, 54, 6, 3, '#d8c7a0');
      ell(r, bx - 16, gy - 10, 9, 5, '#f3ead6'); rr(r, bx - 4, gy - 11, 32, 7, 3.5, '#7d9fc4'); r.adj = prev;
      const p: Pt = [bx + 2, gy - 36]; text(r, 'z', p[0] - 6, p[1] + 5, 13, '#4b5c9a'); text(r, 'Z', p[0] + 5, p[1] - 5, 17, '#4b5c9a');
      return p;
    }
    case 'make': {
      const sx = W * 0.3; const g = subj(r, s, sx, 'make', { dry: true }); const ox = Math.max(g.hand[0] + 12 + ow / 2, W * 0.58);
      const O = obj(r, o, ox, neg ? { outline: true } : { half: true });
      if (neg) {
        subj(r, s, sx, 'stand'); return [O.cx, O.cy];
      }
      subj(r, s, sx, 'make', { held: (m) => hammer(r, m.hand, 1.0) }); const sp: Pt = [O.x0 + 2, O.y0 + (O.y1 - O.y0) * 0.45];
      for (const [dx, dy, ss] of [[0, -8, 6], [8, 4, 4.5], [-6, 8, 3.5], [12, -14, 3.5]]) star4(r, sp[0] + dx, sp[1] + dy, ss * (0.9 + 0.1 * Math.sin(r.t * 5 + dx)), '#ffd45a', '#c87a2a');
      return sp;
    }
    case 'fear': {
      let O: Got;
      if (o.n === 'river' && !neg) {
        // A feared river floods toward them, as it does when it acts.
        riverSurge(r, 4, W * 0.5, true); O = { ...obj(r, o, W * 0.8, { dry: true }), x0: W * 0.5, cy: r.gy - 20 };
      } else {
        const O0 = obj(r, o, W * 0.7, { scale: neg ? 1 : 1.18, dir: -1, dry: true }); if (!neg) spikes(r, O0);
        O = obj(r, o, W * 0.7, { scale: neg ? 1 : 1.18, dir: -1, fierce: !neg });
      }
      const g = subj(r, s, W * 0.24, neg ? 'stand' : 'fear'); const hx = g.eye[0], hy = g.eye[1];
      if (!neg) {
        drop(r, hx + 9, hy - 9, 3.2); drop(r, hx - 10, hy - 4, 2.6); const yy = g.y0 + (g.y1 - g.y0) * 0.4;
        strokes(r, [[g.x0 - 6, yy - 6, g.x0 - 9, yy, g.x0 - 6, yy + 6], [g.x0 - 11, yy - 8, g.x0 - 15, yy, g.x0 - 11, yy + 8], [g.x1 + 6, yy - 6, g.x1 + 9, yy, g.x1 + 6, yy + 6]], INK, 1);
        return mid([g.x1, hy], [O.x0, O.cy]);
      }
      const p: Pt = [(g.x1 + O.x0) / 2, Math.min(hy, O.cy)]; drop(r, p[0], p[1] + 2, 5); return p;
    }
    case 'find': {
      const ox = neg ? W * 0.72 : W * 0.62; const O0 = obj(r, o, ox, { dry: true });
      if (!neg) glow(r, O0.cx, O0.cy, Math.max(ow, oh) * 0.9 + 10, '255,226,120', 0.75); const O = obj(r, o, ox);
      const g = subj(r, s, W * 0.3, neg ? 'stand' : 'find');
      if (!neg) {
        const tw = 1 + 0.12 * Math.sin(r.t * 4); star4(r, O.x1 + 4, O.y0 - 2, 7 * tw, '#fff3a8', '#c8962a');
        star4(r, O.x0 - 4, O.y0 + 4, 5, '#fff3a8', '#c8962a'); star4(r, O.cx + 3, O.y0 - 12, 4, '#fff3a8', '#c8962a');
        text(r, '!', g.eye[0] + 2, g.y0 - 12, r.small ? 30 : 24, '#c0402a'); return mid([g.x1, g.eye[1]], [O.x0, O.cy]);
      }
      return [(g.x1 + O.x0) / 2, (g.eye[1] + O.cy) / 2];
    }
    case 'break': {
      const ox = W * 0.64; const O0 = obj(r, o, ox, { dry: true });
      if (s.n === 'rain' || s.n === 'river') {
        if (s.n === 'river') riverSurge(r, 4, O0.x0 + (neg ? -14 : 12)); const O = obj(r, o, ox, { broken: !neg });
        if (s.n === 'rain') {
          const cy = Math.max(22, O.y0 - 48); place(r, s, O.cx - 10, cy, { fierce: true });
        }
        if (!neg) burst(r, O.cx, O.y0 + 4, 11); return [O.cx, O.y0 + (O.y1 - O.y0) * 0.4];
      }
      const O = obj(r, o, ox, { broken: !neg }); const g = subj(r, s, W * 0.33, 'strike', { held: (m) => hammer(r, m.hand, 0.5) });
      if (!neg) {
        burst(r, O.cx, O.y0 + 2, 12); const h = g.hand;
        strokes(r, [[h[0] + 14, h[1] - 16, h[0] + 26, h[1] - 6, h[0] + 30, h[1] + 8]], 'rgba(90,60,40,0.55)', 1.2);
      }
      return [O.cx, O.y0 + (O.y1 - O.y0) * 0.4];
    }
  }
  const S = subj(r, s, W * 0.3, 'stand'); return [S.x1 + 20, S.cy];
}

// ---------------------------------------------------------------- backdrops

function sky(r: R, top: string, bot: string) {
  const g = r.c.createLinearGradient(0, 0, 0, r.gy); g.addColorStop(0, top); g.addColorStop(1, bot);
  r.c.fillStyle = g; r.c.fillRect(0, 0, r.W, r.H);
}
function ground(r: R, y: number, col: string) {
  r.c.fillStyle = col; r.c.fillRect(0, y, r.W, r.H - y);
}

function backdrop(r: R, b: Backdrop) {
  const c = r.c, W = r.W, gy = r.gy, hz = gy - 36, det = !r.small; const R1 = (i: number) => rnd(r, 100 + i);
  switch (b) {
    case 'shore': {
      sky(r, '#f5efdf', '#eef1e6'); c.fillStyle = '#c3dcd8'; c.fillRect(0, hz - 12, W, 16); ground(r, hz, '#f0e0bf');
      c.strokeStyle = '#e2d0aa'; c.lineWidth = 2; c.beginPath();
      for (let x = 0; x <= W; x += 10) c.lineTo(x, hz + 3 + Math.sin(x * 0.08 + r.t) * 1.5); c.stroke();
      if (det) {
        c.strokeStyle = '#e4f0ee'; c.lineWidth = 1.5;
        for (let i = 0; i < 6; i++) {
          const x = R1(i) * W, y = hz - 9 + R1(i + 9) * 8; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 10, y); c.stroke();
        }
        c.fillStyle = '#e6d2ab';
        for (let i = 0; i < 9; i++) {
          c.beginPath(); c.ellipse(R1(20 + i) * W, hz + 10 + R1(30 + i) * (r.H - hz - 12), 2.2, 1.2, 0, 0, TAU); c.fill();
        }
      }
      break;
    }
    case 'market': {
      sky(r, '#f7eedb', '#f3e6cf');
      if (det) {
        const n = 4 + Math.floor(R1(0) * 2);
        for (let i = 0; i < n; i++) {
          const x = (i + 0.5) * (W / n) + (R1(i + 1) - 0.5) * 12, w = 46;
          c.fillStyle = '#ead9bf'; c.fillRect(x - w / 2, hz - 30, w, 30); c.fillStyle = i % 2 ? '#ecc9b4' : '#d9d4b6'; c.beginPath();
          c.moveTo(x - w / 2 - 4, hz - 42); c.lineTo(x + w / 2 + 4, hz - 42); c.lineTo(x + w / 2 + 4, hz - 33);
          for (let k = 0; k < 4; k++) c.quadraticCurveTo(x + w / 2 + 4 - k * 13.5 - 6.75, hz - 28, x + w / 2 + 4 - (k + 1) * 13.5, hz - 33);
          c.closePath(); c.fill();
        }
        c.strokeStyle = '#d8c2a0'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 18); c.quadraticCurveTo(W / 2, 40, W, 18); c.stroke();
        for (let i = 1; i < 12; i++) {
          const x = (i * W) / 12, y = 18 + 22 * (1 - Math.pow((x - W / 2) / (W / 2), 2)) * 0.9;
          c.fillStyle = ['#ecc4b0', '#e8dcb0', '#c8d8c8'][i % 3]; c.beginPath(); c.moveTo(x - 4, y); c.lineTo(x + 4, y); c.lineTo(x, y + 8);
          c.closePath(); c.fill();
        }
      }
      ground(r, hz, '#ead9b9');
      if (det) {
        c.strokeStyle = '#ddc9a5'; c.lineWidth = 1.2;
        for (let i = 0; i < 14; i++) {
          c.beginPath(); c.ellipse(R1(40 + i) * W, hz + 8 + R1(60 + i) * (r.H - hz - 10), 6, 2.5, 0, 0, TAU); c.stroke();
        }
      }
      break;
    }
    case 'houses': {
      sky(r, '#e6d8e4', '#f4dfc6');
      if (det) {
        let x = -10 + R1(0) * 20; let i = 0;
        while (x < W + 10) {
          const w = 34 + R1(i + 1) * 16, h = 26 + R1(i + 2) * 18;
          c.fillStyle = '#dccbcf'; c.fillRect(x, hz - h, w, h + 2); c.beginPath(); c.moveTo(x - 3, hz - h); c.lineTo(x + w / 2, hz - h - 16);
          c.lineTo(x + w + 3, hz - h); c.closePath(); c.fill();
          if (R1(i + 3) > 0.35) {
            c.fillStyle = '#f4dda0'; c.fillRect(x + w * 0.3, hz - h * 0.7, 6, 6);
          }
          x += w + 6 + R1(i + 4) * 14; i += 5;
        }
      }
      ground(r, hz, '#e2d1b9'); break;
    }
    case 'mountain': {
      sky(r, '#edf0ef', '#f3ecdc'); c.fillStyle = '#e1e1e6'; c.beginPath(); c.moveTo(0, hz); const pk = [0.12, 0.33, 0.55, 0.8];
      pk.forEach((p, i) => {
        c.lineTo(W * (p - 0.1), hz - 10); c.lineTo(W * p + (R1(i) - 0.5) * 20, hz - 34 - R1(i + 5) * 26);
      }); c.lineTo(W, hz - 8); c.lineTo(W, hz); c.fill(); ground(r, hz, '#e3dcb8');
      if (det) {
        c.strokeStyle = '#d5caa0'; c.setLineDash([5, 5]); c.lineWidth = 3; c.beginPath(); c.moveTo(W * 0.05, r.H);
        c.quadraticCurveTo(W * 0.5, gy - 6, W * 0.75, hz + 2); c.stroke(); c.setLineDash([]); c.strokeStyle = '#c8c69a'; c.lineWidth = 1.5;
        for (let i = 0; i < 8; i++) {
          const x = R1(20 + i) * W, y = hz + 8 + R1(30 + i) * (r.H - hz - 10);
          c.beginPath(); c.moveTo(x - 3, y); c.lineTo(x, y - 5); c.lineTo(x + 3, y); c.stroke();
        }
      }
      break;
    }
    case 'lake': {
      // A high lake: snowy peaks behind still, cold water, a pebbled shore.
      sky(r, '#e6eef2', '#f1efe4'); peaks(r, hz - 14, '#d3dbe2', true); c.fillStyle = '#9fc4d2'; c.fillRect(0, hz - 16, W, 18);
      c.fillStyle = '#b9d6df'; c.fillRect(0, hz - 16, W, 4); ground(r, hz, '#e6dfca');
      if (det) {
        c.strokeStyle = '#e8f4f7'; c.lineWidth = 1.4;
        for (let i = 0; i < 7; i++) {
          const x = R1(i) * W, y = hz - 11 + R1(i + 9) * 9; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 8 + R1(i + 3) * 8, y); c.stroke();
        }
        for (let i = 0; i < 10; i++) {
          c.fillStyle = ['#cfc6b0', '#d9d1bd', '#c4bba6'][i % 3]; c.beginPath();
          c.ellipse(R1(20 + i) * W, hz + 6 + R1(30 + i) * (r.H - hz - 8), 3 + R1(40 + i) * 3, 1.8 + R1(50 + i) * 1.5, 0, 0, TAU); c.fill();
        }
      }
      break;
    }
    case 'hamlet': {
      // Stone houses on the slope, rocks weighing down their slate roofs; lit doorways.
      sky(r, '#e4e0ea', '#efe5d2'); peaks(r, hz - 22, '#dcdbe3', true);
      if (det) {
        let x = -8 + R1(0) * 16; let i = 0;
        while (x < W + 8) {
          const w = 36 + R1(i + 1) * 14, h = 22 + R1(i + 2) * 14, y = hz - h;
          c.fillStyle = '#d3cbbf'; c.fillRect(x, y, w, h + 2); c.strokeStyle = '#c2b9ab'; c.lineWidth = 0.8;
          for (let k = 1; k < 4; k++) {
            c.beginPath(); c.moveTo(x, y + (h * k) / 4); c.lineTo(x + w, y + (h * k) / 4); c.stroke();
          }
          c.fillStyle = '#9f968f'; c.beginPath(); c.moveTo(x - 4, y + 1); c.lineTo(x + w / 2, y - 9); c.lineTo(x + w + 4, y + 1); c.closePath(); c.fill();
          c.fillStyle = '#b8b0a6';
          for (let k = 0; k < 2; k++) {
            c.beginPath(); c.arc(x + w * (0.3 + k * 0.4), y - 4 + k, 2.4, 0, TAU); c.fill();
          }
          c.fillStyle = R1(i + 3) > 0.4 ? '#f2d58e' : '#8a7f78'; c.fillRect(x + w * 0.4, hz - h * 0.55, 7, h * 0.55);
          x += w + 8 + R1(i + 4) * 12; i += 5;
        }
      }
      ground(r, hz, '#ddd4bf');
      if (det) {
        c.fillStyle = '#cdc3ac';
        for (let i = 0; i < 8; i++) {
          c.beginPath(); c.ellipse(R1(60 + i) * W, hz + 8 + R1(70 + i) * (r.H - hz - 10), 4, 2, 0, 0, TAU); c.fill();
        }
      }
      break;
    }
    case 'terraces': {
      // Dawn over stepped green fields cut into the slope.
      sky(r, '#f7e3cf', '#f2ecd9'); peaks(r, hz - 40, '#e3d9d6', false);
      const bands = ['#bfd29a', '#aac58a', '#c6d6a2'];
      for (let k = 0; k < 3; k++) {
        const y = hz - 40 + k * 13; c.fillStyle = bands[k]; c.beginPath(); c.moveTo(0, y + 4);
        c.quadraticCurveTo(W * 0.5, y - 4, W, y + 2); c.lineTo(W, y + 15); c.lineTo(0, y + 15); c.closePath(); c.fill();
        c.strokeStyle = '#8fa66e'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(0, y + 4); c.quadraticCurveTo(W * 0.5, y - 4, W, y + 2); c.stroke();
      }
      ground(r, hz, '#dfdcb6');
      if (det) {
        c.strokeStyle = '#a8b878'; c.lineWidth = 1.3;
        for (let i = 0; i < 10; i++) {
          const x = R1(20 + i) * W, y = hz + 8 + R1(30 + i) * (r.H - hz - 10);
          c.beginPath(); c.moveTo(x, y); c.lineTo(x - 2, y - 4); c.moveTo(x, y); c.lineTo(x + 2, y - 4); c.stroke();
        }
      }
      break;
    }
    case 'murals': {
      c.fillStyle = '#e4d3b4'; c.fillRect(0, 0, W, r.H);
      if (det) {
        c.fillStyle = 'rgba(160,130,90,0.12)';
        for (let i = 0; i < 30; i++) {
          c.beginPath(); c.arc(R1(i) * W, R1(i + 50) * r.H, 1 + R1(i + 99) * 2.5, 0, TAU); c.fill();
        }
      }
      c.save(); muralPath(r); c.clip(); sky(r, '#efdcb6', '#ead2a4'); ground(r, hz, '#d9b88a'); c.restore(); break;
    }
  }
}
/** A row of distant peaks along y (with snow caps when asked). */
function peaks(r: R, y: number, col: string, snow: boolean) {
  const c = r.c, W = r.W; const R1 = (i: number) => rnd(r, 200 + i); const tops: Pt[] = [];
  c.fillStyle = col; c.beginPath(); c.moveTo(0, y + 20);
  for (let i = 0; i < 5; i++) {
    const x = W * (0.05 + i * 0.23) + (R1(i) - 0.5) * 18, h = 26 + R1(i + 5) * 22; c.lineTo(x - 22, y + 4); c.lineTo(x, y - h); tops.push([x, y - h]);
  }
  c.lineTo(W, y + 2); c.lineTo(W, y + 20); c.closePath(); c.fill();
  if (snow && !r.small) {
    c.fillStyle = '#f7f8f8';
    for (const [x, ty] of tops) {
      c.beginPath(); c.moveTo(x, ty); c.lineTo(x - 7, ty + 9); c.lineTo(x - 2, ty + 7); c.lineTo(x + 2, ty + 10); c.lineTo(x + 6, ty + 8); c.closePath(); c.fill();
    }
  }
}
function muralPath(r: R) {
  const c = r.c, m = r.small ? 5 : 8, W = r.W, H = r.H; const pts: Pt[] = [];
  const edge = (x0: number, y0: number, x1: number, y1: number, k: number) => {
    const n = Math.max(3, Math.round(Math.hypot(x1 - x0, y1 - y0) / 14));
    for (let i = 0; i < n; i++) {
      const t = i / n, j = (rnd(r, k * 50 + i) - 0.5) * 5;
      pts.push([x0 + (x1 - x0) * t + (y1 !== y0 ? j : 0), y0 + (y1 - y0) * t + (x1 !== x0 ? j : 0)]);
    }
  }; edge(m, m, W - m, m, 1); edge(W - m, m, W - m, H - m, 2); edge(W - m, H - m, m, H - m, 3); edge(m, H - m, m, m, 4); c.beginPath();
  pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath();
}
function muralWear(r: R) {
  const c = r.c, W = r.W, H = r.H; c.save(); muralPath(r); c.clip(); c.fillStyle = 'rgba(232,220,196,0.85)'; const n = r.small ? 4 : 10;
  for (let i = 0; i < n; i++) {
    const x = rnd(r, 300 + i) * W, y = rnd(r, 400 + i) * H, s = 2 + rnd(r, 500 + i) * 4;
    c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 1.3, y - s * 0.2); c.lineTo(x + s * 0.4, y + s); c.lineTo(x - s, y + s * 0.4); c.closePath();
    c.fill();
  }
  c.restore(); c.strokeStyle = 'rgba(110,80,50,0.35)'; c.lineWidth = 1; c.beginPath(); let x = W * (0.2 + rnd(r, 600) * 0.6), y = 0;
  c.moveTo(x, y); for (let i = 0; i < 5; i++) c.lineTo((x += (rnd(r, 610 + i) - 0.5) * 16), (y += H * 0.08)); c.stroke(); muralPath(r);
  c.strokeStyle = 'rgba(120,90,60,0.45)'; c.lineWidth = 1.5; c.stroke();
}

// ---------------------------------------------------------------- tense & negation

function pastWash(r: R) {
  const c = r.c, W = r.W, H = r.H;
  c.globalCompositeOperation = 'saturation'; c.globalAlpha = 0.72; c.fillStyle = '#808080'; c.fillRect(0, 0, W, H); c.globalAlpha = 1;
  c.globalCompositeOperation = 'multiply'; c.fillStyle = '#f2d4a0'; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over';
  c.fillStyle = 'rgba(255,244,222,0.2)'; c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.56);
  g.addColorStop(0, 'rgba(120,80,40,0)'); g.addColorStop(1, 'rgba(120,80,40,0.5)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function futWash(r: R) {
  const c = r.c, W = r.W, H = r.H;
  c.globalCompositeOperation = 'multiply'; c.fillStyle = '#d4d2f6'; c.fillRect(0, 0, W, H); c.globalCompositeOperation = 'source-over';
  const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.56);
  g.addColorStop(0, 'rgba(150,140,230,0)'); g.addColorStop(1, 'rgba(120,110,210,0.35)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function futStars(r: R) {
  const pos: Pt[] = [[0.08, 0.1], [0.3, 0.06], [0.52, 0.14], [0.76, 0.07], [0.93, 0.18], [0.64, 0.28]];
  pos.forEach(([x, y], i) => {
    const s = (r.small ? 6 : 4.5) * (0.8 + 0.3 * rnd(r, 700 + i)) * (0.85 + 0.15 * Math.sin(r.t * 2 + i));
    star4(r, x * r.W + (rnd(r, 710 + i) - 0.5) * 16, y * r.H + 4, s, '#fffdf0', '#7a72c0');
  });
}
function emblem(r: R, [x, y]: Pt) {
  const c = r.c, R0 = r.small ? 17.5 : 16, w = R0 * 0.27; x = Math.min(Math.max(x, R0 + 4), r.W - R0 - 4);
  y = Math.min(Math.max(y, R0 + 4), r.H - R0 - 4); c.beginPath(); c.arc(x, y, R0, 0, TAU); c.fillStyle = 'rgba(255,250,240,0.25)'; c.fill();
  const d = R0 * 0.7;
  for (const [col, lw] of [['#fffaf0', w + 3], ['#d23a2e', w]] as const) {
    c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round'; c.beginPath(); c.arc(x, y, R0, 0, TAU); c.stroke(); c.beginPath();
    c.moveTo(x - d, y - d); c.lineTo(x + d, y + d); c.stroke();
  }
}

// ---------------------------------------------------------------- entry point

/** Draw the scene for a frame into the box (0,0,w,h) of ctx (caller has applied devicePixelRatio scaling). t = seconds, for optional gentle idle animation (may be ignored; must look complete at any t). */
export function drawScene(ctx: CanvasRenderingContext2D, frame: Frame, w: number, h: number, opts: { backdrop: Backdrop; seed: number; t?: number }): void {
  const small = w < 160; const VW = small ? 210 : 250; const s = w / VW, H = h / s;
  const r: R = { c: ctx, W: VW, H, gy: H * 0.86, small, lw: Math.max(2, 1.25 / s), k: 1, ghost: false, ghostInk: INK, ink: INK, adj: undefined, t: opts.t ?? 0, seed: opts.seed | 0 };
  const mural = opts.backdrop === 'murals';
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip(); ctx.scale(s, s); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const scene = () => {
    if (mural) {
      ctx.save(); muralPath(r); ctx.clip();
    }
    const at = compose(r, frame); if (mural) ctx.restore(); return at;
  }; backdrop(r, opts.backdrop); const negAt = scene(); if (mural) muralWear(r);
  if (frame.tense === 'fut') {
    // Hopes: figures fade into the backdrop, then are re-traced as dashed sketches.
    ctx.globalAlpha = 0.3; backdrop(r, opts.backdrop); ctx.globalAlpha = 1; futWash(r); r.ghost = true; r.ghostInk = '#4a4290'; scene();
    r.ghost = false; futStars(r);
  } else if (frame.tense === 'past') pastWash(r); if (frame.neg) emblem(r, negAt); ctx.restore();
}
