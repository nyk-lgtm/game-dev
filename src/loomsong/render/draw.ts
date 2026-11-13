// Loomsong on a canvas: four warp threads, beads (taps), yarn (holds),
// chevron beads (flicks) and weft threads joining chords slide down to the
// shuttle bar; beat lines scroll with them; hits burst at the pads and every
// judged note is woven into the cloth under the bar (the song's tapestry).

import { LANES, type Chart, type Judge, type Judgment, type Note, type Song } from '../core';

export const LANE_COLORS = ['#ff7a6b', '#ffc857', '#4fd1c5', '#a78bfa'];
export const LANE_DIM = ['#5a2c2b', '#5a4a22', '#1d4c49', '#3d3260'];
const BG = '#120d1b';
/** Misses are a cold grey-white with a strike, far from every lane colour. */
export const MISS_COLOR = '#d9dbe6';

export interface Layout {
  w: number;
  h: number;
  left: number;
  laneW: number;
  hitY: number;
  topY: number;
  padR: number;
  clothY: number;
}

export function layout(w: number, h: number): Layout {
  const side = 8;
  const laneW = (w - side * 2) / LANES;
  const below = Math.max(118, Math.min(170, h * 0.2));
  const hitY = h - below;
  const padR = Math.min(laneW * 0.32, 28);
  return { w, h, left: side, laneW, hitY, topY: -24, padR, clothY: hitY + padR + 18 };
}

export const laneX = (L: Layout, lane: number) => L.left + L.laneW * (lane + 0.5);
export const laneAt = (L: Layout, x: number) => Math.max(0, Math.min(LANES - 1, Math.floor((x - L.left) / L.laneW)));

export interface Burst {
  lane: number;
  j: Judgment;
  t: number;
  tail: boolean;
}
export interface Popup {
  lane: number;
  text: string;
  sub: string;
  color: string;
  t: number;
  /** Struck through (misses). */
  strike?: boolean;
}
export interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

export interface Scene {
  L: Layout;
  song: Song;
  chart: Chart;
  judge: Judge;
  /** Song time (ms, calibrated). */
  now: number;
  scroll: number;
  held: boolean[];
  /** 0..1: the song has ended and the field fades for the outro. */
  outro: number;
  /** Seconds since page start (animations). */
  time: number;
  bursts: Burst[];
  popups: Popup[];
  sparks: Spark[];
  cloth: [number, Judgment][];
  title: string | null;
  sub: string | null;
  countdown: number | null;
  hint: boolean;
  fx: boolean;
}

function rrect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export function drawBackdrop(g: CanvasRenderingContext2D, L: Layout, held: boolean[] = [false, false, false, false]): void {
  const grd = g.createLinearGradient(0, 0, 0, L.h);
  grd.addColorStop(0, '#1b1129');
  grd.addColorStop(0.7, BG);
  grd.addColorStop(1, '#0b0810');
  g.fillStyle = grd;
  g.fillRect(0, 0, L.w, L.h);
  for (let l = 0; l < LANES; l++) {
    const x = laneX(L, l);
    if (held[l]) {
      const lg = g.createLinearGradient(0, L.hitY - 260, 0, L.hitY);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(1, LANE_COLORS[l] + '38');
      g.fillStyle = lg;
      g.fillRect(L.left + L.laneW * l + 2, L.hitY - 260, L.laneW - 4, 260);
    }
    // The warp thread.
    g.strokeStyle = LANE_COLORS[l] + (held[l] ? 'aa' : '40');
    g.lineWidth = held[l] ? 3 : 2;
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x, L.hitY);
    g.stroke();
    if (l > 0) {
      g.strokeStyle = 'rgba(255,255,255,0.04)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(L.left + L.laneW * l, 0);
      g.lineTo(L.left + L.laneW * l, L.hitY);
      g.stroke();
    }
  }
}

