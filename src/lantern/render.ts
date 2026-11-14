// ASCII rendering: one glyph per cell on a canvas, colored, with a lantern
// light falloff in dark places and dim memory of explored ground.

import {
  MAPS,
  MONSTERS,
  WORLD,
  fov,
  markerAt,
  markerPos,
  type MapId,
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
  /** Floaters from the same turn on the same cell stack upward. */
  stack: number;
  turn: number;
}

/** A big line at the top of the board (level up, the Ember). */
export interface Banner {
  text: string;
  sub: string;
  color: string;
  age: number;
  life: number;
}

/** The exit that leads home from each map (pointed at once you carry the Ember). */
const HOMEWARD: Partial<Record<MapId, string>> = { forest: 'W', cave1: 'U', cave2: 'V' };

export const MONSTER_COLORS: Record<MonsterKind, string> = {
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
/** Short role labels drawn over people so you can tell who is who. */
const NPC_LABELS: Record<NpcId, string> = {
  elder: 'Elder',
  smith: 'Smith',
  healer: 'Healer',
  child: 'Pip',
  hermit: 'Hermit',
};

const hash = (x: number, y: number) => ((x * 73856093) ^ (y * 19349663)) >>> 0;

/** Glyph and color for a terrain char at (x, y) on map `id`. */
function terrainGlyph(t: string, x: number, y: number, outdoors: boolean, time: number): [string, string] {
  switch (t) {
    case '#':
      return ['#', outdoors ? '#a2835f' : '#9298ad'];
    case '.':
      return ['·', outdoors ? '#6b5640' : '#6a6f82'];
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
  banner: Banner | null = null,
  walkTarget: Pos | null = null,
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
      // Stairs and shut chests stay easy to spot once seen: remembered ones keep a warm,
      // dimmed colour on a faint plate, and lit ones never fade with distance.
      const beacon = mk?.kind === 'exit' || (mk?.kind === 'chest' && !s.done.includes(mk.id));
      if (remembered && beacon) {
        ctx.fillStyle = 'rgba(255,209,102,0.10)';
        ctx.fillRect(cx - v.cellW / 2 + 1, cy - v.cellH / 2 + 1, v.cellW - 2, v.cellH - 2);
        color = mk?.kind === 'exit' ? '#b8953c' : '#a8843a';
      } else if (remembered) color = '#262832';
      else if (lit && !beacon) {
        const d = Math.hypot(x - P.x, y - P.y);
        ctx.globalAlpha = Math.max(0.5, 1 - d / 10);
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

  // Name tags over people in view (after the terrain so nothing covers them).
  // The Elder carries the quest: while she has something to say she is
  // flagged with "!", and pinned to the screen edge when out of view. With the
  // Ember in hand, the Lantern and the way home are flagged too.
  ctx.font = `700 ${Math.max(10, Math.round(v.cellH * 0.4))}px ui-monospace, monospace`;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#0b0b0e';
  const tag = (text: string, x: number, y: number, color: string) => {
    const half = ctx.measureText(text).width / 2 + 4;
    const tx = Math.min(w - half, Math.max(half, x));
    const ty = Math.min(h - 10, Math.max(10, y));
    ctx.strokeText(text, tx, ty);
    ctx.fillStyle = color;
    ctx.fillText(text, tx, ty);
  };
  const inView = (x: number, y: number) => x >= v.x0 && y >= v.y0 && x < v.x0 + v.cols && y < v.y0 + v.rows;
  const edgeArrow = (x: number, y: number) => (x < v.x0 ? '◀ ' : x >= v.x0 + v.cols ? '▶ ' : y < v.y0 ? '▲ ' : '▼ ');
  // A label sits above its cell, or below it when you stand just above (never over the @).
  const label = (text: string, x: number, y: number, color: string) => {
    const { cx, cy } = center(x, y);
    const below = P.y === y - 1 && Math.abs(P.x - x) <= 1;
    tag(text, cx, cy + (below ? 0.62 : -0.62) * v.cellH, color);
  };
  const beacons: { x: number; y: number; text: string; color: string; pin: boolean }[] = [];
  for (const [i, mk] of m.markers) {
    const x = i % m.w;
    const y = Math.floor(i / m.w);
    if (mk.marker.kind === 'lantern' && s.quest === 'ember') beacons.push({ x, y, text: '! Lantern', color: '#ff9f43', pin: true });
    if (mk.marker.kind !== 'npc') continue;
    const npc = mk.marker.npc;
    const flagged = npc === 'elder' && (s.quest === 'none' || s.quest === 'ember');
    // (With the Ember, the Lantern is the one pinned to the screen edge.)
    beacons.push({ x, y, text: flagged ? `! ${NPC_LABELS[npc]}` : NPC_LABELS[npc], color: NPC_COLORS[npc], pin: s.quest === 'none' && flagged && !lit });
  }
  const home = HOMEWARD[id];
  if (s.quest === 'ember' && home) {
    const at = markerPos(m, home);
    if (!lit || seen?.[at.y * m.w + at.x] === '1') beacons.push({ ...at, text: 'Way home', color: '#ff9f43', pin: true });
  }
  for (const b of beacons) {
    const i = b.y * m.w + b.x;
    const shown = !lit || lit.has(i) || (b.pin && seen?.[i] === '1');
    if (inView(b.x, b.y) && shown) label(b.text, b.x, b.y, b.color);
    else if (b.pin && !inView(b.x, b.y)) {
      const { cx, cy } = center(b.x, b.y);
      tag(`${edgeArrow(b.x, b.y)}${b.text.replace(/^! /, '')}`, cx, cy, b.color);
    }
  }
  ctx.font = font;

  // Planned walk, and a ring where it ends.
  ctx.fillStyle = 'rgba(255,209,102,0.35)';
  for (const p of path) {
    const { cx, cy } = center(p.x, p.y);
    ctx.fillRect(cx - 2, cy - 2, 4, 4);
  }
  if (walkTarget && inView(walkTarget.x, walkTarget.y)) {
    const { cx, cy } = center(walkTarget.x, walkTarget.y);
    ctx.strokeStyle = 'rgba(255,209,102,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - v.cellW / 2 + 2, cy - v.cellH / 2 + 2, v.cellW - 4, v.cellH - 4);
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
      ctx.fillStyle = '#4a2026';
      ctx.fillRect(cx - v.cellW * 0.45, cy + v.cellH * 0.38, v.cellW * 0.9, 4);
      ctx.fillStyle = '#ff5c5c';
      ctx.fillRect(cx - v.cellW * 0.45, cy + v.cellH * 0.38, v.cellW * 0.9 * (mo.hp / max), 4);
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
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#0b0b0e';
  for (const f of fx) {
    const { cx, cy } = center(f.x, f.y);
    const k = f.age / f.life;
    const ty = cy - v.cellH * (0.6 + 0.8 * k + 0.7 * f.stack);
    ctx.globalAlpha = Math.max(0, 1 - k * k);
    ctx.strokeText(f.text, cx, ty);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, cx, ty);
  }
  ctx.globalAlpha = 1;

  // Banner across the top of the board.
  if (banner) {
    const k = banner.age / banner.life;
    ctx.globalAlpha = Math.min(1, 4 * k, 4 * (1 - k));
    const y = Math.max(36, v.oy + v.cellH * 1.6);
    ctx.fillStyle = 'rgba(11,11,14,0.82)';
    ctx.fillRect(0, y - 30, w, 58);
    ctx.font = `800 ${Math.round(v.cellH * 0.95)}px ui-monospace, monospace`;
    ctx.fillStyle = banner.color;
    ctx.fillText(banner.text, w / 2, y - 8);
    ctx.font = `600 ${Math.max(11, Math.round(v.cellH * 0.45))}px ui-monospace, monospace`;
    ctx.fillStyle = '#e8e6df';
    ctx.fillText(banner.sub, w / 2, y + 16);
    ctx.globalAlpha = 1;
  }
}
