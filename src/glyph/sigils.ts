// Procedural rune sigils: each rune gets a distinct glowing glyph drawn from
// a few strokes, colored by its hue. Tier shows as small marks below.

import { RUNES, type Rune, type RuneId } from './core';

type Stroke = (ctx: CanvasRenderingContext2D, R: number) => void;

const line = (x1: number, y1: number, x2: number, y2: number): Stroke => (ctx, R) => {
  ctx.moveTo(x1 * R, y1 * R);
  ctx.lineTo(x2 * R, y2 * R);
};
const circle = (x: number, y: number, r: number): Stroke => (ctx, R) => {
  ctx.moveTo(x * R + r * R, y * R);
  ctx.arc(x * R, y * R, r * R, 0, Math.PI * 2);
};
const arc = (x: number, y: number, r: number, a0: number, a1: number): Stroke => (ctx, R) => {
  ctx.moveTo(x * R + Math.cos(a0) * r * R, y * R + Math.sin(a0) * r * R);
  ctx.arc(x * R, y * R, r * R, a0, a1);
};

const SIGILS: Record<RuneId, Stroke[]> = {
  bolt: [line(-0.6, 0.6, 0.6, -0.6), line(0.6, -0.6, 0.15, -0.6), line(0.6, -0.6, 0.6, -0.15)],
  beam: [line(0, -0.8, 0, 0.8), line(-0.35, -0.5, 0.35, -0.5), line(-0.5, 0.5, 0.5, 0.5)],
  nova: [circle(0, 0, 0.25), circle(0, 0, 0.65), line(0, -0.8, 0, -0.65), line(0, 0.8, 0, 0.65), line(-0.8, 0, -0.65, 0), line(0.8, 0, 0.65, 0)],
  rain: [line(-0.5, -0.6, -0.3, 0.2), line(0, -0.7, 0.2, 0.6), line(0.5, -0.4, 0.65, 0.3), line(-0.7, -0.7, 0.7, -0.7)],
  orb: [circle(0, 0, 0.45), arc(0, 0, 0.75, -0.6, 0.9), arc(0, 0, 0.75, 2.5, 4.0)],
  fire: [line(0, 0.7, -0.45, 0), line(-0.45, 0, 0, -0.75), line(0, -0.75, 0.45, 0), line(0.45, 0, 0, 0.7), line(0, 0.7, 0, 0)],
  frost: [line(0, -0.75, 0, 0.75), line(-0.65, -0.37, 0.65, 0.37), line(-0.65, 0.37, 0.65, -0.37)],
  storm: [line(-0.2, -0.75, 0.3, -0.1), line(0.3, -0.1, -0.3, 0.1), line(-0.3, 0.1, 0.2, 0.75)],
  split: [line(0, 0.7, 0, 0), line(0, 0, -0.55, -0.6), line(0, 0, 0.55, -0.6), line(0, 0, 0, -0.75)],
  heavy: [line(-0.6, 0.55, 0.6, 0.55), line(-0.45, 0.55, -0.3, -0.5), line(0.45, 0.55, 0.3, -0.5), line(-0.3, -0.5, 0.3, -0.5)],
  pierce: [line(-0.75, 0, 0.75, 0), line(0.75, 0, 0.35, -0.35), line(0.75, 0, 0.35, 0.35), circle(-0.3, 0, 0.15), circle(0.15, 0, 0.15)],
  haste: [line(-0.6, -0.55, 0, 0), line(0, 0, -0.6, 0.55), line(-0.05, -0.55, 0.55, 0), line(0.55, 0, -0.05, 0.55)],
  leech: [arc(0, -0.15, 0.45, Math.PI, 0), line(-0.45, -0.15, 0, 0.7), line(0.45, -0.15, 0, 0.7)],
  gild: [circle(0, 0, 0.6), line(0, -0.35, 0, 0.35), line(-0.25, -0.15, 0.25, -0.15), line(-0.25, 0.15, 0.25, 0.15)],
  echo: [arc(-0.2, 0, 0.35, -1.2, 1.2), arc(-0.2, 0, 0.6, -1.0, 1.0), arc(-0.2, 0, 0.85, -0.8, 0.8)],
};

export function drawSigil(c: HTMLCanvasElement, r: Rune | null, css: number, opts: { dim?: boolean } = {}): void {
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (c.width !== Math.round(css * dpr)) {
    c.width = Math.round(css * dpr);
    c.height = Math.round(css * dpr);
  }
  const ctx = c.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, css, css);
  if (!r) return;
  const def = RUNES[r.id];
  ctx.translate(css / 2, css / 2 - css * 0.04);
  const R = css * 0.3;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = `hsla(${def.hue}, 100%, ${opts.dim ? 45 : 68}%, 1)`;
  ctx.shadowColor = `hsla(${def.hue}, 100%, 60%, 0.9)`;
  ctx.shadowBlur = opts.dim ? 0 : css * 0.12;
  ctx.lineWidth = Math.max(2, css * 0.055) * (r.tier === 3 ? 1.35 : r.tier === 2 ? 1.15 : 1);
  ctx.beginPath();
  for (const s of SIGILS[r.id]) s(ctx, R);
  ctx.stroke();
  // Tier marks.
  ctx.shadowBlur = 0;
  ctx.fillStyle = r.tier === 3 ? '#ffd166' : `hsl(${def.hue}, 90%, 75%)`;
  for (let i = 0; i < r.tier; i++) {
    ctx.beginPath();
    ctx.arc((i - (r.tier - 1) / 2) * css * 0.13, css * 0.38, css * 0.035, 0, Math.PI * 2);
    ctx.fill();
  }
}
