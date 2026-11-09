// Drawing the invented script: glyph strokes in a box, cartouches around
// names, and small marks attached under (plural) or over (tense) a word.

import type { Glyph, Language, Stroke } from '../core/lang';
import type { Token } from '../core/sentence';

function strokePath(g: CanvasRenderingContext2D, s: Stroke, x: number, y: number, size: number) {
  const X = (v: number) => x + v * size;
  const Y = (v: number) => y + v * size;
  switch (s.k) {
    case 'L':
      g.moveTo(X(s.x1), Y(s.y1));
      g.lineTo(X(s.x2), Y(s.y2));
      break;
    case 'Q':
      g.moveTo(X(s.x1), Y(s.y1));
      g.quadraticCurveTo(X(s.cx), Y(s.cy), X(s.x2), Y(s.y2));
      break;
    case 'O':
      g.moveTo(X(s.x) + s.r * size, Y(s.y));
      g.arc(X(s.x), Y(s.y), s.r * size, 0, Math.PI * 2);
      break;
    case 'D':
      break;
  }
}

/** Draw one glyph into the square (x, y, size). */
export function drawGlyph(g: CanvasRenderingContext2D, glyph: Glyph, lang: Language, x: number, y: number, size: number, color = lang.style.ink): void {
  const w = Math.max(1.2, lang.style.weight * size);
  g.save();
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath();
  for (const s of glyph.strokes) strokePath(g, s, x, y, size);
  g.stroke();
  for (const s of glyph.strokes) {
    if (s.k !== 'D') continue;
    g.beginPath();
    g.arc(x + s.x * size, y + s.y * size, w * 0.95, 0, Math.PI * 2);
    g.fill();
  }
  if (glyph.frame) {
    // Cartouche: a rounded frame with a little tick at the base.
    const p = size * 0.06;
    const r = size * 0.2;
    g.lineWidth = w * 0.8;
    g.beginPath();
    g.roundRect(x + p, y + p, size - 2 * p, size - 2 * p, r);
    g.stroke();
    g.beginPath();
    g.moveTo(x + size * 0.35, y + size - p);
    g.lineTo(x + size * 0.65, y + size - p);
    g.lineWidth = w * 1.4;
    g.stroke();
  }
  g.restore();
}

/** Draw a written word: its glyph, with marks under/over it at small scale. */
export function drawToken(g: CanvasRenderingContext2D, lang: Language, t: Token, x: number, y: number, size: number, color?: string): void {
  const markSize = size * 0.42;
  const hasOver = t.marks.some((m) => lang.glyphs[m].mark === 'over');
  const hasUnder = t.marks.some((m) => lang.glyphs[m].mark === 'under');
  // Shrink the main glyph a little when marks need room.
  const shrink = (hasOver ? 0.18 : 0) + (hasUnder ? 0.18 : 0);
  const gs = size * (1 - shrink);
  const gy = y + (hasOver ? size * 0.18 : 0);
  drawGlyph(g, lang.glyphs[t.m], lang, x + (size - gs) / 2, gy, gs, color);
  for (const m of t.marks) {
    const mg = lang.glyphs[m];
    const my = mg.mark === 'over' ? y - markSize * 0.25 : y + size - markSize * 0.75;
    drawGlyph(g, mg, lang, x + (size - markSize) / 2, my, markSize, color);
  }
}

/** A canvas showing one token, sized in CSS pixels, for use in the DOM. */
export function tokenCanvas(lang: Language, t: Token, css: number, color?: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(css * dpr);
  c.style.width = c.style.height = `${css}px`;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawToken(g, lang, t, css * 0.08, css * 0.08, css * 0.84, color);
  return c;
}

/** A canvas showing a bare glyph (or a mark on its own, drawn large). */
export function glyphCanvas(lang: Language, id: string, css: number, color?: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  c.width = c.height = Math.round(css * dpr);
  c.style.width = c.style.height = `${css}px`;
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const glyph = lang.glyphs[id];
  if (glyph.mark) {
    // Show a mark attached to a faint placeholder square, so it reads as "a mark on a word".
    g.strokeStyle = 'rgba(80, 60, 40, 0.25)';
    g.setLineDash([3, 3]);
    g.strokeRect(css * 0.25, css * (glyph.mark === 'over' ? 0.42 : 0.12), css * 0.5, css * 0.46);
    g.setLineDash([]);
    drawGlyph(g, glyph, lang, css * 0.25, glyph.mark === 'over' ? css * 0.06 : css * 0.6, css * 0.5, color);
  } else drawGlyph(g, glyph, lang, css * 0.08, css * 0.08, css * 0.84, color);
  return c;
}
