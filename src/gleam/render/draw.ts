// Gleam board drawing: tiles, beams (each colour bit stroked with additive
// blending, so crossing and merging light mixes on screen), moving photons,
// lamps, sockets, pieces and crystals with colour pips.

import { CRYSTAL, LAMP, SOCKET, WALL, type Light, type Puzzle } from '../core';

export interface View {
  x0: number;
  y0: number;
  /** Cell size in CSS px. */
  s: number;
  n: number;
}

export function layout(n: number, w: number, h: number): View {
  const pad = 4;
  const s = Math.floor(Math.min((w - 2 * pad) / n, (h - 2 * pad) / n));
  return { s, n, x0: Math.round((w - s * n) / 2), y0: Math.round((h - s * n) * 0.6) };
}

export function cellAt(v: View, x: number, y: number): number {
  const q = Math.floor((x - v.x0) / v.s);
  const r = Math.floor((y - v.y0) / v.s);
  return q < 0 || r < 0 || q >= v.n || r >= v.n ? -1 : r * v.n + q;
}

/** One colour per bit (red, green, blue): added together they make yellow, cyan, magenta, white. */
export const BIT_RGB: [number, number, number][] = [
  [255, 64, 72],
  [70, 255, 110],
  [70, 120, 255],
];
/** Display colour of a mask. */
export const MASK_CSS = ['#3a3f58', '#ff4f5e', '#52f07c', '#ffe45c', '#5b8cff', '#ff5cf0', '#5cf2ff', '#ffffff'];
const rgba = (b: number, a: number) => `rgba(${BIT_RGB[b][0]},${BIT_RGB[b][1]},${BIT_RGB[b][2]},${a})`;

export interface DrawState {
  board: number[];
  light: Light;
  time: number;
  /** Piece type armed in the tray (-1 none) and whether any are left. */
  armed: number;
  /** Socket a drag started from (drawn empty), or -1. */
  dragFrom: number;
  hint: { socket: number; cells: number[]; bad: boolean } | null;
  /** Tapped cell shown in the info line, or -1. */
  selected: number;
  /** Seconds since solved, or -1. */
  win: number;
  photons: boolean;
  /** The ring under a dragged piece, if any. */
  drop?: { socket: number; ok: boolean } | null;
}

const GEM: [number, number][] = [
  [0, -0.36],
  [0.31, -0.1],
  [0.19, 0.31],
  [-0.19, 0.31],
  [-0.31, -0.1],
];

/** Crystals are drawn a little larger than the unit gem so their colour dots read easily. */
const GEM_K = 1.14;

function gemPath(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, k = 1): void {
  ctx.beginPath();
  GEM.forEach(([x, y], i) => (i ? ctx.lineTo : ctx.moveTo).call(ctx, cx + x * s * k, cy + y * s * k));
  ctx.closePath();
}

