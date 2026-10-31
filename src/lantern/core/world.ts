// Map loading and spatial queries: terrain, markers, line of sight, field of
// view and pathfinding. Pure: everything here is derived from the map data
// and the game state passed in.

import { MAPS, MONSTER_MARKERS, type Marker } from './maps';
import type { GameState, MapId, MonsterKind, Pos } from './types';

/** 8 directions, clockwise from north. */
export const DIRS8: readonly Pos[] = [
  { x: 0, y: -1 },
  { x: 1, y: -1 },
  { x: 1, y: 0 },
  { x: 1, y: 1 },
  { x: 0, y: 1 },
  { x: -1, y: 1 },
  { x: -1, y: 0 },
  { x: -1, y: -1 },
];

export interface LoadedMap {
  id: MapId;
  w: number;
  h: number;
  /** Terrain char per cell, row-major. Exits hold their glyph ('>' / '<'). */
  terrain: string[];
  markers: Map<number, { char: string; marker: Marker }>;
  monsters: { kind: MonsterKind; pos: Pos }[];
}

export const posKey = (p: Pos) => `${p.x},${p.y}`;
export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;
export const addPos = (a: Pos, b: Pos): Pos => ({ x: a.x + b.x, y: a.y + b.y });
export const chebyshev = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

function load(id: MapId): LoadedMap {
  const def = MAPS[id];
  const h = def.rows.length;
  const w = def.rows[0].length;
  const terrain: string[] = [];
  const markers = new Map<number, { char: string; marker: Marker }>();
  const monsters: LoadedMap['monsters'] = [];
  def.rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      const i = y * w + x;
      const m = def.legend[c];
      if (m) {
        markers.set(i, { char: c, marker: m });
        terrain[i] = m.kind === 'exit' ? m.glyph : def.ground;
      } else if (MONSTER_MARKERS[c]) {
        monsters.push({ kind: MONSTER_MARKERS[c], pos: { x, y } });
        terrain[i] = def.ground;
      } else terrain[i] = c;
    });
  });
  return { id, w, h, terrain, markers, monsters };
}

export const WORLD: Record<MapId, LoadedMap> = {
  village: load('village'),
  forest: load('forest'),
  cave1: load('cave1'),
  cave2: load('cave2'),
};

export function inMap(m: LoadedMap, p: Pos): boolean {
  return p.x >= 0 && p.y >= 0 && p.x < m.w && p.y < m.h;
}

export function terrainAt(m: LoadedMap, p: Pos): string | undefined {
  return inMap(m, p) ? m.terrain[p.y * m.w + p.x] : undefined;
}

export function markerAt(m: LoadedMap, p: Pos): Marker | undefined {
  return inMap(m, p) ? m.markers.get(p.y * m.w + p.x)?.marker : undefined;
}

const OPEN = new Set([',', '.', '=', '+', '_', '>', '<']);

/** Ground you can stand on, ignoring creatures (markers like NPCs and chests block). */
export function passable(m: LoadedMap, p: Pos): boolean {
  const t = terrainAt(m, p);
  if (t === undefined || !OPEN.has(t)) return false;
  const mk = markerAt(m, p);
  return !mk || mk.kind === 'exit' || mk.kind === 'spawn';
}

export function opaque(m: LoadedMap, p: Pos): boolean {
  const t = terrainAt(m, p);
  return t === undefined || t === '#' || t === 'T';
}

/** Find a marker by its legend character. */
export function markerPos(m: LoadedMap, char: string): Pos {
  for (const [i, v] of m.markers) if (v.char === char) return { x: i % m.w, y: Math.floor(i / m.w) };
  throw new Error(`no marker ${char} in ${m.id}`);
}

/** Where you arrive when entering map `m` through the exit marked `char`. */
export function arrivalPos(m: LoadedMap, char: string): Pos {
  const at = markerPos(m, char);
  for (const d of DIRS8) {
    const n = addPos(at, d);
    if (passable(m, n) && markerAt(m, n)?.kind !== 'exit') return n;
  }
  return at;
}

/** Bresenham line of sight between two cells (endpoints excluded from blocking). */
export function los(m: LoadedMap, a: Pos, b: Pos): boolean {
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    if (x === b.x && y === b.y) return true;
    if ((x !== a.x || y !== a.y) && opaque(m, { x, y })) return false;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

export const LANTERN_RADIUS = 6;

/** Cells lit by the lantern: within radius and in line of sight. */
export function fov(m: LoadedMap, from: Pos, radius = LANTERN_RADIUS): Set<number> {
  const out = new Set<number>();
  for (let y = from.y - radius; y <= from.y + radius; y++)
    for (let x = from.x - radius; x <= from.x + radius; x++) {
      const p = { x, y };
      if (!inMap(m, p)) continue;
      const dx = x - from.x;
      const dy = y - from.y;
      if (dx * dx + dy * dy > radius * radius + radius) continue;
      if (los(m, from, p)) out.add(y * m.w + x);
    }
  return out;
}

export function monsterAt(s: GameState, map: MapId, p: Pos) {
  return s.monsters.find((mo) => mo.hp > 0 && mo.map === map && samePos(mo.pos, p));
}

/**
 * Shortest 8-way walk for the player from `from` to `to` on the current map,
 * through passable known ground, avoiding monsters. If `to` itself is not
 * walkable (a monster, NPC, chest...), the path ends next to it and the final
 * step bumps into it. Returns direction indices, or null if unreachable.
 */
export function pathTo(s: GameState, to: Pos): number[] | null {
  const m = WORLD[s.player.map];
  const from = s.player.pos;
  if (samePos(from, to) || !inMap(m, to)) return null;
  const seen = s.seen[m.id];
  const known = (p: Pos) => !MAPS[m.id].dark || (seen !== undefined && seen[p.y * m.w + p.x] === '1');
  const goalOpen = passable(m, to) && !monsterAt(s, m.id, to);
  const prev = new Map<string, { p: Pos; d: number }>();
  const q: Pos[] = [from];
  prev.set(posKey(from), { p: from, d: -1 });
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    for (let d = 0; d < 8; d++) {
      const n = addPos(cur, DIRS8[d]);
      const k = posKey(n);
      if (prev.has(k)) continue;
      const isGoal = samePos(n, to);
      if (isGoal && !goalOpen) {
        // Bump into the goal from here.
        prev.set(k, { p: cur, d });
        return unwind(prev, from, n);
      }
      if (!passable(m, n) || !known(n) || monsterAt(s, m.id, n)) continue;
      // Don't route through other exits on the way.
      if (!isGoal && markerAt(m, n)?.kind === 'exit') continue;
      prev.set(k, { p: cur, d });
      if (isGoal) return unwind(prev, from, n);
      q.push(n);
    }
  }
  return null;
}

function unwind(prev: Map<string, { p: Pos; d: number }>, from: Pos, to: Pos): number[] {
  const dirs: number[] = [];
  let cur = to;
  while (!samePos(cur, from)) {
    const e = prev.get(posKey(cur))!;
    dirs.push(e.d);
    cur = e.p;
  }
  return dirs.reverse();
}