function drawBar(g: CanvasRenderingContext2D, L: Layout, held: boolean[], bursts: Burst[], time: number): void {
  // The shuttle bar.
  const y = L.hitY;
  const wood = g.createLinearGradient(0, y - 5, 0, y + 5);
  wood.addColorStop(0, '#e8c294');
  wood.addColorStop(1, '#8a5d3b');
  g.fillStyle = wood;
  rrect(g, L.left - 2, y - 4, L.w - 2 * L.left + 4, 8, 4);
  g.fill();
  for (let l = 0; l < LANES; l++) {
    const x = laneX(L, l);
    const b = bursts.find((q) => q.lane === l && time - q.t < 0.12);
    g.fillStyle = held[l] || b ? LANE_COLORS[l] + '55' : '#00000055';
    g.beginPath();
    g.arc(x, y, L.padR, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = LANE_COLORS[l];
    g.lineWidth = held[l] ? 4 : 2.5;
    g.stroke();
    g.fillStyle = held[l] ? '#fff' : LANE_COLORS[l] + 'aa';
    g.beginPath();
    g.arc(x, y, 4, 0, Math.PI * 2);
    g.fill();
  }
}

function bead(g: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, ghost: boolean): void {
  const h = 18;
  g.fillStyle = ghost ? '#4a4452' : color;
  rrect(g, x - w / 2, y - h / 2, w, h, 9);
  g.fill();
  if (ghost) return;
  g.fillStyle = 'rgba(255,255,255,0.45)';
  rrect(g, x - w / 2 + 6, y - h / 2 + 3, w - 12, 4, 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1.5;
  rrect(g, x - w / 2, y - h / 2, w, h, 9);
  g.stroke();
}

function flickBead(g: CanvasRenderingContext2D, x: number, y: number, w: number, color: string, ghost: boolean, time: number): void {
  const h = 24;
  if (!ghost) {
    g.fillStyle = color + '33';
    rrect(g, x - w / 2 - 5, y - h / 2 - 5, w + 10, h + 10, 14);
    g.fill();
  }
  g.fillStyle = ghost ? '#4a4452' : '#fff7ea';
  rrect(g, x - w / 2, y - h / 2, w, h, 12);
  g.fill();
  g.strokeStyle = ghost ? '#4a4452' : color;
  g.lineWidth = 3;
  g.stroke();
  // Chevrons: a swipe.
  g.strokeStyle = ghost ? '#6a6472' : color;
  g.lineWidth = 3.5;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const bob = ghost ? 0 : Math.sin(time * 10) * 1.5;
  for (const dy of [-1, 5]) {
    g.beginPath();
    g.moveTo(x - 9, y + dy + 2 + bob);
    g.lineTo(x, y + dy - 5 + bob);
    g.lineTo(x + 9, y + dy + 2 + bob);
    g.stroke();
  }
  g.lineCap = 'butt';
}

function yarn(g: CanvasRenderingContext2D, x: number, y0: number, y1: number, w: number, color: string, ghost: boolean, active: boolean, time: number): void {
  // y0 = head (lower), y1 = end (higher). A twisted strand.
  if (y0 - y1 < 1) return;
  g.save();
  rrect(g, x - w / 2, y1, w, y0 - y1, w / 2);
  g.fillStyle = ghost ? '#3a3542' : color + (active ? 'ee' : 'aa');
  g.fill();
  g.clip();
  if (!ghost) {
    g.strokeStyle = 'rgba(0,0,0,0.22)';
    g.lineWidth = 3;
    const shift = active ? (time * 60) % 12 : 0;
    for (let yy = y1 - 12 + shift; yy < y0 + 12; yy += 12) {
      g.beginPath();
      g.moveTo(x - w / 2, yy + 6);
      g.lineTo(x + w / 2, yy - 6);
      g.stroke();
    }
  }
  g.restore();
  if (!ghost) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(x, y1 + w / 2, w / 2 + 2, 0, Math.PI * 2);
    g.fill();
  }
}

const POP_S = 0.55;

export function draw(g: CanvasRenderingContext2D, s: Scene): void {
  const { L, chart, judge, now } = s;
  drawBackdrop(g, L, s.held);
  const ppm = (L.hitY - L.topY) / s.scroll;
  const yOf = (t: number) => L.hitY - (t - now) * ppm;

  // Beat lines (bars brighter), scrolling with the notes.
  const beatMs = s.song.stepMs * 4;
  const firstBeat = Math.max(0, Math.floor(now / beatMs));
  for (let b = firstBeat; b * beatMs < now + s.scroll; b++) {
    const y = yOf(b * beatMs);
    if (y > L.hitY || y < 0) continue;
    g.strokeStyle = b % 4 === 0 ? 'rgba(255,230,200,0.16)' : 'rgba(255,230,200,0.06)';
    g.lineWidth = b % 4 === 0 ? 2 : 1;
    g.beginPath();
    g.moveTo(L.left, y);
    g.lineTo(L.w - L.left, y);
    g.stroke();
  }

  const ns = chart.notes;
  // First note that can still be on screen.
  let i0 = 0;
  {
    let lo = 0, hi = ns.length;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (ns[m].t < now - 2500) lo = m + 1;
      else hi = m;
    }
    i0 = lo;
  }
  const visible: Note[] = [];
  for (let i = i0; i < ns.length && ns[i].t <= now + s.scroll + 50; i++) visible.push(ns[i]);
  const beadW = Math.min(L.laneW * 0.72, 64);

  // Holds first (under everything), then chord threads, then heads.
  for (const n of visible) {
    if (n.kind !== 'hold') continue;
    const tail = judge.tail[n.id];
    if (tail >= 0 && tail !== 2) continue;
    const head = judge.head[n.id];
    const active = judge.holding(n.lane) === n;
    const ghost = head === 2 || tail === 2;
    const y0 = active ? L.hitY : yOf(n.t);
    const y1 = Math.max(-40, yOf(n.end));
    if (y1 > L.h) continue;
    yarn(g, laneX(L, n.lane), Math.min(y0, L.h + 20), y1, beadW * 0.42, LANE_COLORS[n.lane], ghost, active, s.time);
  }
  for (let i = 0; i < visible.length; i++) {
    const a = visible[i], b = visible[i + 1];
    if (!a.chord || !b || b.t !== a.t || judge.head[a.id] >= 0 || judge.head[b.id] >= 0) continue;
    const y = yOf(a.t);
    g.strokeStyle = 'rgba(255,247,234,0.85)';
    g.lineWidth = 3;
    g.setLineDash([6, 4]);
    g.beginPath();
    g.moveTo(laneX(L, a.lane), y);
    g.lineTo(laneX(L, b.lane), y);
    g.stroke();
    g.setLineDash([]);
  }
  for (const n of visible) {
    const head = judge.head[n.id];
    if (head === 0 || head === 1) continue; // hit: gone (a held hold's head sits in the pad)
    const y = yOf(n.t);
    if (y > L.h + 20 || y < -30) continue;
    const ghost = head === 2;
    const x = laneX(L, n.lane);
    if (n.kind === 'flick') flickBead(g, x, y, beadW, LANE_COLORS[n.lane], ghost, s.time);
    else bead(g, x, y, beadW, LANE_COLORS[n.lane], ghost);
  }

  drawBar(g, L, s.held, s.bursts, s.time);

  // Bursts at the pads.
  for (const b of s.bursts) {
    const k = (s.time - b.t) / 0.35;
    if (k >= 1 || b.j === 2) continue;
    const x = laneX(L, b.lane);
    g.strokeStyle = b.j === 0 ? '#fff3c4' : LANE_COLORS[b.lane];
    g.globalAlpha = 1 - k;
    g.lineWidth = 4 * (1 - k) + 1;
    g.beginPath();
    g.arc(x, L.hitY, L.padR + k * (b.j === 0 ? 26 : 16), 0, Math.PI * 2);
    g.stroke();
    g.globalAlpha = 1;
  }
  for (const p of s.sparks) {
    g.globalAlpha = Math.max(0, Math.min(1, p.life * 2.5));
    g.fillStyle = p.color;
    g.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  g.globalAlpha = 1;

  // Judgment popups.
  g.textAlign = 'center';
  for (const p of s.popups) {
    const k = (s.time - p.t) / POP_S;
    if (k >= 1) continue;
    const x = laneX(L, p.lane);
    const y = L.hitY - L.padR - 34 - k * 22;
    g.globalAlpha = k < 0.7 ? 1 : (1 - k) / 0.3;
    // As large as the lane allows (PERFECT is the widest word).
    const size = Math.min(22, Math.floor((L.laneW - 6) / (p.text.length * 0.68)));
    g.font = `900 ${size}px system-ui, sans-serif`;
    g.lineWidth = 5;
    g.lineJoin = 'round';
    g.strokeStyle = 'rgba(10,6,16,0.85)';
    g.strokeText(p.text, x, y);
    g.fillStyle = p.color;
    g.fillText(p.text, x, y);
    if (p.strike) {
      const w = g.measureText(p.text).width;
      g.strokeStyle = 'rgba(10,6,16,0.85)';
      g.lineWidth = 5;
      g.beginPath();
      g.moveTo(x - w / 2 - 3, y - size * 0.32);
      g.lineTo(x + w / 2 + 3, y - size * 0.32);
      g.stroke();
      g.strokeStyle = p.color;
      g.lineWidth = 2.5;
      g.stroke();
    }
    if (p.sub) {
      g.font = '800 14px system-ui, sans-serif';
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(10,6,16,0.85)';
      g.strokeText(p.sub, x, y + 18);
      g.fillText(p.sub, x, y + 18);
    }
  }
  g.globalAlpha = 1;

  // Outro: the threads dim while the last bar rings out.
  if (s.outro > 0) {
    g.fillStyle = `rgba(18,13,27,${0.55 * s.outro})`;
    g.fillRect(0, 0, L.w, L.hitY + L.padR + 8);
  }

  drawCloth(g, L, s.cloth);

  // Progress along the top.
  const prog = Math.max(0, Math.min(1, now / s.song.durationMs));
  g.fillStyle = 'rgba(255,255,255,0.08)';
  g.fillRect(0, 0, L.w, 3);
  g.fillStyle = '#ffc857';
  g.fillRect(0, 0, L.w * prog, 3);

  if (s.hint) {
    g.font = '600 12px system-ui, sans-serif';
    g.fillStyle = 'rgba(255,243,220,0.55)';
    g.fillText('tap a lane as its bead reaches the bar', L.w / 2, L.hitY - L.padR - 60);
  }
  if (s.title) {
    g.globalAlpha = s.outro > 0 ? s.outro : 1;
    g.font = '900 26px system-ui, sans-serif';
    g.fillStyle = '#fff3e0';
    g.fillText(s.title, L.w / 2, L.h * 0.42);
    if (s.sub) {
      g.font = '600 14px system-ui, sans-serif';
      g.fillStyle = 'rgba(255,243,220,0.7)';
      g.fillText(s.sub, L.w / 2, L.h * 0.42 + 26);
    }
    g.globalAlpha = 1;
  }
  if (s.countdown !== null) {
    g.font = '900 72px system-ui, sans-serif';
    g.fillStyle = '#fff3e0';
    g.fillText(String(s.countdown), L.w / 2, L.h * 0.45);
  }
}

const COLS = 24;

/** The woven cloth under the bar: newest row on top (at the shuttle), older rows below. */
export function drawCloth(g: CanvasRenderingContext2D, L: Layout, cloth: [number, Judgment][]): void {
  const top = L.clothY, bottom = L.h - 4;
  if (bottom - top < 10) return;
  const sw = (L.w - 2 * L.left) / COLS, sh = 7;
  const rows = Math.floor((bottom - top) / (sh + 1));
  const lastRow = Math.floor(Math.max(0, cloth.length - 1) / COLS);
  for (let r = 0; r < rows; r++) {
    const row = lastRow - r;
    if (row < 0) break;
    const y = top + r * (sh + 1);
    for (let c = 0; c < COLS; c++) {
      const i = row * COLS + c;
      if (i >= cloth.length) break;
      stitch(g, L.left + c * sw, y, sw, sh, cloth[i][0], cloth[i][1], (row + c) % 2 === 0);
    }
  }
}

function stitch(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, lane: number, j: Judgment, over: boolean): void {
  if (j === 2) {
    g.fillStyle = '#2a1a26';
    g.fillRect(x + 1, y, w - 2, h);
    g.strokeStyle = '#ff6b7a88';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(x + 2, y + h / 2);
    g.lineTo(x + w - 2, y + h / 2);
    g.stroke();
    return;
  }
  g.fillStyle = j === 0 ? LANE_COLORS[lane] : LANE_DIM[lane];
  g.fillRect(x + 0.5, y, w - 1, h);
  g.fillStyle = over ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.22)';
  g.fillRect(x + 0.5, over ? y : y + h - 2, w - 1, 2);
}