export function drawBoard(ctx: CanvasRenderingContext2D, v: View, p: Puzzle, st: DrawState): void {
  const { s, n, x0, y0 } = v;
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  ctx.restore();
  const cx = (c: number) => x0 + (c % n) * s + s / 2;
  const cy = (c: number) => y0 + Math.floor(c / n) * s + s / 2;
  const sockAt = new Map(p.sockets.map((c, i) => [c, i]));

  // Tiles.
  ctx.fillStyle = '#0a0c16';
  roundRect(ctx, x0 - 3, y0 - 3, s * n + 6, s * n + 6, 10);
  ctx.fill();
  for (let c = 0; c < n * n; c++) {
    const x = x0 + (c % n) * s;
    const y = y0 + Math.floor(c / n) * s;
    const k = p.kind[c];
    if (k === WALL) {
      ctx.fillStyle = '#2a2f49';
      roundRect(ctx, x + 2, y + 2, s - 4, s - 4, 6);
      ctx.fill();
      ctx.fillStyle = '#3a4063';
      roundRect(ctx, x + 2, y + 2, s - 4, (s - 4) * 0.35, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.3, y + s * 0.55);
      ctx.lineTo(x + s * 0.55, y + s * 0.72);
      ctx.stroke();
      continue;
    }
    ctx.fillStyle = (Math.floor(c / n) + (c % n)) % 2 ? '#141830' : '#12152a';
    roundRect(ctx, x + 1.5, y + 1.5, s - 3, s - 3, 5);
    ctx.fill();
  }

  // Beams: per colour bit, three strokes (glow, body, core) with additive blending.
  const L = st.light;
  // Light running both ways along a line is drawn as two strands, each shifted to the
  // right of its own travel, so a red beam meeting a blue one doesn't read as one beam.
  const shift = s * 0.09;
  const RIGHT = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ];
  const seg = (path: Path2D, c: number, side: number, travel = -1) => {
    const ax = cx(c) + (travel >= 0 ? RIGHT[travel][0] * shift : 0);
    const ay = cy(c) + (travel >= 0 ? RIGHT[travel][1] * shift : 0);
    const dx = side === 1 ? 1 : side === 3 ? -1 : 0;
    const dy = side === 2 ? 1 : side === 0 ? -1 : 0;
    const k = p.kind[c];
    const start = k === CRYSTAL ? 0.3 : k === LAMP ? 0.2 : 0;
    path.moveTo(ax + dx * s * start, ay + dy * s * start);
    path.lineTo(ax + (dx * s) / 2, ay + (dy * s) / 2);
  };
  const paths = [new Path2D(), new Path2D(), new Path2D()];
  const twoWay = (h: number) => L.outw[h] !== 0 && L.inw[h] !== 0;
  for (let h = 0; h < L.half.length; h++) {
    const m = L.half[h];
    if (!m) continue;
    const c = h >> 2;
    const d = h & 3;
    for (let b = 0; b < 3; b++) {
      if (!twoWay(h)) {
        if (m & (1 << b)) seg(paths[b], c, d);
        continue;
      }
      if (L.outw[h] & (1 << b)) seg(paths[b], c, d, d);
      if (L.inw[h] & (1 << b)) seg(paths[b], c, d, (d + 2) & 3);
    }
  }
  ctx.save();
  // Light that leaves the board stops at its edge (glow and round caps included).
  ctx.beginPath();
  ctx.rect(x0, y0, s * n, s * n);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  const pulse = 0.9 + 0.1 * Math.sin(st.time * 2.4);
  const passes: [number, number][] = [
    [s * 0.42, 0.07 * pulse],
    [s * 0.2, 0.2],
    [s * 0.075, 0.85],
  ];
  for (const [w, a] of passes)
    for (let b = 0; b < 3; b++) {
      ctx.lineWidth = w;
      ctx.strokeStyle = rgba(b, a);
      ctx.stroke(paths[b]);
    }
  // Photons: one per half cell, moving with the light.
  if (st.photons) {
    const u = (st.time / 0.42) % 1;
    for (let b = 0; b < 3; b++) {
      ctx.fillStyle = rgba(b, 0.9);
      ctx.beginPath();
      for (let h = 0; h < L.half.length; h++) {
        const out = L.outw[h] & (1 << b);
        const inn = L.inw[h] & (1 << b);
        if (!out && !inn) continue;
        const c = h >> 2;
        const d = h & 3;
        const dx = d === 1 ? 0.5 : d === 3 ? -0.5 : 0;
        const dy = d === 2 ? 0.5 : d === 0 ? -0.5 : 0;
        const k = p.kind[c];
        const two = twoWay(h);
        for (const [f, t] of [
          [out ? u : -1, d],
          [inn ? 1 - u : -1, (d + 2) & 3],
        ]) {
          if (f < 0) continue;
          if ((k === CRYSTAL && f < 0.6) || (k === LAMP && f < 0.4)) continue;
          const x = cx(c) + dx * s * f + (two ? RIGHT[t][0] * shift : 0);
          const y = cy(c) + dy * s * f + (two ? RIGHT[t][1] * shift : 0);
          ctx.moveTo(x + s * 0.045, y);
          ctx.arc(x, y, s * 0.045, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
  }
  ctx.restore();

  // Things on the tiles.
  for (let c = 0; c < n * n; c++) {
    const k = p.kind[c];
    const x = cx(c);
    const y = cy(c);
    if (k === LAMP) drawLamp(ctx, x, y, s, p.lamps.find((l) => l.cell === c)!, st.time);
    else if (k === CRYSTAL) drawCrystal(ctx, x, y, s, p.target[c], L.got[c], st.time, st.win);
    else if (k === SOCKET) {
      const i = sockAt.get(c)!;
      const code = i === st.dragFrom ? 0 : st.board[i];
      drawSocket(ctx, x, y, s, code === 0 && st.armed >= 0, st.time);
      if (code > 0) drawPiece(ctx, x, y, s, code, p.given[i] >= 0, L.lit[c] > 0);
    }
  }

  // Where a dragged piece would land.
  if (st.drop) {
    const c = p.sockets[st.drop.socket];
    ctx.save();
    ctx.strokeStyle = st.drop.ok ? '#ffd678' : '#ff5d7a';
    ctx.fillStyle = st.drop.ok ? 'rgba(255,214,120,0.16)' : 'rgba(255,93,122,0.14)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx(c), cy(c), s * 0.47, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  // Selection and hint marks.
  if (st.selected >= 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    roundRect(ctx, x0 + (st.selected % n) * s + 2, y0 + Math.floor(st.selected / n) * s + 2, s - 4, s - 4, 6);
    ctx.stroke();
  }
  if (st.hint) {
    const a = 0.55 + 0.45 * Math.sin(st.time * 5);
    const c = p.sockets[st.hint.socket];
    if (st.hint.bad) {
      // A wrong piece: a solid red ring and a red ✕ badge (the dashed red ring means "in the dark").
      ctx.strokeStyle = '#ff4d6d';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx(c), cy(c), s * 0.46, 0, Math.PI * 2);
      ctx.stroke();
      const bx = cx(c) + s * 0.33;
      const by = cy(c) - s * 0.33;
      const r = Math.max(8, s * 0.17);
      ctx.fillStyle = '#ff4d6d';
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(bx - r * 0.45, by - r * 0.45);
      ctx.lineTo(bx + r * 0.45, by + r * 0.45);
      ctx.moveTo(bx + r * 0.45, by - r * 0.45);
      ctx.lineTo(bx - r * 0.45, by + r * 0.45);
      ctx.stroke();
    } else {
      ctx.strokeStyle = `rgba(255,214,120,${a})`;
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.arc(cx(c), cy(c), s * 0.46, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.lineWidth = 2;
    ctx.strokeStyle = `rgba(255,214,120,${a * 0.7})`;
    for (const x of st.hint.cells) {
      ctx.beginPath();
      ctx.arc(cx(x), cy(x), s * 0.46, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Win: rings spread from every crystal.
  if (st.win >= 0 && st.win < 2.5) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let c = 0; c < n * n; c++) {
      if (p.kind[c] !== CRYSTAL || p.target[c] <= 0) continue;
      const r = s * (0.3 + st.win * 1.6);
      ctx.strokeStyle = MASK_CSS[p.target[c]];
      ctx.globalAlpha = Math.max(0, 1 - st.win / 1.6) * 0.6;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx(c), cy(c), r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, l: { dir: number; mask: number }, t: number): void {
  const ang = [-Math.PI / 2, 0, Math.PI / 2, Math.PI][l.dir];
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  // Housing: a rounded body with the lens facing the beam.
  ctx.fillStyle = '#262b45';
  ctx.strokeStyle = '#4a5280';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-s * 0.36, -s * 0.3, s * 0.56, s * 0.6, s * 0.14);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#1b1f33';
  ctx.fillRect(-s * 0.42, -s * 0.18, s * 0.08, s * 0.36);
  const col = MASK_CSS[l.mask];
  const g = ctx.createRadialGradient(s * 0.18, 0, 0, s * 0.18, 0, s * 0.42);
  g.addColorStop(0, col);
  g.addColorStop(0.35, col + '88');
  g.addColorStop(1, col + '00');
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.75 + 0.15 * Math.sin(t * 3);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s * 0.18, 0, s * 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.ellipse(s * 0.18, 0, s * 0.09, s * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.beginPath();
  ctx.ellipse(s * 0.2, -s * 0.06, s * 0.03, s * 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSocket(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, ready: boolean, t: number): void {
  const a = ready ? 0.65 + 0.3 * Math.sin(t * 4) : 0.55;
  ctx.strokeStyle = `rgba(214,174,98,${a})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(x, y, s * 0.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  for (let k = 0; k < 4; k++) {
    const ang = (k * Math.PI) / 2 + Math.PI / 4;
    ctx.moveTo(x + Math.cos(ang) * s * 0.3, y + Math.sin(ang) * s * 0.3);
    ctx.lineTo(x + Math.cos(ang) * s * 0.38, y + Math.sin(ang) * s * 0.38);
  }
  ctx.stroke();
}

/** A piece on its base. code: 1-2 mirror / \, 3-4 splitter / \, 5-7 filter. */
export function drawPiece(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, code: number, given: boolean, lit: boolean): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(20,24,44,0.82)';
  // A piece in the dark (fixed or not) gets a red dashed ring.
  ctx.strokeStyle = !lit ? '#ff6b81' : given ? '#d6ae62' : '#56608c';
  ctx.lineWidth = given || !lit ? 2 : 1.5;
  if (!lit) ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(0, 0, s * 0.38, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.setLineDash([]);
  if (given)
    for (let k = 0; k < 4; k++) {
      const ang = (k * Math.PI) / 2;
      ctx.fillStyle = lit ? '#d6ae62' : '#ff6b81';
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * s * 0.38, Math.sin(ang) * s * 0.38, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  if (code <= 4) {
    const sl = code % 2 === 1;
    const e = s * 0.3;
    ctx.lineCap = 'round';
    if (code <= 2) {
      ctx.strokeStyle = '#0b0d18';
      ctx.lineWidth = s * 0.14;
      line(ctx, sl, e);
      const g = ctx.createLinearGradient(-e, -e, e, e);
      g.addColorStop(0, '#f4f7ff');
      g.addColorStop(0.5, '#9aa6cc');
      g.addColorStop(1, '#eef2ff');
      ctx.strokeStyle = g;
      ctx.lineWidth = s * 0.09;
      line(ctx, sl, e);
    } else {
      // A glass slab: half-silvered, so it is drawn see-through with a dashed silver face.
      ctx.rotate(sl ? -Math.PI / 4 : Math.PI / 4);
      const len = s * 0.84;
      const th = s * 0.17;
      ctx.fillStyle = 'rgba(140,225,255,0.28)';
      ctx.strokeStyle = 'rgba(190,240,255,0.9)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(-len / 2, -th / 2, len, th, th * 0.3);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = s * 0.03;
      ctx.setLineDash([s * 0.06, s * 0.045]);
      ctx.beginPath();
      ctx.moveTo(-len / 2 + 3, 0);
      ctx.lineTo(len / 2 - 3, 0);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  } else {
    const col = MASK_CSS[1 << (code - 5)];
    ctx.fillStyle = col + '66';
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-s * 0.2, -s * 0.2, s * 0.4, s * 0.4, s * 0.08);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-s * 0.12, s * 0.02);
    ctx.lineTo(-s * 0.02, -s * 0.11);
    ctx.stroke();
  }
  ctx.restore();
}

function line(ctx: CanvasRenderingContext2D, slash: boolean, e: number): void {
  ctx.beginPath();
  if (slash) {
    ctx.moveTo(-e, e);
    ctx.lineTo(e, -e);
  } else {
    ctx.moveTo(-e, -e);
    ctx.lineTo(e, e);
  }
  ctx.stroke();
}

function drawCrystal(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, target: number, got: number, t: number, win: number): void {
  const dark = target === 0;
  const extra = got & ~target;
  const exact = !dark && got === target;
  ctx.save();
  if (exact || (dark && extra)) {
    // Glow behind the gem.
    const col = dark ? '#ff3355' : MASK_CSS[target];
    const g = ctx.createRadialGradient(x, y, 0, x, y, s * 0.6);
    g.addColorStop(0, col + 'aa');
    g.addColorStop(1, col + '00');
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = dark ? 0.6 + 0.4 * Math.sin(t * 8) : 0.75 + 0.25 * Math.sin(t * 2 + x) + (win >= 0 && win < 1 ? 1 - win : 0);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  gemPath(ctx, x, y, s, GEM_K);
  if (dark) ctx.fillStyle = extra ? '#3a0d1a' : '#0b0912';
  else if (exact) ctx.fillStyle = MASK_CSS[target];
  else ctx.fillStyle = '#161a2e';
  ctx.fill();
  if (!dark && !exact && got) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = MASK_CSS[got];
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = dark ? (extra ? `rgba(255,70,100,${0.6 + 0.4 * Math.sin(t * 8)})` : '#58467a') : extra ? '#ff5d7a' : MASK_CSS[target];
  ctx.stroke();
  // Facets.
  ctx.strokeStyle = exact ? 'rgba(255,255,255,0.55)' : dark ? 'rgba(120,100,170,0.35)' : 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  // Only the crown is cut, so the colour dots below stay clear.
  const k = GEM_K * s;
  ctx.moveTo(x - k * 0.31, y - k * 0.1);
  ctx.lineTo(x + k * 0.31, y - k * 0.1);
  ctx.moveTo(x - k * 0.13, y - k * 0.1);
  ctx.lineTo(x, y - k * 0.36);
  ctx.lineTo(x + k * 0.13, y - k * 0.1);
  ctx.stroke();
  if (dark) {
    // A hollow eye: no light allowed.
    ctx.strokeStyle = extra ? '#ff6b81' : '#6d5a96';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y + s * 0.07, s * 0.08, 0, Math.PI * 2);
    ctx.moveTo(x - s * 0.08, y + s * 0.15);
    ctx.lineTo(x + s * 0.08, y - s * 0.01);
    ctx.stroke();
  } else {
    // Pips: the colours this crystal needs, filled once they arrive.
    const bits = [0, 1, 2].filter((b) => target & (1 << b));
    const gap = s * 0.19;
    bits.forEach((b, k) => {
      const px = x + (k - (bits.length - 1) / 2) * gap;
      const py = y + s * 0.13;
      ctx.beginPath();
      ctx.arc(px, py, s * 0.078, 0, Math.PI * 2);
      const on = got & (1 << b);
      ctx.fillStyle = on ? (exact ? '#ffffff' : MASK_CSS[1 << b]) : '#0b0d18';
      ctx.fill();
      ctx.strokeStyle = exact ? 'rgba(0,0,0,0.5)' : MASK_CSS[1 << b];
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
    if (extra) {
      ctx.strokeStyle = '#ff5d7a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x + s * 0.2, y - s * 0.42);
      ctx.lineTo(x + s * 0.36, y - s * 0.26);
      ctx.moveTo(x + s * 0.36, y - s * 0.42);
      ctx.lineTo(x + s * 0.2, y - s * 0.26);
      ctx.stroke();
    }
  }
  if (exact) {
    // A sparkle that drifts round the gem.
    const a = t * 1.3 + x * 0.1;
    const sx = x + Math.cos(a) * s * 0.18;
    const sy = y - s * 0.12 + Math.sin(a * 1.7) * s * 0.08;
    const k = 0.5 + 0.5 * Math.sin(t * 4 + y);
    ctx.strokeStyle = `rgba(255,255,255,${0.4 + 0.5 * k})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(sx - s * 0.07 * k, sy);
    ctx.lineTo(sx + s * 0.07 * k, sy);
    ctx.moveTo(sx, sy - s * 0.07 * k);
    ctx.lineTo(sx, sy + s * 0.07 * k);
    ctx.stroke();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- SVG icons (tray, help)

export function pieceSvg(code: number, px = 34, given = false): string {
  const v = 40;
  const base = `<circle cx="20" cy="20" r="15" fill="#141830" stroke="${given ? "#d6ae62" : "#56608c"}" stroke-width="${given ? 2.2 : 1.5}"/>`;
  let body = '';
  const d = code % 2 === 1 ? 'M9 31L31 9' : 'M9 9L31 31';
  if (code === 1 || code === 2) body = `<path d="${d}" stroke="#0b0d18" stroke-width="6" stroke-linecap="round"/><path d="${d}" stroke="#dfe6ff" stroke-width="3.6" stroke-linecap="round"/>`;
  else if (code === 3 || code === 4)
    body = `<g transform="rotate(${code === 3 ? -45 : 45} 20 20)"><rect x="6" y="16.5" width="28" height="7" rx="2" fill="rgba(140,225,255,0.3)" stroke="#bef0ff" stroke-width="1"/><path d="M8 20H32" stroke="#fff" stroke-width="1.4" stroke-dasharray="2.5 1.8"/></g>`;
  else if (code >= 5) {
    const col = MASK_CSS[1 << (code - 5)];
    body = `<rect x="12" y="12" width="16" height="16" rx="3" fill="${col}66" stroke="${col}" stroke-width="2"/>`;
  }
  return `<svg width="${px}" height="${px}" viewBox="0 0 ${v} ${v}" aria-hidden="true">${base}${body}</svg>`;
}

export function crystalSvg(target: number, px = 26, got = target): string {
  const pts = GEM.map(([x, y]) => `${20 + x * 40},${20 + y * 40}`).join(' ');
  if (target === 0) return `<svg width="${px}" height="${px}" viewBox="0 0 40 40" aria-hidden="true"><polygon points="${pts}" fill="#0b0912" stroke="#7a64a8" stroke-width="2"/><circle cx="20" cy="23" r="3.2" fill="none" stroke="#8a74b8" stroke-width="1.5"/></svg>`;
  const bits = [0, 1, 2].filter((b) => target & (1 << b));
  const pips = bits.map((b, k) => `<circle cx="${20 + (k - (bits.length - 1) / 2) * 5.5}" cy="24" r="2" fill="${got & (1 << b) ? '#fff' : '#0b0d18'}" stroke="${MASK_CSS[1 << b]}"/>`).join('');
  return `<svg width="${px}" height="${px}" viewBox="0 0 40 40" aria-hidden="true"><polygon points="${pts}" fill="${got === target ? MASK_CSS[target] : '#161a2e'}" stroke="${MASK_CSS[target]}" stroke-width="2"/>${pips}</svg>`;
}

export function lampSvg(mask: number, px = 26): string {
  const c = MASK_CSS[mask];
  return `<svg width="${px}" height="${px}" viewBox="0 0 40 40" aria-hidden="true"><rect x="6" y="9" width="22" height="22" rx="6" fill="#262b45" stroke="#4a5280"/><ellipse cx="25" cy="20" rx="4" ry="8" fill="${c}"/><path d="M29 20H38" stroke="${c}" stroke-width="3" stroke-linecap="round"/></svg>`;
}
