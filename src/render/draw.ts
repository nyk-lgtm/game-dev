// Canvas 2D drawing. Everything is procedural vector shapes: no image assets.

import { DIRS, allHexes, key, type Hex, type Outcome, type Threats } from '../core';
import { hexToPx, type Layout } from './layout';
import { C } from './palette';
import type { Scene, VisUnit } from './scene';

export interface Overlay {
  legal: Hex[];
  selected: Hex | null;
  outcome: Outcome | null;
  threats: Threats | null;
  inspect: number | null;
}

const TAU = Math.PI * 2;

function hexPath(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i;
    const px = x + size * Math.cos(a);
    const py = y + size * Math.sin(a);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

export function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  L: Layout,
  scene: Scene,
  ov: Overlay,
  time: number,
): void {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  if (scene.shake > 0.2) {
    ctx.translate((Math.random() - 0.5) * scene.shake, (Math.random() - 0.5) * scene.shake);
  }

  const s = scene.state;
  const S = L.size;
  const hexes = allHexes(s);

  // Tiles.
  for (const hx of hexes) {
    const t = s.tiles[key(hx)];
    const { x, y } = hexToPx(L, hx.q, hx.r);
    if (t === 'wall') {
      hexPath(ctx, x, y + S * 0.12, S * 0.94);
      ctx.fillStyle = C.wallSide;
      ctx.fill();
      hexPath(ctx, x, y - S * 0.06, S * 0.9);
      ctx.fillStyle = C.wallTop;
      ctx.fill();
      continue;
    }
    hexPath(ctx, x, y, S * 0.94);
    if (t === 'lava') {
      const pulse = 0.5 + 0.5 * Math.sin(time / 420 + hx.q * 1.3 + hx.r * 0.7);
      const g = ctx.createRadialGradient(x, y, S * 0.1, x, y, S);
      g.addColorStop(0, C.lavaA);
      g.addColorStop(1, C.lavaB);
      ctx.fillStyle = g;
      ctx.fill();
      ctx.globalAlpha = 0.25 * pulse;
      ctx.fillStyle = '#ffd27a';
      hexPath(ctx, x, y, S * 0.5);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = (hx.q + hx.r * 2) % 3 === 0 ? C.floorAlt : C.floor;
      ctx.fill();
      if (t === 'stairs') drawStairs(ctx, x, y, S, time);
    }
  }

  // Threats (only when idle).
  if (ov.threats) {
    for (const k of ov.threats.melee) {
      const [q, r] = k.split(',').map(Number);
      const t = s.tiles[k];
      if (t === 'wall' || t === 'lava') continue;
      const { x, y } = hexToPx(L, q, r);
      hexPath(ctx, x, y, S * 0.94);
      ctx.fillStyle = `rgba(${C.threat}, 0.16)`;
      ctx.fill();
      hexPath(ctx, x, y, S * 0.8);
      ctx.strokeStyle = `rgba(${C.threat}, 0.35)`;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    for (const shot of ov.threats.shots) drawShotLine(ctx, L, scene, shot.by, shot.path, time);
  }

  // Legal moves.
  for (const m of ov.legal) {
    const { x, y } = hexToPx(L, m.q, m.r);
    const sel = ov.selected && ov.selected.q === m.q && ov.selected.r === m.r;
    hexPath(ctx, x, y, S * 0.82);
    ctx.strokeStyle = sel ? C.select : C.legal;
    ctx.lineWidth = sel ? 3 : 2;
    ctx.stroke();
    if (!sel) {
      ctx.beginPath();
      ctx.arc(x, y, S * 0.09, 0, TAU);
      ctx.fillStyle = C.legal;
      ctx.fill();
    }
  }

  // Units, top to bottom so lower ones overlap upper ones.
  const units = [...scene.units.values()].sort((a, b) => a.r + a.q / 2 - (b.r + b.q / 2));
  for (const u of units) drawUnit(ctx, L, u, time, ov.inspect === u.id);

  // Preview: ghost of the player at the destination, and outcome marks.
  if (ov.selected && ov.outcome) drawPreview(ctx, L, scene, ov.selected, ov.outcome, time);

  // Projectile.
  if (scene.projectile) {
    const p = scene.projectile;
    const { x, y } = hexToPx(L, p.q, p.r);
    const d = hexToPx(L, DIRS[p.dir].q, DIRS[p.dir].r);
    const o = hexToPx(L, 0, 0);
    const ang = Math.atan2(d.y - o.y, d.x - o.x);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.strokeStyle = C.archer;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-S * 0.45, 0);
    ctx.lineTo(S * 0.25, 0);
    ctx.stroke();
    ctx.fillStyle = C.archer;
    ctx.beginPath();
    ctx.moveTo(S * 0.4, 0);
    ctx.lineTo(S * 0.18, -S * 0.12);
    ctx.lineTo(S * 0.18, S * 0.12);
    ctx.fill();
    ctx.restore();
  }

  // Floating text.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of scene.floaters) {
    const { x, y } = hexToPx(L, f.q, f.r);
    const k = f.age / f.life;
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.font = `700 ${Math.round(S * 0.42)}px system-ui, sans-serif`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.bg;
    ctx.strokeText(f.text, x, y - S * 0.6 - k * S * 0.6);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, x, y - S * 0.6 - k * S * 0.6);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // Full-screen effects.
  if (scene.hurt > 0.01) {
    const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
    g.addColorStop(0, 'rgba(255,40,70,0)');
    g.addColorStop(1, `rgba(255,40,70,${0.45 * scene.hurt})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  if (scene.fade > 0.001) {
    ctx.fillStyle = `rgba(15,17,24,${scene.fade})`;
    ctx.fillRect(0, 0, w, h);
  }
}

function drawStairs(ctx: CanvasRenderingContext2D, x: number, y: number, S: number, time: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(time / 500);
  hexPath(ctx, x, y, S * 0.78);
  ctx.fillStyle = C.stairsDark;
  ctx.fill();
  ctx.strokeStyle = C.stairs;
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const k = 0.7 - i * 0.2;
    ctx.globalAlpha = 0.45 + 0.55 * (i === 2 ? pulse : 1);
    hexPath(ctx, x, y, S * k);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawShotLine(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  scene: Scene,
  by: number,
  path: Hex[],
  time: number,
): void {
  const S = L.size;
  const shooter = scene.units.get(by);
  if (!shooter || path.length === 0) return;
  for (const p of path) {
    const { x, y } = hexToPx(L, p.q, p.r);
    hexPath(ctx, x, y, S * 0.94);
    ctx.fillStyle = `rgba(${C.threat}, 0.2)`;
    ctx.fill();
  }
  const a = hexToPx(L, shooter.q, shooter.r);
  const end = path[path.length - 1];
  const b = hexToPx(L, end.q, end.r);
  ctx.save();
  ctx.setLineDash([S * 0.25, S * 0.18]);
  ctx.lineDashOffset = -time / 30;
  ctx.strokeStyle = `rgba(${C.threat}, 0.9)`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
  // Arrowhead at the end of the line.
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(ang);
  ctx.fillStyle = `rgba(${C.threat}, 0.95)`;
  ctx.beginPath();
  ctx.moveTo(S * 0.3, 0);
  ctx.lineTo(0, -S * 0.18);
  ctx.lineTo(0, S * 0.18);
  ctx.fill();
  ctx.restore();
}

function dirAngle(L: Layout, dir: number): number {
  const d = hexToPx(L, DIRS[dir].q, DIRS[dir].r);
  const o = hexToPx(L, 0, 0);
  return Math.atan2(d.y - o.y, d.x - o.x);
}

function drawUnit(ctx: CanvasRenderingContext2D, L: Layout, u: VisUnit, time: number, inspected: boolean): void {
  const S = L.size;
  const { x, y } = hexToPx(L, u.q + u.bq, u.r + u.br);
  ctx.save();
  ctx.globalAlpha = u.alpha;
  ctx.translate(x, y);
  ctx.scale(u.scale, u.scale);

  if (inspected) {
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.72, 0, TAU);
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Shadow.
  ctx.beginPath();
  ctx.ellipse(0, S * 0.38, S * 0.42, S * 0.13, 0, 0, TAU);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();

  const flash = u.flash > 0.01;
  if (u.kind === 'player') {
    const ang = dirAngle(L, u.facing);
    // Spear.
    ctx.save();
    ctx.rotate(ang);
    ctx.strokeStyle = '#d7f9ff';
    ctx.lineWidth = Math.max(2, S * 0.07);
    ctx.beginPath();
    ctx.moveTo(-S * 0.2, 0);
    ctx.lineTo(S * 0.62, 0);
    ctx.stroke();
    ctx.fillStyle = '#d7f9ff';
    ctx.beginPath();
    ctx.moveTo(S * 0.8, 0);
    ctx.lineTo(S * 0.58, -S * 0.11);
    ctx.lineTo(S * 0.58, S * 0.11);
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(0, 0, S * 0.4, 0, TAU);
    ctx.fillStyle = flash ? '#ffffff' : C.player;
    ctx.fill();
    ctx.lineWidth = S * 0.08;
    ctx.strokeStyle = C.playerDark;
    ctx.stroke();
  } else if (u.kind === 'brute') {
    const r = S * 0.46;
    ctx.beginPath();
    ctx.roundRect(-r, -r * 0.92, r * 2, r * 1.84, S * 0.14);
    ctx.fillStyle = flash ? '#ffffff' : C.brute;
    ctx.fill();
    ctx.lineWidth = S * 0.08;
    ctx.strokeStyle = C.bruteDark;
    ctx.stroke();
    // Eyes.
    ctx.fillStyle = C.bruteDark;
    for (const ex of [-0.17, 0.17]) {
      ctx.beginPath();
      ctx.arc(ex * S, -S * 0.08, S * 0.07, 0, TAU);
      ctx.fill();
    }
    ctx.fillRect(-S * 0.18, S * 0.12, S * 0.36, S * 0.06);
  } else {
    const ang = u.aim !== null ? dirAngle(L, u.aim) : -Math.PI / 2;
    ctx.save();
    ctx.rotate(ang + Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(0, -S * 0.55);
    ctx.lineTo(S * 0.45, S * 0.38);
    ctx.lineTo(-S * 0.45, S * 0.38);
    ctx.closePath();
    ctx.fillStyle = flash ? '#ffffff' : C.archer;
    ctx.fill();
    ctx.lineWidth = S * 0.08;
    ctx.strokeStyle = C.archerDark;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, S * 0.05, S * 0.1, 0, TAU);
    ctx.fillStyle = C.archerDark;
    ctx.fill();
    ctx.restore();
    if (u.reload > 0 && u.aim === null) {
      ctx.fillStyle = C.muted;
      ctx.font = `800 ${Math.round(S * 0.5)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('…', 0, -S * 0.7);
    }
  }

  // Dazed stars.
  if (u.staggered) {
    for (let i = 0; i < 3; i++) {
      const a = time / 250 + (i * TAU) / 3;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * S * 0.3, -S * 0.55 + Math.sin(a) * S * 0.08, S * 0.06, 0, TAU);
      ctx.fillStyle = '#fff3a0';
      ctx.fill();
    }
  }

  // HP pips (enemies only; the player's HP is in the HUD).
  if (u.kind !== 'player' && u.maxHp > 1) {
    const n = u.maxHp;
    const gap = S * 0.2;
    for (let i = 0; i < n; i++) {
      const px = (i - (n - 1) / 2) * gap;
      ctx.beginPath();
      ctx.arc(px, S * 0.58, S * 0.07, 0, TAU);
      ctx.fillStyle = i < u.hp ? C.text : 'rgba(255,255,255,0.18)';
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawPreview(
  ctx: CanvasRenderingContext2D,
  L: Layout,
  scene: Scene,
  sel: Hex,
  out: Outcome,
  time: number,
): void {
  const S = L.size;
  const { x, y } = hexToPx(L, sel.q, sel.r);
  const pulse = 0.5 + 0.5 * Math.sin(time / 150);

  // Ghost player.
  ctx.globalAlpha = 0.35 + 0.2 * pulse;
  ctx.beginPath();
  ctx.arc(x, y, S * 0.36, 0, TAU);
  ctx.fillStyle = C.player;
  ctx.fill();
  ctx.globalAlpha = 1;

  // Marks on enemies that will die / be wounded.
  for (const id of out.kills) {
    const u = scene.units.get(id);
    if (!u) continue;
    const p = hexToPx(L, u.q, u.r);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(3, S * 0.1);
    ctx.lineCap = 'round';
    const k = S * 0.3;
    ctx.beginPath();
    ctx.moveTo(p.x - k, p.y - k);
    ctx.lineTo(p.x + k, p.y + k);
    ctx.moveTo(p.x + k, p.y - k);
    ctx.lineTo(p.x - k, p.y + k);
    ctx.stroke();
  }
  for (const id of out.wounded) {
    const u = scene.units.get(id);
    if (!u || out.kills.includes(id)) continue;
    const p = hexToPx(L, u.q, u.r);
    ctx.beginPath();
    ctx.arc(p.x, p.y, S * 0.6, 0, TAU);
    ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.5 * pulse})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Damage warning on the destination.
  if (out.damageTaken > 0) {
    ctx.font = `800 ${Math.round(S * 0.45)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = C.bg;
    const txt = `-${out.damageTaken}♥`;
    ctx.strokeText(txt, x, y - S * 0.7);
    ctx.fillStyle = C.brute;
    ctx.fillText(txt, x, y - S * 0.7);
  }
}
