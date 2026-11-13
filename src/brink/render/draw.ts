// Drawing the Brink island: basalt tiles with a cliff edge, cracks on tiles
// about to fall, stones (yours ivory, the AI's coral), move markers, the last
// move, hints, and sprites for stones and tiles in motion.

import { fitHexes, hexPath, hexToPx, type HexLayout } from '../../shared/hexlayout';
import { CELLS, N } from '../core/board';
import { DARK, HOLE, LIGHT, type Side } from '../core/rules';

export const STONE = {
  [LIGHT]: { top: '#fbf6ea', mid: '#e9dfc8', rim: '#a8987a', name: 'ivory' },
  [DARK]: { top: '#ff9a7e', mid: '#e8553c', rim: '#8e2a1d', name: 'coral' },
} as const;

export interface View {
  L: HexLayout;
  w: number;
  h: number;
}

export function layout(w: number, h: number): View {
  // Leave room under the island for its cliff edge.
  const L = fitHexes([...CELLS], w, h - 10, 10);
  return { L, w, h };
}

export const cellPx = (v: View, i: number): { x: number; y: number } => hexToPx(v.L, CELLS[i].q, CELLS[i].r);

export interface Sprite {
  x: number;
  y: number;
  side: Side;
  scale: number;
  alpha: number;
}

export interface Target {
  cell: number;
  from: number;
  /** A shove (arrow) rather than a step (dot). */
  push: boolean;
  /** plain; kill: an enemy stone is lost (over, into a hole, or with a falling tile); oops: one of yours is. */
  kind: 'plain' | 'kill' | 'oops';
}

/** Colours for the next tiles to fall: 1st, 2nd, 3rd. */
export const DOOM_COLOR = ['', '#ff5a4a', '#ff9a4a', '#ffd27a'];

export interface Scene {
  cells: Int8Array;
  /** Cells whose stone is drawn as a sprite instead (moving). */
  hide: Set<number>;
  sprites: Sprite[];
  /** Tiles falling away: progress 0..1. */
  falling: Map<number, number>;
  /** Plies until a tile falls (1..3), for cracks. */
  doom: Map<number, number>;
  selected: number;
  targets: Target[];
  last: { from: number; to: number; side: Side; pushed: [number, number, Side][] } | null;
  hint: { from: number; to: number } | null;
  /** Cells to ring red (where a stone would go over). */
  danger: number[];
  time: number;
  /** Screen shake offset in px. */
  shake: number;
  reduced: boolean;
}

// A fixed, pleasing crack pattern per tile (no randomness: seeded by the cell).
function crackLines(i: number): number[][] {
  const out: number[][] = [];
  let h = (i + 1) * 2654435761;
  const rnd = () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h >>> 0) % 1000) / 1000;
  };
  for (let k = 0; k < 4; k++) {
    const a = rnd() * Math.PI * 2;
    const pts = [0, 0];
    let x = 0;
    let y = 0;
    for (let j = 0; j < 3; j++) {
      const aa = a + (rnd() - 0.5) * 1.1;
      x += Math.cos(aa) * 0.3;
      y += Math.sin(aa) * 0.3;
      pts.push(x, y);
    }
    out.push(pts);
  }
  return out;
}
const CRACKS = Array.from({ length: N }, (_, i) => crackLines(i));

function tile(g: CanvasRenderingContext2D, x: number, y: number, s: number, doom: number, t: number, reduced: boolean, i: number) {
  const depth = s * 0.26;
  // Cliff (the tile's thickness), then the top.
  hexPath(g, x, y + depth, s * 0.96);
  g.fillStyle = doom === 1 ? '#3a1f1c' : '#1c2523';
  g.fill();
  hexPath(g, x, y, s * 0.96);
  const grd = g.createLinearGradient(x, y - s, x, y + s);
  if (doom === 1) {
    const pulse = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(t * 6);
    grd.addColorStop(0, `rgb(${110 + 30 * pulse},70,60)`);
    grd.addColorStop(1, '#4a2a26');
  } else {
    grd.addColorStop(0, '#5d7470');
    grd.addColorStop(1, '#3d4f4b');
  }
  g.fillStyle = grd;
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.35)';
  g.lineWidth = 1;
  g.stroke();
  if (doom) {
    // Bigger, darker cracks the sooner a tile falls: 4 long ones, then 3, then 2 short.
    const lines = CRACKS[i].slice(0, doom === 1 ? 4 : doom === 2 ? 3 : 2);
    const len = doom === 1 ? 1 : doom === 2 ? 0.75 : 0.5;
    g.save();
    g.strokeStyle = doom === 1 ? 'rgba(20,6,4,0.95)' : 'rgba(18,24,22,0.85)';
    g.lineWidth = doom === 1 ? 2.4 : doom === 2 ? 1.7 : 1.2;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const p of lines) {
      g.beginPath();
      g.moveTo(x + p[0] * s * len, y + p[1] * s * len);
      for (let k = 2; k < p.length; k += 2) g.lineTo(x + p[k] * s * len, y + p[k + 1] * s * len);
      g.stroke();
    }
    g.restore();
  }
}

