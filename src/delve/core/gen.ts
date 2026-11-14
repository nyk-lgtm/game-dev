// Seeded dungeon floors: rooms joined by corridors, doors at some room
// mouths, pillars in big rooms, stairs in the room farthest from the start.

import { Rng, mixSeed } from '../../shared/rng';
import { ITEM_POTION, MAX_DEPTH, MONSTERS } from './content';
import type { Item, ItemKind, Level, Monster, MonsterKind, Tile } from './types';

export const SIZE = 33;
/** At most this many of a kind on one floor. */
const FLOOR_CAP: Partial<Record<MonsterKind, number>> = { golem: 1, wraith: 2, mage: 2 };
/** On a capped kind's first depth only one shows up, so wraiths and cultists (both new at depth 5) ease in. */
export function floorCap(kind: MonsterKind, depth: number): number {
  const cap = FLOOR_CAP[kind];
  if (cap === undefined) return Infinity;
  return depth === MONSTERS[kind].depths[0] ? Math.min(1, cap) : cap;
}
/** Kinds that only spawn on open ground. */
const ROOMY = new Set<MonsterKind>(['golem']);

interface Room {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Floor {
  level: Level;
  start: { x: number; y: number };
  monsters: Omit<Monster, 'id'>[];
  items: Omit<Item, 'id'>[];
}

const idx = (x: number, y: number) => y * SIZE + x;

function carveRoom(t: Tile[], r: Room): void {
  for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) t[idx(x, y)] = 'floor';
}

function carveCorridor(t: Tile[], ax: number, ay: number, bx: number, by: number, rng: Rng): void {
  const horizontalFirst = rng.next() < 0.5;
  const line = (x0: number, y0: number, x1: number, y1: number) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (t[idx(x, y0)] === 'wall') t[idx(x, y0)] = 'floor';
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) if (t[idx(x1, y)] === 'wall') t[idx(x1, y)] = 'floor';
  };
  if (horizontalFirst) line(ax, ay, bx, by);
  else {
    for (let y = Math.min(ay, by); y <= Math.max(ay, by); y++) if (t[idx(ax, y)] === 'wall') t[idx(ax, y)] = 'floor';
    for (let x = Math.min(ax, bx); x <= Math.max(ax, bx); x++) if (t[idx(x, by)] === 'wall') t[idx(x, by)] = 'floor';
  }
}

const center = (r: Room) => ({ x: r.x + Math.floor(r.w / 2), y: r.y + Math.floor(r.h / 2) });

/** BFS distances over walkable tiles. */
export function distances(tiles: Tile[], from: { x: number; y: number }): Int16Array {
  const d = new Int16Array(SIZE * SIZE).fill(-1);
  const q = [from.x, from.y];
  d[idx(from.x, from.y)] = 0;
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i];
    const y = q[i + 1];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= SIZE || ny >= SIZE) continue;
      const k = idx(nx, ny);
      if (d[k] >= 0 || tiles[k] === 'wall' || tiles[k] === 'pillar') continue;
      d[k] = d[idx(x, y)] + 1;
      q.push(nx, ny);
    }
  }
  return d;
}

