// Grove drawing: procedural vector pieces, no image assets.

import { key, type Hex } from '../../shared/hex';
import { hexPath, hexToPx, type HexLayout } from '../../shared/hexlayout';
import type { Cell, HandPiece, Outcome } from '../core';
import { G } from './palette';
import type { Scene } from './scene';

const TAU = Math.PI * 2;

/** Anything drawable: a board cell or a piece in hand. */
export type Drawable = Exclude<Cell, null> | HandPiece;

export interface Overlay {
  /** Wisp id -> its next step, drawn as an arrow. */
  plans: { from: Hex; to: Hex }[];
  selected: Hex | null;
  outcome: Outcome | null;
  /** The piece that would be placed at `selected`. */
  ghost: Drawable | null;
  /** Bolt targeting: occupied cells are highlighted. */
  targets: Hex[];
}

export function drawBoard(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  L: HexLayout,
  cells: Hex[],
  scene: Scene,
  ov: Overlay,
  time: number,
): void {
  ctx.fillStyle = G.bg;
  ctx.fillRect(0, 0, w, h);
  const S = L.size;

  for (const c of cells) {
    const { x, y } = hexToPx(L, c.q, c.r);
    hexPath(ctx, x, y, S * 0.95);
    ctx.fillStyle = (c.q * 2 + c.r) % 3 === 0 ? G.soilAlt : G.soil;
    ctx.fill();
  }

  for (const t of ov.targets) {
    const { x, y } = hexToPx(L, t.q, t.r);
    hexPath(ctx, x, y, S * 0.84);
    ctx.save();
    ctx.setLineDash([S * 0.16, S * 0.12]);
    ctx.strokeStyle = 'rgba(255,210,63,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Pieces.
  for (const c of cells) {
    const cell = scene.board[key(c)];
    if (!cell) continue;
    const { x, y } = hexToPx(L, c.q, c.r);
    const pop = scene.pops.get(key(c));
    const scale = pop === undefined ? 1 : 0.55 + 0.45 * Math.sin((pop * Math.PI) / 2) + 0.12 * Math.sin(pop * Math.PI);
    const consumed = ov.outcome?.consumed.some((h) => h.q === c.q && h.r === c.r);
    if (consumed) {
      const pulse = 0.5 + 0.5 * Math.sin(time / 140);
      ctx.beginPath();
      ctx.arc(x, y, S * 0.72, 0, TAU);
      ctx.strokeStyle = `rgba(255,242,176,${0.45 + 0.5 * pulse})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
    drawPiece(ctx, x, y, S * scale, cell, time, consumed ? 0.6 : 1);
  }

  // Moving sprites (merges, wisp steps).
  for (const sp of scene.sprites) {
    const { x, y } = hexToPx(L, sp.q, sp.r);
    drawPiece(ctx, x, y, S * sp.scale, sp.piece, time, sp.alpha);
  }

  // Wisp plans.
  for (const p of ov.plans) drawPlan(ctx, L, p.from, p.to, time);

  // Selection and preview.
  if (ov.selected) {
    const { x, y } = hexToPx(L, ov.selected.q, ov.selected.r);
    hexPath(ctx, x, y, S * 0.86);
    ctx.strokeStyle = G.select;
    ctx.lineWidth = 3;
    ctx.stroke();
    const out = ov.outcome;
    const shown: Drawable | null = out?.creates ?? (out?.crystal ? out.crystal : ov.ghost);
    if (shown && ov.ghost?.kind !== 'bolt') {
      const pulse = 0.5 + 0.5 * Math.sin(time / 160);
      drawPiece(ctx, x, y, S * (out?.creates ? 1.12 : 1), shown, time, 0.55 + 0.3 * pulse);
    }
    if (out && out.points > 0) floatText(ctx, `+${out.points}`, x, y - S * 0.85, S, G.good);
  }

  // Floaters and flashes.
  for (const f of scene.floaters) {
    const { x, y } = hexToPx(L, f.q, f.r);
    const k = f.age / f.life;
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    floatText(ctx, f.text, x, y - S * 0.6 - k * S * 0.8, S, f.color);
    ctx.globalAlpha = 1;
  }
  if (scene.flash) {
    const { x, y } = hexToPx(L, scene.flash.q, scene.flash.r);
    ctx.beginPath();
    ctx.arc(x, y, S * (0.4 + 0.9 * scene.flash.t), 0, TAU);
    ctx.fillStyle = `rgba(255,242,176,${0.6 * (1 - scene.flash.t)})`;
    ctx.fill();
  }
}

function floatText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, S: number, color: string): void {
  ctx.font = `800 ${Math.round(S * 0.42)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 4;
  ctx.strokeStyle = G.bg;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function drawPlan(ctx: CanvasRenderingContext2D, L: HexLayout, from: Hex, to: Hex, time: number): void {
  const S = L.size;
  const a = hexToPx(L, from.q, from.r);
  const b = hexToPx(L, to.q, to.r);
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  const mx = a.x + (b.x - a.x) * 0.62;
  const my = a.y + (b.y - a.y) * 0.62;
  const bob = Math.sin(time / 300) * S * 0.04;
  ctx.save();
  ctx.translate(mx + Math.cos(ang) * bob, my + Math.sin(ang) * bob);
  ctx.rotate(ang);
  ctx.fillStyle = `rgba(${G.wispGlow}, 0.85)`;
  ctx.beginPath();
  ctx.moveTo(S * 0.2, 0);
  ctx.lineTo(-S * 0.1, -S * 0.15);
  ctx.lineTo(-S * 0.03, 0);
  ctx.lineTo(-S * 0.1, S * 0.15);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Faint target ring.
  hexPath(ctx, b.x, b.y, S * 0.7);
  ctx.save();
  ctx.setLineDash([S * 0.1, S * 0.1]);
  ctx.strokeStyle = `rgba(${G.wispGlow}, 0.35)`;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

/** Draw one piece centered at (x, y) for hex size S. */
export function drawPiece(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  S: number,
  p: Drawable,
  time: number,
  alpha = 1,
): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  switch (p.kind) {
    case 'plant':
      drawPlant(ctx, S, p.tier, time);
      break;
    case 'stone':
      drawStone(ctx, S, p.tier, time);
      break;
    case 'wisp':
      drawWisp(ctx, S, time);
      break;
    case 'crystal':
      drawCrystal(ctx, S);
      break;
    case 'bolt':
      drawBolt(ctx, S);
      break;
  }
  if (p.kind === 'plant' || p.kind === 'stone') drawPips(ctx, S, p.tier + 1, p.kind === 'plant' ? G.leaf[p.tier] : G.stone[p.tier]);
  ctx.restore();
}

function drawPips(ctx: CanvasRenderingContext2D, S: number, n: number, color: string): void {
  const gap = S * 0.15;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc((i - (n - 1) / 2) * gap, S * 0.62, S * 0.045, 0, TAU);
    ctx.fillStyle = color;
    ctx.fill();
  }
}

function blob(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, fill: string): void {
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, r * 0.18);
  ctx.strokeStyle = G.leafDark;
  ctx.stroke();
}

function tree(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, leaf: string): void {
  ctx.fillStyle = G.trunk;
  ctx.fillRect(cx - s * 0.07, cy - s * 0.05, s * 0.14, s * 0.42);
  blob(ctx, cx, cy - s * 0.22, s * 0.3, leaf);
  blob(ctx, cx - s * 0.18, cy - s * 0.05, s * 0.18, leaf);
  blob(ctx, cx + s * 0.18, cy - s * 0.05, s * 0.18, leaf);
}

function drawPlant(ctx: CanvasRenderingContext2D, S: number, tier: number, time: number): void {
  const leaf = G.leaf[tier];
  switch (tier) {
    case 0: // Seed
      ctx.beginPath();
      ctx.ellipse(0, S * 0.08, S * 0.16, S * 0.21, 0.3, 0, TAU);
      ctx.fillStyle = G.seed;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#5a4020';
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(S * 0.06, -S * 0.16, S * 0.06, S * 0.11, 0.6, 0, TAU);
      ctx.fillStyle = leaf;
      ctx.fill();
      break;
    case 1: // Sprout
      ctx.strokeStyle = G.leafDark;
      ctx.lineWidth = Math.max(2, S * 0.07);
      ctx.beginPath();
      ctx.moveTo(0, S * 0.32);
      ctx.lineTo(0, -S * 0.05);
      ctx.stroke();
      for (const sgn of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(sgn * S * 0.17, -S * 0.12, S * 0.18, S * 0.1, sgn * -0.5, 0, TAU);
        ctx.fillStyle = leaf;
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      break;
    case 2: // Bush
      blob(ctx, -S * 0.2, S * 0.08, S * 0.22, leaf);
      blob(ctx, S * 0.2, S * 0.08, S * 0.22, leaf);
      blob(ctx, 0, -S * 0.12, S * 0.27, leaf);
      break;
    case 3: // Tree
      tree(ctx, 0, S * 0.05, S * 1.15, leaf);
      break;
    case 4: // Grove
      tree(ctx, -S * 0.26, S * 0.12, S * 0.75, leaf);
      tree(ctx, S * 0.26, S * 0.12, S * 0.75, leaf);
      tree(ctx, 0, -S * 0.05, S * 0.85, leaf);
      break;
    default: {
      // Spirit Tree: a glowing tree with drifting motes.
      const g = ctx.createRadialGradient(0, -S * 0.1, S * 0.1, 0, -S * 0.1, S * 0.85);
      g.addColorStop(0, 'rgba(255,242,176,0.55)');
      g.addColorStop(1, 'rgba(255,242,176,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, -S * 0.1, S * 0.85, 0, TAU);
      ctx.fill();
      tree(ctx, 0, S * 0.08, S * 1.25, leaf);
      for (let i = 0; i < 4; i++) {
        const a = time / 700 + (i * TAU) / 4;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * S * 0.45, -S * 0.2 + Math.sin(a) * S * 0.25, S * 0.05, 0, TAU);
        ctx.fillStyle = G.spirit;
        ctx.fill();
      }
    }
  }
}

function drawStone(ctx: CanvasRenderingContext2D, S: number, tier: number, time: number): void {
  const fill = G.stone[tier];
  const pebble = (cx: number, cy: number, rx: number, ry: number) => {
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = G.stoneDark;
    ctx.stroke();
  };
  if (tier === 0) pebble(0, S * 0.08, S * 0.3, S * 0.2);
  else if (tier === 1) {
    pebble(0, S * 0.22, S * 0.32, S * 0.15);
    pebble(0, S * 0.0, S * 0.24, S * 0.13);
    pebble(0, -S * 0.2, S * 0.15, S * 0.1);
  } else {
    const glow = 0.5 + 0.5 * Math.sin(time / 500);
    ctx.beginPath();
    ctx.roundRect(-S * 0.2, -S * 0.5, S * 0.4, S * 0.86, S * 0.12);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = G.stoneDark;
    ctx.stroke();
    ctx.strokeStyle = `rgba(126,232,245,${0.4 + 0.5 * glow})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -S * 0.35);
    ctx.lineTo(-S * 0.08, -S * 0.1);
    ctx.lineTo(S * 0.06, S * 0.05);
    ctx.lineTo(0, S * 0.22);
    ctx.stroke();
  }
}

function drawWisp(ctx: CanvasRenderingContext2D, S: number, time: number): void {
  const bob = Math.sin(time / 260) * S * 0.05;
  const g = ctx.createRadialGradient(0, bob, S * 0.05, 0, bob, S * 0.6);
  g.addColorStop(0, `rgba(${G.wispGlow}, 0.6)`);
  g.addColorStop(1, `rgba(${G.wispGlow}, 0)`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, bob, S * 0.6, 0, TAU);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, bob - S * 0.4);
  ctx.quadraticCurveTo(S * 0.32, bob - S * 0.05, S * 0.22, bob + S * 0.18);
  ctx.quadraticCurveTo(0, bob + S * 0.36, -S * 0.22, bob + S * 0.18);
  ctx.quadraticCurveTo(-S * 0.32, bob - S * 0.05, 0, bob - S * 0.4);
  ctx.fillStyle = G.wisp;
  ctx.fill();
  ctx.fillStyle = '#2a2146';
  for (const ex of [-0.08, 0.08]) {
    ctx.beginPath();
    ctx.arc(ex * S, bob + S * 0.04, S * 0.045, 0, TAU);
    ctx.fill();
  }
}

function drawCrystal(ctx: CanvasRenderingContext2D, S: number): void {
  ctx.beginPath();
  ctx.moveTo(0, -S * 0.42);
  ctx.lineTo(S * 0.28, -S * 0.08);
  ctx.lineTo(0, S * 0.38);
  ctx.lineTo(-S * 0.28, -S * 0.08);
  ctx.closePath();
  ctx.fillStyle = G.crystal;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#1d5a63';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-S * 0.28, -S * 0.08);
  ctx.lineTo(S * 0.28, -S * 0.08);
  ctx.moveTo(0, -S * 0.42);
  ctx.lineTo(0, S * 0.38);
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawBolt(ctx: CanvasRenderingContext2D, S: number): void {
  ctx.beginPath();
  ctx.moveTo(S * 0.08, -S * 0.45);
  ctx.lineTo(-S * 0.22, S * 0.04);
  ctx.lineTo(-S * 0.02, S * 0.04);
  ctx.lineTo(-S * 0.1, S * 0.45);
  ctx.lineTo(S * 0.24, -S * 0.08);
  ctx.lineTo(S * 0.03, -S * 0.08);
  ctx.closePath();
  ctx.fillStyle = G.bolt;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#6b5410';
  ctx.stroke();
}

