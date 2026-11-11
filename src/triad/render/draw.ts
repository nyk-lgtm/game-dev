// Drawing the Triad board: hex cells, element icons, clue numbers, notes.

import { fitHexes, hexPath, hexToPx, type HexLayout } from '../../shared/hexlayout';
import { makeBoard, type Puzzle } from '../core';

/** Element icons as SVG paths in a 24x24 box (also used for the HTML buttons). */
export const ICON = [
  // Fire
  'M12 1.5c.8 4 6.5 6.3 6.5 12.6a6.5 6.5 0 0 1-13 0c0-3.4 1.9-5.4 3.2-7.4.2 2.3 1.2 3.4 2.4 3.6C11 7.3 10.4 4.6 12 1.5z',
  // Water
  'M12 2c3.4 5 7 8.7 7 13.2a7 7 0 0 1-14 0C5 10.7 8.6 7 12 2z',
  // Leaf
  'M20.5 3.5C10.5 3.5 4 8.6 4 15.6c0 1.8.7 3.2 1.8 4.2 1-4.6 4.4-8.3 9.2-10.6-4 2.9-6.6 6.1-7.6 10.9 8.6 1.2 13.6-5.6 13.1-16.6z',
];
export const COLOR = ['#ff8a3d', '#4fb3ff', '#6fd36f'];
const FILL = ['#5a2a14', '#143a5c', '#1f4a22'];
const PATHS = typeof Path2D === 'undefined' ? [] : ICON.map((d) => new Path2D(d));

export function iconSvg(e: number, size = 24): string {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${ICON[e]}" fill="${COLOR[e]}"/></svg>`;
}

function drawIcon(g: CanvasRenderingContext2D, e: number, x: number, y: number, size: number, alpha = 1) {
  g.save();
  g.translate(x - size / 2, y - size / 2);
  g.scale(size / 24, size / 24);
  g.globalAlpha = alpha;
  g.fillStyle = COLOR[e];
  g.fill(PATHS[e]);
  g.restore();
}

export interface View {
  L: HexLayout;
  w: number;
  h: number;
}

export function layout(p: Puzzle, w: number, h: number): View {
  return { L: fitHexes(makeBoard(p.radius).cells, w, h, 10), w, h };
}

export interface DrawOpts {
  vals: number[];
  notes: number[];
  selected: number;
  broken: Set<number>;
  /** Hint highlight: the clue cell and the cell it decides. */
  hint: { clue: number; cell: number } | null;
  /** 0..1 win wave, or -1. */
  win: number;
  time: number;
}

export function drawBoard(g: CanvasRenderingContext2D, v: View, p: Puzzle, o: DrawOpts): void {
  const b = makeBoard(p.radius);
  const size = v.L.size;
  g.clearRect(0, 0, v.w, v.h);
  const hintRing = o.hint ? new Set([o.hint.clue, ...b.adj[o.hint.clue]]) : null;
  b.cells.forEach((c, i) => {
    const { x, y } = hexToPx(v.L, c.q, c.r);
    const val = p.given[i] >= 0 ? p.given[i] : o.vals[i];
    const ring = Math.abs(c.q) + Math.abs(c.r) + Math.abs(c.q + c.r);
    const lift = o.win >= 0 ? Math.max(0, Math.sin((o.win * 3 - ring / 12) * Math.PI)) * 0.12 : 0;
    hexPath(g, x, y, size * (0.94 + lift));
    g.fillStyle = val >= 0 ? FILL[val] : '#1b2030';
    g.fill();
    if (hintRing && !hintRing.has(i)) {
      g.fillStyle = 'rgba(8, 10, 16, 0.55)';
      g.fill();
    }
    g.lineWidth = 1.5;
    g.strokeStyle = val >= 0 ? `${COLOR[val]}55` : '#2c3347';
    g.stroke();
    if (p.given[i] >= 0) {
      // Givens: a carved inner ring.
      hexPath(g, x, y, size * 0.8);
      g.strokeStyle = `${COLOR[val]}aa`;
      g.lineWidth = 2;
      g.stroke();
    }
    const clue = p.clue[i];
    if (val >= 0) drawIcon(g, val, x, y + (clue >= 0 ? size * 0.12 : 0), size * (clue >= 0 ? 0.95 : 1.05), clue >= 0 ? 0.55 : 1);
    else if (o.notes[i]) {
      for (let e = 0; e < 3; e++)
        if (o.notes[i] & (1 << e)) drawIcon(g, e, x + (e - 1) * size * 0.42, y + size * (clue >= 0 ? 0.5 : 0), size * 0.36);
    }
    if (clue >= 0) {
      const bad = o.broken.has(i);
      g.font = `800 ${Math.round(size * (val >= 0 ? 0.72 : 0.8))}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const ty = y - (val < 0 && o.notes[i] ? size * 0.12 : 0);
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(8, 10, 16, 0.85)';
      g.strokeText(String(clue), x, ty);
      g.fillStyle = bad ? '#ff5d7a' : '#f4f1ea';
      g.fillText(String(clue), x, ty);
      if (bad) {
        hexPath(g, x, y, size * 0.88);
        g.strokeStyle = '#ff5d7a';
        g.lineWidth = 2.5;
        g.stroke();
      }
    }
  });
  // Selection and hint outlines on top.
  const outline = (i: number, color: string, w: number) => {
    const c = b.cells[i];
    const { x, y } = hexToPx(v.L, c.q, c.r);
    hexPath(g, x, y, size * 0.94);
    g.strokeStyle = color;
    g.lineWidth = w;
    g.stroke();
  };
  if (o.hint) {
    outline(o.hint.clue, '#ffd77a', 3);
    if (o.hint.cell !== o.hint.clue) outline(o.hint.cell, `rgba(255, 255, 255, ${0.6 + 0.4 * Math.sin(o.time * 6)})`, 3);
  }
  if (o.selected >= 0) outline(o.selected, '#ffffff', 3.5);
}
