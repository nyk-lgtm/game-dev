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

/** Straight neighbors first (S, N, E, W), then diagonals. */
const ARRIVAL_ORDER = [4, 0, 2, 6, 3, 5, 1, 7];

/**
 * Where you arrive when entering map `m` through the exit marked `char`:
 * the first free ground next to it that you could step to from the exit.
 */
export function arrivalPos(m: LoadedMap, char: string, free: (p: Pos) => boolean = () => true): Pos {
  const at = markerPos(m, char);
  for (const d of ARRIVAL_ORDER) {
    const n = addPos(at, DIRS8[d]);
    if (passable(m, n) && markerAt(m, n)?.kind !== 'exit' && canStep(m, at, d) && free(n)) return n;
  }
  return at;
}

/**
 * A diagonal step can't squeeze between two blocked cells (wall corners,
 * trees, water). Straight steps are always fine here.
 */
export function canStep(m: LoadedMap, from: Pos, dir: number): boolean {
  if (dir % 2 === 0) return true;
  const d = DIRS8[dir];
  const open = (p: Pos) => {
    const t = terrainAt(m, p);
    return t !== undefined && OPEN.has(t);
  };
  return open({ x: from.x + d.x, y: from.y }) || open({ x: from.x, y: from.y + d.y });
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
    const px = x;
    const py = y;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
    // Sight can't squeeze diagonally between two blocking cells, just as a step
    // can't (so you never see into a place you can't walk to that way). The
    // wall right behind such a corner still shows, so room corners draw.
    if (x !== px && y !== py && opaque(m, { x, y: py }) && opaque(m, { x: px, y })) {
      if (!(x === b.x && y === b.y && opaque(m, b))) return false;
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

/** How far a tap-walk may wander to get closer to an unreachable spot: about twice the straight distance. */
export const detourLimit = (straight: number) => Math.max(6, 2 * straight);

/**
 * When `to` can't be reached (unexplored dark, behind a wall), the walk to a
 * reachable known cell nearer to it, so a far tap still heads that way. Cells
 * are judged by how close they get you (straight-line) and how far you must
 * walk to them (path length): 2 per cell of closeness against 1 per step. A
 * cell more than `detourLimit` steps away never counts, so a tap past a wall
 * never sends you on a long loop round. Null when nothing within that reach is
 * any closer than where you stand.
 */
export function pathToward(s: GameState, to: Pos): number[] | null {
  const m = WORLD[s.player.map];
  const from = s.player.pos;
  const seen = s.seen[m.id];
  const known = (p: Pos) => !MAPS[m.id].dark || (seen !== undefined && seen[p.y * m.w + p.x] === '1');
  const crow = (p: Pos) => chebyshev(p, to) * 4 + Math.abs(p.x - to.x) + Math.abs(p.y - to.y);
  const limit = detourLimit(chebyshev(from, to));
  const here = crow(from);
  let best: Pos | null = null;
  let bestScore = Infinity;
  let bestCrow = Infinity;
  const steps = new Map<string, number>([[posKey(from), 0]]);
  const q: Pos[] = [from];
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    const dc = steps.get(posKey(cur))!;
    if (dc >= limit) continue;
    for (let d = 0; d < 8; d++) {
      const n = addPos(cur, DIRS8[d]);
      const k = posKey(n);
      if (steps.has(k) || !inMap(m, n) || !canStep(m, cur, d) || !passable(m, n) || !known(n) || monsterAt(s, m.id, n)) continue;
      if (markerAt(m, n)?.kind === 'exit') continue;
      steps.set(k, dc + 1);
      q.push(n);
      const c = crow(n);
      if (c >= here) continue;
      const score = 2 * chebyshev(n, to) + dc + 1;
      if (score < bestScore || (score === bestScore && c < bestCrow)) {
        bestScore = score;
        bestCrow = c;
        best = n;
      }
    }
  }
  return best ? pathTo(s, best) : null;
}

/**
 * Shortest 8-way walk for the player from `from` to `to` on the current map,
 * through passable known ground, avoiding monsters. If `to` itself is not
 * walkable (a monster, NPC, chest...), the path ends next to it and the final
 * step bumps into it. Returns direction indices, or null if unreachable.
 * `throughMonsters` plans as if no monster stood in the way (the walk then
 * stops at the first one that does).
 */
export function pathTo(s: GameState, to: Pos, throughMonsters = false): number[] | null {
  const m = WORLD[s.player.map];
  const blocks = (p: Pos) => !throughMonsters && !!monsterAt(s, m.id, p);
  const from = s.player.pos;
  if (samePos(from, to) || !inMap(m, to)) return null;
  const seen = s.seen[m.id];
  const known = (p: Pos) => !MAPS[m.id].dark || (seen !== undefined && seen[p.y * m.w + p.x] === '1');
  const goalOpen = passable(m, to) && !monsterAt(s, m.id, to);
  // Only creatures and things (NPCs, chests, signs, the lantern) can be bumped.
  const goalMarker = markerAt(m, to);
  const bumpable = !!monsterAt(s, m.id, to) || (!!goalMarker && goalMarker.kind !== 'exit' && goalMarker.kind !== 'spawn');
  if (!goalOpen && !bumpable) return null;
  const prev = new Map<string, { p: Pos; d: number }>();
  const q: Pos[] = [from];
  prev.set(posKey(from), { p: from, d: -1 });
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    for (let d = 0; d < 8; d++) {
      const n = addPos(cur, DIRS8[d]);
      const k = posKey(n);
      if (prev.has(k) || !canStep(m, cur, d)) continue;
      const isGoal = samePos(n, to);
      if (isGoal && !goalOpen) {
        // Bump into the goal from here.
        prev.set(k, { p: cur, d });
        return unwind(prev, from, n);
      }
      if (!passable(m, n) || !known(n) || blocks(n)) continue;
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

/**
 * How a tap walks: straight there when known ground reaches it (`direct`),
 * otherwise as close as known ground allows. The UI re-plans a non-direct
 * walk after every step, so a tap into the dark keeps going as the lantern
 * reveals the way. When only monsters stand in the way, the walk goes straight
 * there and stops at the first one (`blocked`). Null when no step gets any
 * closer within `detourLimit`.
 */
export function planWalk(s: GameState, to: Pos): { dirs: number[]; direct: boolean; blocked?: boolean } | null {
  const dirs = pathTo(s, to);
  if (dirs) return { dirs, direct: true };
  const past = pathTo(s, to, true);
  if (past) return { dirs: past, direct: true, blocked: true };
  const toward = pathToward(s, to);
  return toward ? { dirs: toward, direct: false } : null;
}

/** A known open cell next to an unseen cell that isn't solid rock: the edge of what you've explored. */
function isFrontier(m: LoadedMap, seen: string, p: Pos): boolean {
  for (let d = 0; d < 8; d++) {
    const n = addPos(p, DIRS8[d]);
    // Only neighbours a step could reach: standing here always lights those.
    if (inMap(m, n) && seen[n.y * m.w + n.x] !== '1' && !opaque(m, n) && canStep(m, p, d)) return true;
  }
  return false;
}

/**
 * Auto-explore on a dark map: the walk to the nearest unopened chest you know
 * of (the last step opens it), else to the nearest edge of the explored
 * ground. Routes over known, monster-free ground and never through exits.
 * Null when nothing reachable is left to explore (or the map is lit).
 */
export function explorePath(s: GameState): { dirs: number[]; target: Pos; kind: 'chest' | 'frontier' } | null {
  const m = WORLD[s.player.map];
  const seen = s.seen[m.id];
  if (!MAPS[m.id].dark || !seen) return null;
  const from = s.player.pos;
  const idx = (p: Pos) => p.y * m.w + p.x;
  const dist = new Int32Array(m.w * m.h).fill(-1);
  dist[idx(from)] = 0;
  const q: Pos[] = [from];
  let frontier: Pos | null = null;
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    for (let d = 0; d < 8; d++) {
      const n = addPos(cur, DIRS8[d]);
      if (!inMap(m, n) || dist[idx(n)] >= 0 || !canStep(m, cur, d)) continue;
      if (!passable(m, n) || seen[idx(n)] !== '1' || monsterAt(s, m.id, n) || markerAt(m, n)?.kind === 'exit') continue;
      dist[idx(n)] = dist[idx(cur)] + 1;
      q.push(n);
      if (!frontier && isFrontier(m, seen, n)) frontier = n;
    }
  }
  // Chests first: the cheapest to bump into.
  let chest: { p: Pos; c: number } | null = null;
  for (const [i, v] of m.markers) {
    if (v.marker.kind !== 'chest' || s.done.includes(v.marker.id) || seen[i] !== '1') continue;
    const p = { x: i % m.w, y: Math.floor(i / m.w) };
    for (let d = 0; d < 8; d++) {
      const n = addPos(p, DIRS8[d]);
      const dn = inMap(m, n) ? dist[idx(n)] : -1;
      if (dn >= 0 && canStep(m, n, (d + 4) % 8) && (!chest || dn + 1 < chest.c)) chest = { p, c: dn + 1 };
    }
  }
  if (chest) {
    const dirs = pathTo(s, chest.p);
    if (dirs) return { dirs, target: chest.p, kind: 'chest' };
  }
  if (frontier) {
    const dirs = pathTo(s, frontier);
    if (dirs) return { dirs, target: frontier, kind: 'frontier' };
  }
  return null;
}