/** The finished tapestry for the results card. */
export function tapestry(cloth: [number, Judgment][], cols = COLS): HTMLCanvasElement {
  const sw = 12, sh = 8, pad = 8;
  const rows = Math.max(1, Math.ceil(cloth.length / cols));
  const c = document.createElement('canvas');
  c.width = cols * sw + pad * 2;
  c.height = rows * (sh + 1) + pad * 2;
  const g = c.getContext('2d')!;
  g.fillStyle = '#1a1222';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < cloth.length; i++) {
    const row = Math.floor(i / cols), col = i % cols;
    stitch(g, pad + col * sw, pad + row * (sh + 1), sw, sh, cloth[i][0], cloth[i][1], (row + col) % 2 === 0);
  }
  // Fringe.
  g.strokeStyle = '#c89b6d';
  g.lineWidth = 1;
  for (let x = pad + 3; x < c.width - pad; x += 6) {
    g.beginPath();
    g.moveTo(x, c.height - pad + 1);
    g.lineTo(x + 1, c.height - 1);
    g.stroke();
  }
  return c;
}

export interface CalibScene {
  L: Layout;
  time: number;
  /** Tap errors so far (ms, positive = late). */
  errs: number[];
  clicks: number;
  total: number;
  pulse: number;
  /** Seconds since the guide ring's last click (large when the ring is off). */
  ring: number;
  msg: string;
}

