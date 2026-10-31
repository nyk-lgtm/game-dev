// ASCII rendering: one glyph per cell on a canvas, colored, with a lantern
// light falloff in dark places and dim memory of explored ground.

import {
  MAPS,
  MONSTERS,
  WORLD,
  fov,
  markerAt,
  type GameState,
  type MonsterKind,
  type NpcId,
  type Pos,
} from './core';

export interface View {
  cellW: number;
  cellH: number;
  cols: number;
  rows: number;
  /** Map cell shown at the top-left of the screen. */
  x0: number;
  y0: number;
  /** Pixel offset so a small map sits centered. */
  ox: number;
  oy: number;
}

export interface Fx {
  text: string;
  color: string;
  x: number;
  y: number;
  age: number;
  life: number;
}

const MONSTER_COLORS: Record<MonsterKind, string> = {
  rat: '#b9a58a',
  wolf: '#c3c8d3',
  goblin: '#8fd14f',
  bat: '#a68cff',
  spider: '#ff6b6b',
  skeleton: '#f2f2f2',
  king: '#ff3d5a',
};
const NPC_COLORS: Record<NpcId, string> = {
  elder: '#ffd166',
  smith: '#ff9f43',
  healer: '#7bed9f',
  child: '#70a1ff',
  hermit: '#c39bff',
};

const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

/** Glyph and color for a terrain char at (x, y) on map `id`. */
function terrainGlyph(t: string, x: number, y: number, outdoors: boolean, time: number): [string, string] {
  switch (t) {
    case '#':
      return ['#', outdoors ? '#a2835f' : '#646a7d'];
    case '.':
      return ['·', outdoors ? '#6b5640' : '#3d4150'];
    case ',': {
      const g = [',', '\'', '"', '`', ','][hash(x, y) % 5];
      return [g, ['#3f6b33', '#4a7a3a', '#365c2c'][hash(y, x) % 3]];
    }
    case 'T':
      return ['♣', ['#2f8a3e', '#26743a', '#3a9a48'][hash(x, y) % 3]];
    case '~':
      return [(Math.floor(time / 600) + x + y) % 3 === 0 ? '~' : '≈', '#3b82c4'];
    case '=':
      return ['=', '#a07848'];
    case '+':
      return ['+', '#d39a45'];
    case '_':
      return ['·', '#9a8660'];
    case '>':
    case '<':
      return [t, '#ffd166'];
    default:
      return [t, '#888'];
  }
}

export function fitView(w: number, h: number, mapW: number, mapH: number): Omit<View, 'x0' | 'y0'> {
  // Aim for ~17 columns across a phone; cells a bit taller than wide.
  const cellW = Math.max(14, Math.floor(w / 17));
  const cellH = Math.round(cellW * 1.22);
  const cols = Math.min(mapW, Math.floor(w / cellW));
  const rows = Math.min(mapH, Math.floor(h / cellH));
  return { cellW, cellH, cols, rows, ox: Math.floor((w - cols * cellW) / 2), oy: Math.floor((h - rows * cellH) / 2) };
}

/** Center the camera on the player, clamped to the map edges. */
export function camera(v: Omit<View, 'x0' | 'y0'>, s: GameState): View {
  const m = WORLD[s.player.map];
  const clamp = (c: number, n: number, max: number) => Math.max(0, Math.min(max - n, c - Math.floor(n / 2)));
  return { ...v, x0: clamp(s.player.pos.x, v.cols, m.w), y0: clamp(s.player.pos.y, v.rows, m.h) };
}

export function cellAtPx(v: View, px: number, py: number): Pos {
  return { x: v.x0 + Math.floor((px - v.ox) / v.cellW), y: v.y0 + Math.floor((py - v.oy) / v.cellH) };
}

