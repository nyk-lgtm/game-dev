// Drawing the Triad board: hex cells, element icons, clue numbers, notes, and
// links (an "=" badge on the edge between two hexes).

import { fitHexes, hexPath, hexToPx, type HexLayout } from '../../shared/hexlayout';
import { clueCells, isLink, linkCells, makeBoard, type Board, type Puzzle } from '../core';

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
const LINK_COLOR = '#f4f1ea';
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

/** A link mark as inline SVG: two hexes sharing an edge, with the "=" across it (for cards). */
export function linkSvg(size = 40): string {
  const hex = (cy: number) =>
    [...Array(6).keys()].map((k) => `${(20 + 11 * Math.cos((k * Math.PI) / 3)).toFixed(1)},${(cy + 11 * Math.sin((k * Math.PI) / 3)).toFixed(1)}`).join(' ');
  const h = 11 * Math.sqrt(3) / 2;
  const top = 20 - h;
  const bot = 20 + h;
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true" style="vertical-align:middle">
    <polygon points="${hex(top)}" fill="${FILL[2]}" stroke="#2c3347"/><polygon points="${hex(bot)}" fill="${FILL[2]}" stroke="#2c3347"/>
    <g stroke="${LINK_COLOR}" stroke-width="2.4" stroke-linecap="round"><line x1="16" y1="17.6" x2="24" y2="17.6"/><line x1="16" y1="22.4" x2="24" y2="22.4"/></g></svg>`;
}

/** A link: an upright "=" on a dark badge over the middle of the shared edge. */
function drawLink(g: CanvasRenderingContext2D, v: View, b: Board, id: number, color: string, alpha: number, wide = false) {
  const [i, j] = linkCells(b, id);
  const A = hexToPx(v.L, b.cells[i].q, b.cells[i].r);
  const B = hexToPx(v.L, b.cells[j].q, b.cells[j].r);
  const size = v.L.size;
  const mx = (A.x + B.x) / 2;
  const my = (A.y + B.y) / 2;
  // Always an upright "=" on a small dark badge at the edge's middle, so it reads the same on every edge.
  const ux = 0;
  const uy = 1;
  const half = size * (wide ? 0.2 : 0.16);
  const off = size * 0.085;
  g.save();
  g.globalAlpha = alpha;
  g.fillStyle = 'rgba(8, 10, 16, 0.9)';
  g.beginPath();
  g.arc(mx, my, size * (wide ? 0.3 : 0.26), 0, Math.PI * 2);
  g.fill();
  g.lineCap = 'round';
  for (const [w, c] of [
    [Math.max(4.5, size * 0.2), 'rgba(8, 10, 16, 0.85)'],
    [Math.max(2.2, size * 0.09) * (wide ? 1.25 : 1), color],
  ] as const) {
    g.lineWidth = w;
    g.strokeStyle = c;
    g.beginPath();
    for (const s of [-1, 1]) {
      const cx = mx + ux * off * s;
      const cy = my + uy * off * s;
      g.moveTo(cx - uy * half, cy + ux * half);
      g.lineTo(cx + uy * half, cy - ux * half);
    }
    g.stroke();
  }
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
  hint: { clue: number; cell: number; clues?: number[] } | null;
  /** 0..1 win wave, or -1. */
  win: number;
  time: number;
}

export function drawBoard(g: CanvasRenderingContext2D, v: View, p: Puzzle, o: DrawOpts): void {
  const b = makeBoard(p.radius);
  const size = v.L.size;
  g.clearRect(0, 0, v.w, v.h);
  const hintClues = o.hint ? (o.hint.clues?.length ? o.hint.clues : [o.hint.clue]) : [];
  const hintRing = o.hint ? new Set([o.hint.cell, ...hintClues.flatMap((c) => clueCells(b, c))]) : null;
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
    // Filled numbered hexes keep a small, full-strength icon above the number
    // (a bit lower and smaller in links mode, clear of a link on the top edge).
    const lk = p.links ? 1 : 0;
    if (val >= 0) clue >= 0 ? drawIcon(g, val, x, y - size * (0.5 - 0.08 * lk), size * (0.42 - 0.06 * lk)) : drawIcon(g, val, x, y, size * 1.05);
    else if (o.notes[i]) {
      for (let e = 0; e < 3; e++)
        if (o.notes[i] & (1 << e)) drawIcon(g, e, x + (e - 1) * size * 0.42, y + size * (clue >= 0 ? 0.5 : 0), size * 0.36);
    }
    if (clue >= 0) {
      const bad = o.broken.has(i);
      // Done: it and all its neighbors are filled and it adds up.
      const full = (k: number) => (p.given[k] >= 0 ? p.given[k] : o.vals[k]) >= 0;
      const settled = !bad && full(i) && b.adj[i].every(full);
      g.globalAlpha = settled ? 0.4 : 1;
      g.font = `800 ${Math.round(size * (val >= 0 ? 0.62 : 0.8))}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const ty = y + (val >= 0 ? size * (0.16 + 0.04 * lk) : val < 0 && o.notes[i] ? -size * 0.12 : 0);
      g.lineWidth = 4;
      g.strokeStyle = 'rgba(8, 10, 16, 0.85)';
      g.strokeText(String(clue), x, ty);
      g.fillStyle = bad ? '#ff5d7a' : '#f4f1ea';
      g.fillText(String(clue), x, ty);
      g.globalAlpha = 1;
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
    // A number's hex gets the gold ring; a link rings the hex across it from the hinted one.
    for (const c of hintClues) {
      if (!isLink(b, c)) outline(c, '#ffd77a', 3);
      else for (const k of linkCells(b, c)) if (k !== o.hint.cell) outline(k, '#ffd77a', 3);
    }
    if (o.hint.cell !== o.hint.clue) outline(o.hint.cell, `rgba(255, 255, 255, ${0.6 + 0.4 * Math.sin(o.time * 6)})`, 3);
  }
  if (o.selected >= 0) outline(o.selected, '#ffffff', 3.5);
  // Links on top, so outlines never hide them.
  const val = (k: number) => (p.given[k] >= 0 ? p.given[k] : o.vals[k]);
  for (let id = b.cells.length; id < p.clue.length; id++) {
    if (p.clue[id] < 0) continue;
    const [i, j] = linkCells(b, id);
    if (hintClues.includes(id)) drawLink(g, v, b, id, '#ffd77a', 1, true);
    else if (o.broken.has(id)) drawLink(g, v, b, id, '#ff5d7a', 1, true);
    else {
      // Faded once both hexes are filled (and match), and while a hint dims the rest.
      const settled = val(i) >= 0 && val(j) >= 0;
      const dim = hintRing && !(hintRing.has(i) && hintRing.has(j));
      drawLink(g, v, b, id, LINK_COLOR, settled ? 0.4 : dim ? 0.5 : 1);
    }
  }
}