export function drawCalib(g: CanvasRenderingContext2D, s: CalibScene): void {
  const { L } = s;
  drawBackdrop(g, L);
  g.fillStyle = 'rgba(18,13,27,0.75)';
  g.fillRect(0, 0, L.w, L.h);
  const cx = L.w / 2, cy = L.h * 0.42;
  const r = Math.min(L.w * 0.3, 120);
  const k = Math.max(0, 1 - s.pulse / 0.25);
  g.strokeStyle = `rgba(255,200,87,${0.35 + 0.5 * k})`;
  g.lineWidth = 6;
  g.beginPath();
  g.arc(cx, cy, r + k * 10, 0, Math.PI * 2);
  g.stroke();
  // The guide: a ring that flashes outward on each click.
  const f = Math.max(0, 1 - s.ring / 0.3);
  if (f > 0) {
    g.strokeStyle = `rgba(143,230,200,${0.9 * f})`;
    g.lineWidth = 4 + 6 * f;
    g.beginPath();
    g.arc(cx, cy, r + 18 + (1 - f) * 26, 0, Math.PI * 2);
    g.stroke();
  }
  g.textAlign = 'center';
  g.fillStyle = '#fff3e0';
  g.font = '900 22px system-ui, sans-serif';
  g.fillText('Tap with the click', cx, cy - 6);
  g.font = '600 14px system-ui, sans-serif';
  g.fillStyle = 'rgba(255,243,220,0.75)';
  s.msg.split('\n').forEach((line, i) => g.fillText(line, cx, cy + 20 + i * 19));
  // Tap errors on a ±250 ms scale.
  const y = L.h * 0.72, w = L.w - 64, x0 = 32;
  g.strokeStyle = 'rgba(255,255,255,0.25)';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(x0, y);
  g.lineTo(x0 + w, y);
  g.stroke();
  g.fillStyle = 'rgba(255,243,220,0.6)';
  g.font = '600 11px system-ui, sans-serif';
  g.fillText('early', x0 + 20, y + 22);
  g.fillText('on the click', cx, y + 22);
  g.fillText('late', x0 + w - 16, y + 22);
  g.fillRect(cx - 1, y - 10, 2, 20);
  s.errs.forEach((e, i) => {
    const x = cx + (Math.max(-250, Math.min(250, e)) / 250) * (w / 2);
    g.fillStyle = i === s.errs.length - 1 ? '#ffc857' : 'rgba(255,200,87,0.45)';
    g.beginPath();
    g.arc(x, y, 6, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = 'rgba(255,243,220,0.6)';
  g.font = '600 13px system-ui, sans-serif';
  g.fillText(`${Math.min(s.clicks, s.total)} / ${s.total}`, cx, L.h * 0.86);
}