export function drawStone(g: CanvasRenderingContext2D, x: number, y: number, r: number, side: Side, alpha = 1) {
  const c = STONE[side];
  g.save();
  g.globalAlpha = alpha;
  // Shadow.
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(x, y + r * 0.32, r * 0.98, r * 0.78, 0, 0, Math.PI * 2);
  g.fill();
  // Body.
  const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.45, r * 0.1, x, y, r);
  grd.addColorStop(0, c.top);
  grd.addColorStop(0.7, c.mid);
  grd.addColorStop(1, c.rim);
  g.fillStyle = grd;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = 1;
  g.stroke();
  g.restore();
}

function arrow(g: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, width: number, head: number) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  g.strokeStyle = color;
  g.fillStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1 - Math.cos(a) * head * 0.6, y1 - Math.sin(a) * head * 0.6);
  g.stroke();
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x1 - Math.cos(a - 0.5) * head, y1 - Math.sin(a - 0.5) * head);
  g.lineTo(x1 - Math.cos(a + 0.5) * head, y1 - Math.sin(a + 0.5) * head);
  g.closePath();
  g.fill();
}

export function drawScene(g: CanvasRenderingContext2D, v: View, sc: Scene): void {
  const s = v.L.size;
  g.save();
  g.clearRect(0, 0, v.w, v.h);
  g.translate(sc.shake ? Math.sin(sc.time * 70) * sc.shake : 0, 0);
  // Tiles, back to front so a lower tile's top covers the cliff above it.
  for (let i = 0; i < N; i++) {
    const p = cellPx(v, i);
    const f = sc.falling.get(i);
    if (f !== undefined) {
      g.save();
      g.globalAlpha = Math.max(0, 1 - f);
      const yy = p.y + f * f * s * 2.2;
      g.translate(p.x, yy);
      g.scale(1 - 0.35 * f, 1 - 0.35 * f);
      tile(g, 0, 0, s, 1, sc.time, sc.reduced, i);
      if (sc.cells[i] === LIGHT || sc.cells[i] === DARK) if (!sc.hide.has(i)) drawStone(g, 0, 0, s * 0.6, sc.cells[i] as Side);
      g.restore();
      continue;
    }
    if (sc.cells[i] === HOLE) {
      // A faint outline where the tile was.
      hexPath(g, p.x, p.y, s * 0.9);
      g.strokeStyle = 'rgba(120,150,190,0.08)';
      g.lineWidth = 1;
      g.stroke();
      continue;
    }
    tile(g, p.x, p.y, s, sc.doom.get(i) ?? 0, sc.time, sc.reduced, i);
  }
  // Last move: a soft trail from where the stone came from.
  if (sc.last) {
    const a = cellPx(v, sc.last.from);
    const b = cellPx(v, sc.last.to);
    g.save();
    g.globalAlpha = 0.55;
    g.fillStyle = sc.last.side === LIGHT ? '#fbf6ea' : '#ff8a6e';
    g.beginPath();
    g.arc(a.x, a.y, s * 0.14, 0, Math.PI * 2);
    g.fill();
    g.setLineDash([3, 4]);
    g.strokeStyle = g.fillStyle;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x, b.y);
    g.stroke();
    // Stones it shoved: a fainter trail each (over the edge: toward the void).
    g.lineWidth = 1.6;
    for (const [from, to, side] of sc.last.pushed) {
      const p0 = cellPx(v, from);
      const p1 = to >= 0 ? cellPx(v, to) : { x: p0.x + (b.x - a.x) * 0.8, y: p0.y + (b.y - a.y) * 0.8 };
      g.strokeStyle = g.fillStyle = side === LIGHT ? '#fbf6ea' : '#ff8a6e';
      g.beginPath();
      g.arc(p0.x, p0.y, s * 0.1, 0, Math.PI * 2);
      g.fill();
      g.beginPath();
      g.moveTo(p0.x, p0.y);
      g.lineTo(p1.x, p1.y);
      g.stroke();
    }
    g.restore();
  }
  // Selection ring under the stone.
  if (sc.selected >= 0) {
    const p = cellPx(v, sc.selected);
    g.strokeStyle = '#ffd77a';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(p.x, p.y, s * 0.78, 0, Math.PI * 2);
    g.stroke();
  }
  // Stones.
  for (let i = 0; i < N; i++) {
    const v0 = sc.cells[i];
    if ((v0 !== LIGHT && v0 !== DARK) || sc.hide.has(i) || sc.falling.has(i)) continue;
    const p = cellPx(v, i);
    drawStone(g, p.x, p.y, s * 0.6, v0 as Side);
  }
  for (const sp of sc.sprites) drawStone(g, sp.x, sp.y, s * 0.6 * sp.scale, sp.side, sp.alpha);
  // The next tiles to fall: a numbered badge (1 = right after this move), and a
  // dashed ring round any stone standing on one, so it shows on top of the stone.
  for (const [i, k] of sc.doom) {
    if (k > 3 || sc.falling.has(i)) continue;
    const p = cellPx(v, i);
    const col = DOOM_COLOR[k];
    const onStone = (sc.cells[i] === LIGHT || sc.cells[i] === DARK) && !sc.hide.has(i);
    if (onStone) {
      g.save();
      g.strokeStyle = col;
      g.lineWidth = k === 1 ? 3 : 2.2;
      g.setLineDash([4, 3]);
      g.beginPath();
      g.arc(p.x, p.y, s * 0.68, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    const bx = p.x + s * 0.5;
    const by = p.y - s * 0.52;
    const br = Math.max(7, s * 0.24);
    g.fillStyle = 'rgba(10,14,24,0.9)';
    g.beginPath();
    g.arc(bx, by, br + 1.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = col;
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#1a0c08';
    g.font = `800 ${Math.round(br * 1.4)}px system-ui, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(k), bx, by + 0.5);
  }
  // Danger rings: stones that a selected shove would push over.
  for (const c of sc.danger) {
    const p = cellPx(v, c);
    g.strokeStyle = '#ff4d4d';
    g.lineWidth = 3;
    g.setLineDash([5, 4]);
    g.beginPath();
    g.arc(p.x, p.y, s * 0.72, 0, Math.PI * 2);
    g.stroke();
    g.setLineDash([]);
  }
  // Move targets.
  for (const t of sc.targets) {
    const p = cellPx(v, t.cell);
    if (!t.push) {
      g.fillStyle = t.kind === 'oops' ? '#b06cff' : 'rgba(255,215,122,0.85)';
      g.beginPath();
      g.arc(p.x, p.y, s * (t.kind === 'oops' ? 0.24 : 0.2), 0, Math.PI * 2);
      g.fill();
    } else {
      const a = cellPx(v, t.from);
      const dx = p.x - a.x;
      const dy = p.y - a.y;
      const d = Math.hypot(dx, dy);
      const ux = dx / d;
      const uy = dy / d;
      const col = t.kind === 'kill' ? '#ff5a4a' : t.kind === 'oops' ? '#b06cff' : '#ffd77a';
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.6)';
      g.shadowBlur = 4;
      // A light outline so a red arrow still reads on a coral stone.
      arrow(g, p.x - ux * s * 0.45, p.y - uy * s * 0.45, p.x + ux * s * 0.5, p.y + uy * s * 0.5, '#fff7e6', 7.5, s * 0.46);
      g.shadowBlur = 0;
      arrow(g, p.x - ux * s * 0.45, p.y - uy * s * 0.45, p.x + ux * s * 0.5, p.y + uy * s * 0.5, col, 4, s * 0.38);
      g.restore();
    }
  }
  // Hint: a pulsing gold arrow.
  if (sc.hint) {
    const a = cellPx(v, sc.hint.from);
    const b = cellPx(v, sc.hint.to);
    const pulse = sc.reduced ? 1 : 0.65 + 0.35 * Math.sin(sc.time * 5);
    g.save();
    g.globalAlpha = pulse;
    g.strokeStyle = '#ffd77a';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(a.x, a.y, s * 0.78, 0, Math.PI * 2);
    g.stroke();
    arrow(g, a.x, a.y, b.x, b.y, '#ffd77a', 5, s * 0.42);
    g.restore();
  }
  g.restore();
}

/** Inline SVG of a stone for cards and the HUD. */
export function stoneSvg(side: Side, size = 18): string {
  const c = STONE[side];
  const id = `g${side}${size}`;
  return `<svg viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true" style="vertical-align:-3px"><defs><radialGradient id="${id}" cx="35%" cy="30%" r="70%"><stop offset="0" stop-color="${c.top}"/><stop offset="0.7" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.rim}"/></radialGradient></defs><circle cx="10" cy="10" r="8.5" fill="url(#${id})" stroke="rgba(0,0,0,.4)"/></svg>`;
}