export function draw(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  v: View,
  s: GameState,
  fx: Fx[],
  flash: { at: Pos; t: number; color: string } | null,
  path: Pos[],
  time: number,
): void {
  ctx.fillStyle = '#0b0b0e';
  ctx.fillRect(0, 0, w, h);
  const id = s.player.map;
  const m = WORLD[id];
  const def = MAPS[id];
  const outdoors = !def.dark;
  const lit = def.dark ? fov(m, s.player.pos) : null;
  const seen = s.seen[id];
  const font = `700 ${Math.round(v.cellH * 0.78)}px ui-monospace, 'Cascadia Mono', 'Roboto Mono', 'Droid Sans Mono', 'DejaVu Sans Mono', Menlo, monospace`;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const P = s.player.pos;

  // Lantern glow under everything in the dark.
  const center = (x: number, y: number) => ({
    cx: v.ox + (x - v.x0 + 0.5) * v.cellW,
    cy: v.oy + (y - v.y0 + 0.5) * v.cellH,
  });
  if (def.dark) {
    const { cx, cy } = center(P.x, P.y);
    const flicker = 1 + 0.03 * Math.sin(time / 90) + 0.02 * Math.sin(time / 37);
    const g = ctx.createRadialGradient(cx, cy, v.cellW, cx, cy, v.cellW * 7 * flicker);
    g.addColorStop(0, 'rgba(255,190,90,0.16)');
    g.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  for (let y = v.y0; y < v.y0 + v.rows; y++) {
    for (let x = v.x0; x < v.x0 + v.cols; x++) {
      const i = y * m.w + x;
      const visible = !lit || lit.has(i);
      const remembered = !visible && seen?.[i] === '1';
      if (!visible && !remembered) continue;
      const { cx, cy } = center(x, y);
      let [glyph, color] = terrainGlyph(m.terrain[i], x, y, outdoors, time);
      const mk = markerAt(m, { x, y });
      if (mk?.kind === 'npc') [glyph, color] = ['@', NPC_COLORS[mk.npc]];
      else if (mk?.kind === 'chest') [glyph, color] = s.done.includes(mk.id) ? ['_', '#6b5a3a'] : ['≡', '#e7b84a'];
      else if (mk?.kind === 'sign') [glyph, color] = ['?', '#d6b47a'];
      else if (mk?.kind === 'lantern') [glyph, color] = s.quest === 'won' ? ['☼', '#ffd166'] : ['¥', '#7d7a73'];
      if (remembered) color = '#2b2d36';
      else if (lit) {
        const d = Math.hypot(x - P.x, y - P.y);
        ctx.globalAlpha = Math.max(0.35, 1 - d / 8);
      }
      ctx.fillStyle = color;
      ctx.fillText(glyph, cx, cy);
      ctx.globalAlpha = 1;
    }
  }

  // Lantern in the village: warm light once relit.
  if (s.quest === 'won' && id === 'village') {
    for (const [i, mk] of m.markers) {
      if (mk.marker.kind !== 'lantern') continue;
      const { cx, cy } = center(i % m.w, Math.floor(i / m.w));
      const g = ctx.createRadialGradient(cx, cy, 2, cx, cy, v.cellW * 6);
      g.addColorStop(0, 'rgba(255,209,102,0.35)');
      g.addColorStop(1, 'rgba(255,209,102,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // Planned walk.
  ctx.fillStyle = 'rgba(255,209,102,0.35)';
  for (const p of path) {
    const { cx, cy } = center(p.x, p.y);
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
  }

  // Hit flash behind creatures.
  if (flash) {
    const { cx, cy } = center(flash.at.x, flash.at.y);
    ctx.fillStyle = flash.color;
    ctx.globalAlpha = 0.5 * (1 - flash.t);
    ctx.fillRect(cx - v.cellW / 2, cy - v.cellH / 2, v.cellW, v.cellH);
    ctx.globalAlpha = 1;
  }

  // Monsters (only where you can see).
  for (const mo of s.monsters) {
    if (mo.hp <= 0 || mo.map !== id) continue;
    if (mo.pos.x < v.x0 || mo.pos.y < v.y0 || mo.pos.x >= v.x0 + v.cols || mo.pos.y >= v.y0 + v.rows) continue;
    if (lit && !lit.has(mo.pos.y * m.w + mo.pos.x)) continue;
    const { cx, cy } = center(mo.pos.x, mo.pos.y);
    ctx.fillStyle = '#0b0b0e';
    ctx.fillRect(cx - v.cellW / 2 + 1, cy - v.cellH / 2 + 1, v.cellW - 2, v.cellH - 2);
    ctx.fillStyle = MONSTER_COLORS[mo.kind];
    ctx.fillText(MONSTERS[mo.kind].glyph, cx, cy);
    // Wounded marker: a thin health line under the glyph.
    const max = MONSTERS[mo.kind].hp;
    if (mo.hp < max) {
      ctx.fillStyle = '#3a1a1e';
      ctx.fillRect(cx - v.cellW * 0.4, cy + v.cellH * 0.42, v.cellW * 0.8, 2);
      ctx.fillStyle = '#ff5c5c';
      ctx.fillRect(cx - v.cellW * 0.4, cy + v.cellH * 0.42, v.cellW * 0.8 * (mo.hp / max), 2);
    }
  }

  // The player.
  {
    const { cx, cy } = center(P.x, P.y);
    ctx.fillStyle = '#0b0b0e';
    ctx.fillRect(cx - v.cellW / 2 + 1, cy - v.cellH / 2 + 1, v.cellW - 2, v.cellH - 2);
    ctx.shadowColor = 'rgba(255,209,102,0.8)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.fillText('@', cx, cy);
    ctx.shadowBlur = 0;
  }

  // Floating text.
  ctx.font = `800 ${Math.round(v.cellH * 0.6)}px ui-monospace, monospace`;
  for (const f of fx) {
    const { cx, cy } = center(f.x, f.y);
    const k = f.age / f.life;
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#0b0b0e';
    ctx.strokeText(f.text, cx, cy - v.cellH * (0.6 + k));
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, cx, cy - v.cellH * (0.6 + k));
  }
  ctx.globalAlpha = 1;
}