export function generateFloor(seed: number, depth: number): Floor {
  const rng = new Rng(mixSeed(seed, depth * 101));
  const tiles: Tile[] = new Array(SIZE * SIZE).fill('wall');
  const rooms: Room[] = [];
  const boss = depth === MAX_DEPTH;
  if (boss) {
    // The Warden's hall: one big pillared room reached by a corridor.
    const hall = { x: 8, y: 6, w: 17, h: 13 };
    const entry = { x: 14, y: 24, w: 5, h: 4 };
    rooms.push(entry, hall);
  } else {
    // The first floor is smaller, so a new player meets something within a minute.
    const roomCount = depth === 1 ? 6 : 9;
    for (let tries = 0; tries < 200 && rooms.length < roomCount; tries++) {
      const w = rng.int(3, 7);
      const h = rng.int(3, 7);
      const r = { x: rng.int(1, SIZE - w - 2), y: rng.int(1, SIZE - h - 2), w, h };
      if (rooms.some((o) => r.x < o.x + o.w + 1 && o.x < r.x + r.w + 1 && r.y < o.y + o.h + 1 && o.y < r.y + r.h + 1)) continue;
      rooms.push(r);
    }
  }
  for (const r of rooms) carveRoom(tiles, r);
  // Chain rooms in order of x for a winding layout, plus one loop.
  const order = boss ? rooms : [...rooms].sort((a, b) => a.x + a.y * 0.3 - (b.x + b.y * 0.3));
  for (let i = 1; i < order.length; i++) {
    const a = center(order[i - 1]);
    const b = center(order[i]);
    carveCorridor(tiles, a.x, a.y, b.x, b.y, rng);
  }
  if (order.length > 3) {
    const a = center(order[0]);
    const b = center(order[order.length - 2]);
    carveCorridor(tiles, a.x, a.y, b.x, b.y, rng);
  }
  // Doors where a corridor meets a room edge (a floor cell with walls on two opposite sides).
  for (const r of rooms) {
    for (let x = r.x - 1; x <= r.x + r.w; x++)
      for (let y = r.y - 1; y <= r.y + r.h; y++) {
        const onEdge = x === r.x - 1 || x === r.x + r.w || y === r.y - 1 || y === r.y + r.h;
        if (!onEdge || x <= 0 || y <= 0 || x >= SIZE - 1 || y >= SIZE - 1) continue;
        if (tiles[idx(x, y)] !== 'floor') continue;
        const ns = tiles[idx(x, y - 1)] === 'wall' && tiles[idx(x, y + 1)] === 'wall';
        const ew = tiles[idx(x - 1, y)] === 'wall' && tiles[idx(x + 1, y)] === 'wall';
        if ((ns || ew) && rng.next() < 0.45) tiles[idx(x, y)] = 'door';
      }
  }
  // Pillars in big rooms (never next to a door or on the room's spine).
  for (const r of rooms) {
    if (r.w < 5 || r.h < 5) continue;
    for (const [px, py] of [[r.x + 1, r.y + 1], [r.x + r.w - 2, r.y + 1], [r.x + 1, r.y + r.h - 2], [r.x + r.w - 2, r.y + r.h - 2]])
      if (boss || rng.next() < 0.5) tiles[idx(px, py)] = 'pillar';
  }

  const startRoom = boss ? rooms[0] : order[0];
  const start = center(startRoom);
  const dist = distances(tiles, start);
  // Stairs: the reachable floor cell farthest from the start (not on the boss floor).
  let far = start;
  let fd = -1;
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      const d = dist[idx(x, y)];
      if (d > fd && tiles[idx(x, y)] === 'floor') {
        fd = d;
        far = { x, y };
      }
    }
  if (!boss) tiles[idx(far.x, far.y)] = 'stairs';

  // Monsters and items on reachable floor away from the start.
  const spots: { x: number; y: number }[] = [];
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) if (tiles[idx(x, y)] === 'floor' && dist[idx(x, y)] >= 4) spots.push({ x, y });
  rng.shuffle(spots);
  const monsters: Omit<Monster, 'id'>[] = [];
  const kinds = (Object.keys(MONSTERS) as MonsterKind[]).filter((k) => MONSTERS[k].weight > 0 && depth >= MONSTERS[k].depths[0] && depth <= MONSTERS[k].depths[1]);
  const mk = (kind: MonsterKind, x: number, y: number): Omit<Monster, 'id'> => ({ kind, x, y, hp: MONSTERS[kind].hp, maxHp: MONSTERS[kind].hp, wait: 0, awake: false, stun: 0 });
  if (boss) {
    const c = center(rooms[1]);
    monsters.push({ ...mk('warden', c.x, c.y - 2) });
    for (const [dx, dy] of [[-4, 0], [4, 0], [-4, 3], [4, 3]]) monsters.push(mk('skeleton', c.x + dx, c.y + dy));
  } else {
    const n = Math.min(spots.length, Math.round(2 + depth * 2.3));
    // Open ground: at least 5 of the 8 neighbours walkable (a room, not a corridor or dead end).
    const roomy = (p: { x: number; y: number }) => {
      let open = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && tiles[idx(p.x + dx, p.y + dy)] !== 'wall') open++;
      return open >= 5;
    };
    for (let i = 0; i < n && spots.length; i++) {
      // The heaviest foes are capped per floor, so a floor never stacks them.
      const pool = kinds.filter((k) => monsters.filter((m) => m.kind === k).length < floorCap(k, depth));
      const total = pool.reduce((s, k) => s + MONSTERS[k].weight, 0);
      let r = rng.next() * total;
      let kind = pool[0];
      for (const k of pool) {
        r -= MONSTERS[k].weight;
        if (r <= 0) {
          kind = k;
          break;
        }
      }
      // A golem waits in a room, never in a one-wide corridor you can't get around it in.
      if (ROOMY.has(kind)) {
        let at = spots.length - 1;
        while (at >= 0 && !roomy(spots[at])) at--;
        if (at >= 0) {
          const [s] = spots.splice(at, 1);
          monsters.push(mk(kind, s.x, s.y));
          continue;
        }
        kind = pool.find((k) => !ROOMY.has(k)) ?? kind;
      }
      const s = spots.pop()!;
      monsters.push(mk(kind, s.x, s.y));
    }
    // Now and then a cutpurse lurks as well (on top of the usual crowd).
    const t = MONSTERS.thief.depths;
    if (depth >= t[0] && depth <= t[1] && spots.length && rng.next() < 0.5) {
      const s = spots.pop()!;
      monsters.push(mk('thief', s.x, s.y));
    }
  }
  const items: Omit<Item, 'id'>[] = [];
  const nItems = boss ? 2 : rng.int(4, 7);
  // Never under a monster (the boss floor's guard stands on fixed cells, not on popped spots).
  const free = spots.filter((p) => !monsters.some((m) => m.x === p.x && m.y === p.y));
  for (let i = 0; i < nItems && free.length; i++) {
    const s = free.pop()!;
    const r = rng.next();
    let kind: ItemKind;
    let value = 0;
    if (r < ITEM_POTION) kind = 'potion';
    else if (r < 0.18) kind = 'ether';
    else if (r < 0.24) kind = 'map';
    else if (r < 0.62) {
      kind = 'gold';
      value = rng.int(4, 9) * depth;
    } else if (r < 0.81) {
      kind = 'weapon';
      value = Math.min(4, Math.floor(depth / 2.5) + rng.int(0, 1));
    } else {
      kind = 'armor';
      value = Math.min(4, Math.floor(depth / 2.5) + rng.int(0, 1));
    }
    items.push({ kind, x: s.x, y: s.y, value });
  }
  return { level: { w: SIZE, h: SIZE, tiles, seen: new Array(SIZE * SIZE).fill(false) }, start, monsters, items };
}
