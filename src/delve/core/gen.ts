// Seeded dungeon floors: rooms joined by corridors, doors at some room
// mouths, pillars in big rooms, stairs in the room farthest from the start.

import { Rng, mixSeed } from '../../shared/rng';
import { MAX_DEPTH, MONSTERS } from './content';
import type { Item, ItemKind, Level, Monster, MonsterKind, Tile } from './types';

export const SIZE = 33;

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
    for (let tries = 0; tries < 200 && rooms.length < 9; tries++) {
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
  const kinds = (Object.keys(MONSTERS) as MonsterKind[]).filter((k) => depth >= MONSTERS[k].depths[0] && depth <= MONSTERS[k].depths[1]);
  const mk = (kind: MonsterKind, x: number, y: number): Omit<Monster, 'id'> => ({ kind, x, y, hp: MONSTERS[kind].hp, maxHp: MONSTERS[kind].hp, wait: 0, awake: false, stun: 0 });
  if (boss) {
    const c = center(rooms[1]);
    monsters.push({ ...mk('warden', c.x, c.y - 2) });
    for (const [dx, dy] of [[-4, 0], [4, 0], [-4, 3], [4, 3]]) monsters.push(mk('skeleton', c.x + dx, c.y + dy));
  } else {
    const n = Math.min(spots.length, Math.round(4 + depth * 1.6));
    for (let i = 0; i < n; i++) {
      const total = kinds.reduce((s, k) => s + MONSTERS[k].weight, 0);
      let r = rng.next() * total;
      let kind = kinds[0];
      for (const k of kinds) {
        r -= MONSTERS[k].weight;
        if (r <= 0) {
          kind = k;
          break;
        }
      }
      const s = spots.pop()!;
      monsters.push(mk(kind, s.x, s.y));
    }
  }
  const items: Omit<Item, 'id'>[] = [];
  const nItems = boss ? 2 : rng.int(4, 7);
  for (let i = 0; i < nItems && spots.length; i++) {
    const s = spots.pop()!;
    const r = rng.next();
    let kind: ItemKind;
    let value = 0;
    if (r < 0.32) kind = 'potion';
    else if (r < 0.5) kind = 'ether';
    else if (r < 0.75) {
      kind = 'gold';
      value = rng.int(5, 12) * depth;
    } else if (r < 0.88) {
      kind = 'weapon';
      value = Math.min(4, Math.floor(depth / 2.2) + rng.int(0, 1));
    } else {
      kind = 'armor';
      value = Math.min(4, Math.floor(depth / 2.2) + rng.int(0, 1));
    }
    items.push({ kind, x: s.x, y: s.y, value });
  }
  return { level: { w: SIZE, h: SIZE, tiles, seen: new Array(SIZE * SIZE).fill(false) }, start, monsters, items };
}
