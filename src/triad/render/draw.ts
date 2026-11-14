// Drawing the Triad board: hex cells, element icons, clue numbers, notes, and
// links (a small "=" pill lying on the edge between two hexes).

import { fitHexes, hexPath, hexToPx, type HexLayout } from '../../shared/hexlayout';
import { clueCells, isLink, linkCells, makeBoard, single, type Board, type Puzzle, type TrialView } from '../core';

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

/** A link mark as inline SVG: two hexes sharing an edge, with the badge on it (for cards). */
export function linkSvg(size = 40): string {
  const hex = (cy: number) =>
    [...Array(6).keys()].map((k) => `${(20 + 11 * Math.cos((k * Math.PI) / 3)).toFixed(1)},${(cy + 11 * Math.sin((k * Math.PI) / 3)).toFixed(1)}`).join(' ');
  const h = (11 * Math.sqrt(3)) / 2;
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true" style="vertical-align:middle">
    <polygon points="${hex(20 - h)}" fill="${FILL[2]}" stroke="#2c3347"/><polygon points="${hex(20 + h)}" fill="${FILL[2]}" stroke="#2c3347"/>
    <line x1="16" y1="20" x2="24" y2="20" stroke="${LINK_RIM}" stroke-width="7.6" stroke-linecap="round"/>
    <line x1="16" y1="20" x2="24" y2="20" stroke="${LINK_BADGE}" stroke-width="5.6" stroke-linecap="round"/>
    <g stroke="${LINK_COLOR}" stroke-width="1.6" stroke-linecap="round"><line x1="17.4" y1="18.8" x2="22.6" y2="18.8"/><line x1="17.4" y1="21.2" x2="22.6" y2="21.2"/></g></svg>`;
}

const LINK_RIM = '#a3acc4';
const LINK_BADGE = '#0b0e15';

/**
 * A link: a small dark pill lying along the shared edge (light rim), holding
 * an "=" whose bars run along the edge, so the edge passes between them.
 * `state`: normal, hint (gold) or broken (red, larger, thick rim).
 */
function drawLink(g: CanvasRenderingContext2D, v: View, b: Board, id: number, state: 'normal' | 'hint' | 'broken', alpha: number) {
  const [i, j] = linkCells(b, id);
  const A = hexToPx(v.L, b.cells[i].q, b.cells[i].r);
  const B = hexToPx(v.L, b.cells[j].q, b.cells[j].r);
  const size = v.L.size;
  const mx = (A.x + B.x) / 2;
  const my = (A.y + B.y) / 2;
  const d = Math.hypot(B.x - A.x, B.y - A.y);
  // Across the edge (center to center) and along it.
  const ax = (B.x - A.x) / d;
  const ay = (B.y - A.y) / d;
  const ex = -ay;
  const ey = ax;
  const big = state === 'normal' ? 1 : 1.18;
  const len = size * 0.15 * big; // pill half-length along the edge (to the cap centers)
  const thick = Math.max(7, size * 0.3) * big; // pill width across the edge
  const rim = state === 'broken' ? 3 : state === 'hint' ? 2.5 : 1.5;
  const color = state === 'broken' ? '#ff5d7a' : state === 'hint' ? '#ffd77a' : LINK_COLOR;
  const line = (ox: number, oy: number, half: number) => {
    g.beginPath();
    g.moveTo(mx + ox - ex * half, my + oy - ey * half);
    g.lineTo(mx + ox + ex * half, my + oy + ey * half);
    g.stroke();
  };
  g.save();
  g.globalAlpha = alpha;
  g.lineCap = 'round';
  g.lineWidth = thick + rim * 2;
  g.strokeStyle = state === 'normal' ? LINK_RIM : color;
  line(0, 0, len);
  g.lineWidth = thick;
  g.strokeStyle = LINK_BADGE;
  line(0, 0, len);
  // The "=": two short, thick bars along the edge, one each side of it.
  const gap = thick * 0.2;
  g.lineWidth = Math.max(1.8, thick * 0.17);
  g.strokeStyle = color;
  for (const sgn of [-1, 1]) line(ax * gap * sgn, ay * gap * sgn, len + thick * 0.12);
  g.restore();
}

/**
 * Pencil marks, big enough to read at a glance: a triangle (fire on top, water
 * left, leaf right) on a plain hex, a row under the number on a numbered one.
 */
function notePips(g: CanvasRenderingContext2D, mask: number, x: number, y: number, size: number, numbered: boolean, alpha = 1) {
  for (let e = 0; e < 3; e++) {
    if (!(mask & (1 << e))) continue;
    if (numbered) drawIcon(g, e, x + (e - 1) * size * 0.45, y + size * 0.37, size * 0.44, alpha);
    else drawIcon(g, e, x + (e === 0 ? 0 : e === 1 ? -0.38 : 0.38) * size, y + (e === 0 ? -0.36 : 0.3) * size, size * 0.5, alpha);
  }
}

export interface View {
  L: HexLayout;
  w: number;
  h: number;
}

/** The board fills the stage edge to edge (3 px spare): Large hexes are ~48 px tall at 390 px wide. */
export function layout(p: Puzzle, w: number, h: number): View {
  return { L: fitHexes(makeBoard(p.radius).cells, w, h, 3), w, h };
}

/** Seconds per step when a "what if" chain plays out on the board. */
export const TRIAL_STEP = 0.75;

/**
 * Which part of a "what if" is showing at time `t` (seconds since the hint):
 * chain entries below `shown` are drawn, and `broke` once the chain has run
 * into the broken clue. Loops, holding the full picture for a while; `still`
 * (reduced effects) shows everything at once.
 */
export function trialPhase(trial: TrialView, t: number, still = false): { shown: number; broke: boolean } {
  const n = trial.chain.length;
  if (still) return { shown: n, broke: true };
  const k = Math.floor(t / TRIAL_STEP) % (n + 5);
  return { shown: Math.min(k, n), broke: k > n };
}

export interface DrawOpts {
  vals: number[];
  notes: number[];
  selected: number;
  broken: Set<number>;
  /** Hint highlight: the clue cell and the cell it decides, every clue it uses, a "what if" chain (and when it started). */
  hint: { clue: number; cell: number; clues?: number[]; trial?: TrialView; t0?: number } | null;
  /** Show a "what if" chain whole instead of stepping through it. */
  still?: boolean;
  /** 0..1 win wave, or -1. */
  win: number;
  time: number;
}

export function drawBoard(g: CanvasRenderingContext2D, v: View, p: Puzzle, o: DrawOpts): void {
  const b = makeBoard(p.radius);
  const size = v.L.size;
  g.clearRect(0, 0, v.w, v.h);
  const hintClues = o.hint ? (o.hint.clues?.length ? o.hint.clues : [o.hint.clue]) : [];
  const trial = o.hint?.trial;
  const phase = trial ? trialPhase(trial, o.time - (o.hint!.t0 ?? 0), o.still) : null;
  // Ghosts of a "what if": the supposed value, then what it forces, step by step.
  const ghost = new Map<number, { left: number; n: number }>();
  if (trial && phase) {
    ghost.set(trial.cell, { left: 1 << trial.value, n: 0 });
    trial.chain.slice(0, phase.shown).forEach((c, k) => ghost.set(c.cell, { left: c.left, n: k + 1 }));
  }
  const hintRing = o.hint
    ? new Set([o.hint.cell, ...hintClues.flatMap((c) => clueCells(b, c)), ...(trial ? [...trial.chain.map((c) => c.cell), ...clueCells(b, trial.breaks)] : [])])
    : null;
  b.cells.forEach((c, i) => {
    const { x, y } = hexToPx(v.L, c.q, c.r);
    const val = p.given[i] >= 0 ? p.given[i] : o.vals[i];
    const ring = Math.abs(c.q) + Math.abs(c.r) + Math.abs(c.q + c.r);
    const lift = o.win >= 0 ? Math.max(0, Math.sin((o.win * 3 - ring / 12) * Math.PI)) * 0.12 : 0;
    hexPath(g, x, y, size * (0.94 + lift));
    g.fillStyle = val >= 0 ? FILL[val] : '#1b2030';
    g.fill();
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
    const gh = val < 0 ? ghost.get(i) : undefined;
    const pips = gh ? (single(gh.left) < 0 ? gh.left : 0) : o.notes[i];
    if (val >= 0) clue >= 0 ? drawIcon(g, val, x, y - size * (0.5 - 0.08 * lk), size * (0.42 - 0.06 * lk)) : drawIcon(g, val, x, y, size * 1.05);
    else if (gh && single(gh.left) >= 0) {
      // A ghost: dashed rim in its element's color and a faded icon.
      const e = single(gh.left);
      hexPath(g, x, y, size * 0.8);
      g.setLineDash([size * 0.12, size * 0.1]);
      g.strokeStyle = COLOR[e];
      g.lineWidth = 2;
      g.stroke();
      g.setLineDash([]);
      clue >= 0 ? drawIcon(g, e, x, y - size * 0.5, size * 0.42, 0.75) : drawIcon(g, e, x, y, size * 0.95, 0.6);
    }
    if (val < 0 && pips) notePips(g, pips, x, y, size, clue >= 0, gh ? 0.7 : 1);
    if (clue >= 0) {
      const bad = o.broken.has(i) || (!!phase?.broke && trial!.breaks === i);
      // Done: it and all its neighbors are filled and it adds up.
      const full = (k: number) => (p.given[k] >= 0 ? p.given[k] : o.vals[k]) >= 0;
      const settled = !bad && full(i) && b.adj[i].every(full);
      g.globalAlpha = settled ? 0.4 : 1;
      g.font = `800 ${Math.round(size * (val >= 0 ? 0.62 : 0.8))}px system-ui, sans-serif`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const withPips = val < 0 && pips !== 0;
      if (withPips || gh) g.font = `800 ${Math.round(size * 0.62)}px system-ui, sans-serif`;
      const ty = y + (val >= 0 ? size * (0.16 + 0.04 * lk) : withPips ? -size * 0.26 : gh ? size * 0.16 : 0);
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
    // While a hint is up, everything it doesn't read sinks back (icons and numbers too).
    if (hintRing && !hintRing.has(i)) {
      hexPath(g, x, y, size * 0.95);
      g.fillStyle = 'rgba(8, 10, 16, 0.6)';
      g.fill();
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
      if (trial && c === trial.breaks) continue;
      if (!isLink(b, c)) outline(c, '#ffd77a', 3);
      else for (const k of linkCells(b, c)) if (k !== o.hint.cell) outline(k, '#ffd77a', 3);
    }
    // The clue a "what if" breaks: red, brighter once the chain reaches it.
    if (trial && phase && !isLink(b, trial.breaks)) outline(trial.breaks, phase.broke ? `rgba(255, 93, 122, ${0.75 + 0.25 * Math.sin(o.time * 8)})` : 'rgba(255, 93, 122, 0.55)', phase.broke ? 4 : 2.5);
    if (o.hint.cell !== o.hint.clue) outline(o.hint.cell, `rgba(255, 255, 255, ${0.6 + 0.4 * Math.sin(o.time * 6)})`, 3);
  }
  if (o.selected >= 0) outline(o.selected, '#ffffff', 3.5);
  // Links on top, so outlines never hide them.
  const val = (k: number) => (p.given[k] >= 0 ? p.given[k] : o.vals[k]);
  for (let id = b.cells.length; id < p.clue.length; id++) {
    if (p.clue[id] < 0) continue;
    const [i, j] = linkCells(b, id);
    if (trial && id === trial.breaks) drawLink(g, v, b, id, 'broken', phase?.broke ? 1 : 0.7);
    else if (hintClues.includes(id)) drawLink(g, v, b, id, 'hint', 1);
    else if (o.broken.has(id)) drawLink(g, v, b, id, 'broken', 1);
    else {
      // Faded once both hexes are filled (and match), and while a hint dims the rest.
      const settled = val(i) >= 0 && val(j) >= 0;
      const dim = hintRing && !(hintRing.has(i) && hintRing.has(j));
      drawLink(g, v, b, id, 'normal', settled ? 0.4 : dim ? 0.5 : 1);
    }
  }
  // Step badges on the ghosts' top-right corners: ? for the supposition, then 1, 2, 3...
  for (const [i, gh] of ghost) {
    if ((p.given[i] >= 0 ? p.given[i] : o.vals[i]) >= 0) continue;
    const { x, y } = hexToPx(v.L, b.cells[i].q, b.cells[i].r);
    const bx = x + size * 0.5;
    const by = y - size * 0.58;
    const r = Math.max(7, size * 0.24);
    g.beginPath();
    g.arc(bx, by, r, 0, Math.PI * 2);
    g.fillStyle = gh.n ? '#2c3347' : '#ffd77a';
    g.fill();
    g.lineWidth = 1.5;
    g.strokeStyle = '#ffd77a';
    g.stroke();
    g.font = `800 ${Math.round(r * 1.25)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = gh.n ? '#ffd77a' : '#11141d';
    g.fillText(gh.n ? String(gh.n) : '?', bx, by + 1);
  }
}
