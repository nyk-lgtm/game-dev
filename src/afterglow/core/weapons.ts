// The arsenal. Each weapon is data plus a tick() that runs every sim step.
// Base weapons level 1..8; at max level, holding the matching passive lets a
// chest evolve it into a stronger form.

import { TAU } from './math';
import { canHit, damage, enemiesWithin, nearestEnemy, spawnShot } from './combat';
import type { Enemy, PassiveId, WeaponId, WeaponState, World } from './types';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  hue: number;
  maxLevel: number;
  desc: string;
  /** What each level adds (index 0 = when first taken). */
  levels: string[];
  evolvesWith?: PassiveId;
  evolvesInto?: WeaponId;
  /** For evolved weapons: the base it replaces. */
  from?: WeaponId;
  tick(w: World, ws: WeaponState, dt: number): void;
}

const at = <T>(arr: T[], level: number): T => arr[Math.min(level, arr.length) - 1];

/** Count down; returns true when it's time to fire (and resets the cooldown). */
function ready(w: World, ws: WeaponState, dt: number, cd: number): boolean {
  ws.cd -= dt;
  if (ws.cd > 0) return false;
  ws.cd += cd * w.stats.haste;
  if (ws.cd < 0) ws.cd = 0;
  return true;
}

function aimAt(w: World, e: Enemy | null): { x: number; y: number } {
  const p = w.player;
  if (!e) return { x: p.fx, y: p.fy };
  const dx = e.x - p.x;
  const dy = e.y - p.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / d, y: dy / d };
}

function rotate(x: number, y: number, a: number): { x: number; y: number } {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: x * c - y * s, y: x * s + y * c };
}

/** Damage everything within r of (x, y) with radial knockback. */
function burst(w: World, weapon: WeaponId, x: number, y: number, r: number, dmg: number, knock: number): void {
  enemiesWithin(w, x, y, r, (e, d) => {
    const nx = d > 0 ? (e.x - x) / d : 0;
    const ny = d > 0 ? (e.y - y) / d : 0;
    damage(w, e, dmg, weapon, nx, ny, knock);
  });
}

/** Damage along a line segment of the given width. */
function beam(w: World, weapon: WeaponId, x1: number, y1: number, dx: number, dy: number, length: number, width: number, dmg: number, hue: number): void {
  const x2 = x1 + dx * length;
  const y2 = y1 + dy * length;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  w.grid.query(mx, my, length / 2 + width, (e) => {
    const t = Math.max(0, Math.min(length, (e.x - x1) * dx + (e.y - y1) * dy));
    const px = x1 + dx * t;
    const py = y1 + dy * t;
    if ((e.x - px) ** 2 + (e.y - py) ** 2 < (width / 2 + e.r) ** 2) damage(w, e, dmg, weapon, dx, dy, 60);
  });
  w.fx.push({ type: 'beam', x1, y1, x2, y2, w: width, color: hue });
}

/** Lightning: strike a target, then hop to nearby unhit enemies. */
function chain(w: World, weapon: WeaponId, first: Enemy, hops: number, range: number, dmg: number, hue: number): void {
  const hit = new Set<number>();
  const pts = [w.player.x, w.player.y];
  let cur: Enemy | null = first;
  for (let i = 0; i <= hops && cur; i++) {
    hit.add(cur.id);
    pts.push(cur.x, cur.y);
    const from: Enemy = cur;
    damage(w, cur, dmg, weapon, 0, 0, 0);
    cur = nearestEnemy(w, from.x, from.y, range, (e) => hit.has(e.id));
  }
  w.fx.push({ type: 'chain', pts, color: hue });
}

function randomEnemyNear(w: World, range: number): Enemy | null {
  const p = w.player;
  const pool: Enemy[] = [];
  w.grid.query(p.x, p.y, range, (e) => {
    if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < range * range) pool.push(e);
  });
  return pool.length ? pool[Math.floor(w.rng.next() * pool.length)] : null;
}

// ---------- base weapons ----------

const pulse: WeaponDef = {
  id: 'pulse',
  name: 'Pulse',
  hue: 190,
  maxLevel: 8,
  desc: 'Fires bolts at the nearest enemy.',
  levels: ['Fires bolts at the nearest enemy', '+3 damage', '+1 bolt', '+1 pierce', '+1 bolt', 'Faster', '+4 damage', '+1 bolt, +1 pierce'],
  evolvesWith: 'multicast',
  evolvesInto: 'storm',
  tick(w, ws, dt) {
    const l = ws.level;
    if (!ready(w, ws, dt, at([0.9, 0.9, 0.9, 0.9, 0.9, 0.7, 0.7, 0.7], l))) return;
    const n = at([1, 1, 2, 2, 3, 3, 3, 4], l) + w.stats.amount;
    const dmg = at([10, 13, 13, 13, 13, 13, 17, 17], l);
    const pierce = at([1, 1, 1, 2, 2, 2, 2, 3], l);
    const dir = aimAt(w, nearestEnemy(w, w.player.x, w.player.y, 340));
    for (let i = 0; i < n; i++) {
      const v = rotate(dir.x, dir.y, (i - (n - 1) / 2) * 0.13);
      const sp = 430 * w.stats.velocity;
      spawnShot(w, { weapon: 'pulse', x: w.player.x, y: w.player.y, vx: v.x * sp, vy: v.y * sp, dmg, pierce, r: 5 * w.stats.area, life: 1.1 * w.stats.duration });
    }
  },
};

const orbit: WeaponDef = {
  id: 'orbit',
  name: 'Orbit',
  hue: 160,
  maxLevel: 8,
  desc: 'Blades circle you, cutting what they touch.',
  levels: ['2 blades circle you', '+2 damage', '+1 blade', 'Wider orbit', '+1 blade', '+3 damage', 'Faster spin', '+1 blade, +3 damage'],
  evolvesWith: 'reach',
  evolvesInto: 'corona',
  tick(w, ws, dt) {
    const l = ws.level;
    const n = at([2, 2, 3, 3, 4, 4, 4, 5], l) + w.stats.amount;
    const radius = at([62, 62, 62, 76, 76, 76, 76, 84], l) * w.stats.area;
    const dmg = at([8, 10, 10, 10, 10, 13, 13, 16], l);
    const spin = at([3.0, 3.0, 3.0, 3.0, 3.0, 3.0, 4.0, 4.0], l) * (0.8 + 0.2 * w.stats.velocity);
    ws.t += dt * spin;
    orbitBlades(w, ws.t, 'orbit', n, radius, dmg, 9 * w.stats.area);
  },
};

/** n blades evenly spaced on a circle, rotated by `angle`. */
function orbitBlades(w: World, angle: number, id: WeaponId, n: number, radius: number, dmg: number, size: number): void {
  const p = w.player;
  for (let i = 0; i < n; i++) {
    const a = angle + (i / n) * TAU;
    const bx = p.x + Math.cos(a) * radius;
    const by = p.y + Math.sin(a) * radius;
    w.blades.push({ x: bx, y: by, r: size, hue: id === 'corona' ? 150 : 160 });
    enemiesWithin(w, bx, by, size, (e) => {
      if (!canHit(w, id, e, 0.35)) return;
      damage(w, e, dmg, id, Math.cos(a), Math.sin(a), 90);
    });
  }
}

const nova: WeaponDef = {
  id: 'nova',
  name: 'Nova',
  hue: 270,
  maxLevel: 8,
  desc: 'A ring of force bursts out around you.',
  levels: ['Bursts around you, knocking enemies back', '+4 damage', 'Bigger', 'Faster', '+6 damage', 'Bigger', 'Faster', '+8 damage, bigger'],
  evolvesWith: 'haste',
  evolvesInto: 'supernova',
  tick(w, ws, dt) {
    const l = ws.level;
    if (!ready(w, ws, dt, at([2.6, 2.6, 2.6, 2.2, 2.2, 2.2, 1.9, 1.9], l))) return;
    const r = at([105, 105, 120, 120, 120, 135, 135, 150], l) * w.stats.area;
    const dmg = at([14, 18, 18, 18, 24, 24, 24, 32], l);
    burst(w, 'nova', w.player.x, w.player.y, r, dmg, 170);
    w.fx.push({ type: 'ring', x: w.player.x, y: w.player.y, r, color: 270 });
  },
};

const arc: WeaponDef = {
  id: 'arc',
  name: 'Arc',
  hue: 220,
  maxLevel: 8,
  desc: 'Lightning strikes an enemy and jumps between foes.',
  levels: ['Lightning jumps between 3 enemies', '+3 damage', '+1 jump', 'Strikes twice', '+4 damage', '+1 jump', 'Faster', 'Strikes three times'],
  evolvesWith: 'might',
  evolvesInto: 'tempest',
  tick(w, ws, dt) {
    const l = ws.level;
    if (!ready(w, ws, dt, at([1.5, 1.5, 1.5, 1.5, 1.5, 1.5, 1.15, 1.15], l))) return;
    const strikes = at([1, 1, 1, 2, 2, 2, 2, 3], l) + w.stats.amount;
    const hops = at([2, 2, 3, 3, 3, 4, 4, 4], l);
    const dmg = at([12, 15, 15, 15, 19, 19, 19, 19], l);
    for (let i = 0; i < strikes; i++) {
      const t = randomEnemyNear(w, 330);
      if (t) chain(w, 'arc', t, hops, 95 * w.stats.area, dmg, 220);
    }
  },
};

const lance: WeaponDef = {
  id: 'lance',
  name: 'Lance',
  hue: 50,
  maxLevel: 8,
  desc: 'A piercing beam in the direction you move.',
  levels: ['Piercing beam where you face', '+6 damage', 'Longer', '+1 beam behind', '+8 damage', 'Wider', 'Faster', '+10 damage, longer'],
  evolvesWith: 'velocity',
  evolvesInto: 'railgun',
  tick(w, ws, dt) {
    const l = ws.level;
    if (!ready(w, ws, dt, at([1.7, 1.7, 1.7, 1.7, 1.7, 1.7, 1.3, 1.3], l))) return;
    const dmg = at([20, 26, 26, 26, 34, 34, 34, 44], l);
    const length = at([230, 230, 290, 290, 290, 290, 290, 350], l) * w.stats.area * Math.sqrt(w.stats.velocity);
    const width = at([16, 16, 16, 16, 16, 24, 24, 24], l) * w.stats.area;
    const p = w.player;
    const dirs = [0];
    if (l >= 4) dirs.push(Math.PI);
    for (let i = 0; i < w.stats.amount; i++) dirs.push((i % 2 ? -1 : 1) * (0.35 + 0.2 * Math.floor(i / 2)));
    for (const a of dirs) {
      const d = rotate(p.fx, p.fy, a);
      beam(w, 'lance', p.x, p.y, d.x, d.y, length, width, dmg, 50);
    }
  },
};

const mines: WeaponDef = {
  id: 'mines',
  name: 'Mines',
  hue: 20,
  maxLevel: 8,
  desc: 'Drops mines that blow up when enemies step on them.',
  levels: ['Drops a mine behind you', '+6 damage', 'Bigger blasts', '+1 mine per drop', '+8 damage', 'Faster', 'Bigger blasts', '+1 mine, +10 damage'],
  evolvesWith: 'duration',
  evolvesInto: 'minefield',
  tick(w, ws, dt) {
    const l = ws.level;
    if (!ready(w, ws, dt, at([1.4, 1.4, 1.4, 1.4, 1.4, 1.1, 1.1, 1.1], l))) return;
    const n = at([1, 1, 1, 2, 2, 2, 2, 3], l) + w.stats.amount;
    const dmg = at([30, 36, 36, 36, 44, 44, 44, 54], l);
    const blast = at([55, 55, 66, 66, 66, 66, 78, 78], l) * w.stats.area;
    dropMines(w, 'mines', n, 18, dmg, blast, 8);
  },
};

function dropMines(w: World, id: WeaponId, n: number, spread: number, dmg: number, blast: number, life: number): void {
  const live = w.mines.filter((m) => m.alive && m.weapon === id).length;
  const p = w.player;
  for (let i = 0; i < n && live + i < 24; i++) {
    const a = w.rng.next() * TAU;
    const d = i === 0 ? 0 : spread + w.rng.next() * spread;
    w.mines.push({ weapon: id, x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, arm: 0.4, life: life * w.stats.duration, r: 14, blast, dmg, alive: true });
  }
}

const ricochet: WeaponDef = {
  id: 'ricochet',
  name: 'Ricochet',
  hue: 300,
  maxLevel: 8,
  desc: 'A disc that bounces from enemy to enemy.',
  levels: ['A disc bounces between 2 enemies', '+1 bounce', '+3 damage', '+1 disc', '+2 bounces', '+4 damage', 'Faster', '+1 disc, +2 bounces'],
  evolvesWith: 'swift',
  evolvesInto: 'pinball',
  tick(w, ws, dt) {
    const l = ws.level;
    if (!ready(w, ws, dt, at([1.6, 1.6, 1.6, 1.6, 1.6, 1.6, 1.25, 1.25], l))) return;
    const n = at([1, 1, 1, 2, 2, 2, 2, 3], l) + w.stats.amount;
    const bounces = at([2, 3, 3, 3, 5, 5, 5, 7], l);
    const dmg = at([12, 12, 15, 15, 15, 19, 19, 19], l);
    for (let i = 0; i < n; i++) {
      const t = i === 0 ? nearestEnemy(w, w.player.x, w.player.y, 400) : randomEnemyNear(w, 400);
      const dir = aimAt(w, t);
      const sp = 380 * w.stats.velocity;
      spawnShot(w, { weapon: 'ricochet', x: w.player.x, y: w.player.y, vx: dir.x * sp, vy: dir.y * sp, dmg, pierce: 99, bounces, r: 8 * w.stats.area, life: 2.2 * w.stats.duration, knock: 60 });
    }
  },
};

const halo: WeaponDef = {
  id: 'halo',
  name: 'Halo',
  hue: 45,
  maxLevel: 8,
  desc: 'A searing aura that hurts and slows nearby enemies.',
  levels: ['Aura hurts and slows enemies near you', '+1 damage', 'Bigger', '+2 damage', 'Bigger', 'Stronger slow', '+2 damage', 'Bigger, +3 damage'],
  evolvesWith: 'vitality',
  evolvesInto: 'sanctum',
  tick(w, ws, dt) {
    const l = ws.level;
    const r = at([52, 52, 62, 62, 72, 72, 72, 86], l) * w.stats.area;
    const dmg = at([4, 5, 5, 7, 7, 7, 9, 12], l);
    const slow = at([0.75, 0.75, 0.75, 0.75, 0.75, 0.6, 0.6, 0.6], l);
    aura(w, ws, dt, 'halo', r, dmg, slow, 0);
  },
};

function aura(w: World, ws: WeaponState, dt: number, id: WeaponId, r: number, dmg: number, slow: number, healPerKill: number): void {
  w.auras.push({ r, hue: id === 'sanctum' ? 55 : 45 });
  ws.t -= dt;
  const tick = ws.t <= 0;
  if (tick) ws.t += 0.33;
  const p = w.player;
  enemiesWithin(w, p.x, p.y, r, (e) => {
    e.slow = Math.min(e.slow, slow);
    if (!tick) return;
    const was = e.alive;
    damage(w, e, dmg, id, 0, 0, 0);
    if (was && !e.alive && healPerKill) p.hp = Math.min(w.stats.maxHp, p.hp + healPerKill);
  });
}

// ---------- evolutions ----------

const storm: WeaponDef = {
  id: 'storm',
  name: 'Storm',
  hue: 190,
  maxLevel: 1,
  from: 'pulse',
  desc: 'A torrent of homing bolts.',
  levels: ['Evolved Pulse: a torrent of homing bolts'],
  tick(w, ws, dt) {
    if (!ready(w, ws, dt, 0.16)) return;
    const n = 1 + Math.floor(w.stats.amount / 2);
    for (let i = 0; i < n; i++) {
      const t = i === 0 ? nearestEnemy(w, w.player.x, w.player.y, 450) : randomEnemyNear(w, 450);
      const dir = aimAt(w, t);
      const v = rotate(dir.x, dir.y, (w.rng.next() - 0.5) * 0.5);
      const sp = 480 * w.stats.velocity;
      spawnShot(w, { weapon: 'storm', x: w.player.x, y: w.player.y, vx: v.x * sp, vy: v.y * sp, dmg: 16, pierce: 2, homing: 7, r: 6 * w.stats.area, life: 1.4 * w.stats.duration });
    }
  },
};

const corona: WeaponDef = {
  id: 'corona',
  name: 'Corona',
  hue: 160,
  maxLevel: 1,
  from: 'orbit',
  desc: 'Two rings of blades, inner and outer.',
  levels: ['Evolved Orbit: two counter-spinning rings of blades'],
  tick(w, ws, dt) {
    const a = w.stats.area;
    ws.t += dt * 3.6;
    orbitBlades(w, ws.t, 'corona', 6 + w.stats.amount, 70 * a, 22, 12 * a);
    // The outer ring spins the other way, a little slower.
    orbitBlades(w, -ws.t * 0.7, 'corona', 8 + w.stats.amount, 120 * a, 22, 12 * a);
  },
};

const supernova: WeaponDef = {
  id: 'supernova',
  name: 'Supernova',
  hue: 270,
  maxLevel: 1,
  from: 'nova',
  desc: 'Frequent, huge bursts with an echo.',
  levels: ['Evolved Nova: huge bursts, each with an echo'],
  tick(w, ws, dt) {
    const p = w.player;
    if (ws.t > 0) {
      ws.t -= dt;
      if (ws.t <= 0) {
        const r = 210 * w.stats.area;
        burst(w, 'supernova', p.x, p.y, r, 34, 220);
        w.fx.push({ type: 'ring', x: p.x, y: p.y, r, color: 290 });
      }
    }
    if (!ready(w, ws, dt, 1.3)) return;
    const r = 170 * w.stats.area;
    burst(w, 'supernova', p.x, p.y, r, 46, 220);
    w.fx.push({ type: 'ring', x: p.x, y: p.y, r, color: 270 });
    ws.t = 0.3;
  },
};

const tempest: WeaponDef = {
  id: 'tempest',
  name: 'Tempest',
  hue: 220,
  maxLevel: 1,
  from: 'arc',
  desc: 'Constant lightning that leaps across the swarm.',
  levels: ['Evolved Arc: constant storms of chain lightning'],
  tick(w, ws, dt) {
    if (!ready(w, ws, dt, 0.55)) return;
    for (let i = 0; i < 3 + w.stats.amount; i++) {
      const t = randomEnemyNear(w, 380);
      if (t) chain(w, 'tempest', t, 7, 130 * w.stats.area, 30, 210);
    }
  },
};

const railgun: WeaponDef = {
  id: 'railgun',
  name: 'Railgun',
  hue: 50,
  maxLevel: 1,
  from: 'lance',
  desc: 'Screen-crossing beams in four directions.',
  levels: ['Evolved Lance: screen-wide beams in a cross'],
  tick(w, ws, dt) {
    if (!ready(w, ws, dt, 1.0)) return;
    const p = w.player;
    for (let i = 0; i < 4; i++) {
      const d = rotate(p.fx, p.fy, (i * Math.PI) / 2);
      beam(w, 'railgun', p.x, p.y, d.x, d.y, 650 * w.stats.area, 30 * w.stats.area, 85, 50);
    }
  },
};

const minefield: WeaponDef = {
  id: 'minefield',
  name: 'Minefield',
  hue: 20,
  maxLevel: 1,
  from: 'mines',
  desc: 'Scatters clusters of mines whose blasts set each other off.',
  levels: ['Evolved Mines: clusters of chain-detonating mines'],
  tick(w, ws, dt) {
    if (!ready(w, ws, dt, 0.9)) return;
    dropMines(w, 'minefield', 3 + w.stats.amount, 45, 80, 95 * w.stats.area, 10);
  },
};

const pinball: WeaponDef = {
  id: 'pinball',
  name: 'Pinball',
  hue: 300,
  maxLevel: 1,
  from: 'ricochet',
  desc: 'Discs that split every time they bounce.',
  levels: ['Evolved Ricochet: discs split on every bounce'],
  tick(w, ws, dt) {
    if (!ready(w, ws, dt, 1.0)) return;
    for (let i = 0; i < 2 + w.stats.amount; i++) {
      const t = randomEnemyNear(w, 420);
      const dir = aimAt(w, t);
      const sp = 420 * w.stats.velocity;
      spawnShot(w, { weapon: 'pinball', x: w.player.x, y: w.player.y, vx: dir.x * sp, vy: dir.y * sp, dmg: 28, pierce: 99, bounces: 6, split: true, r: 9 * w.stats.area, life: 2.4 * w.stats.duration, knock: 70 });
    }
  },
};

const sanctum: WeaponDef = {
  id: 'sanctum',
  name: 'Sanctum',
  hue: 45,
  maxLevel: 1,
  from: 'halo',
  desc: 'A vast holy aura. Kills inside it heal you.',
  levels: ['Evolved Halo: vast aura, kills inside heal you'],
  tick(w, ws, dt) {
    aura(w, ws, dt, 'sanctum', 125 * w.stats.area, 16, 0.5, 0.4);
  },
};

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pulse,
  orbit,
  nova,
  arc,
  lance,
  mines,
  ricochet,
  halo,
  storm,
  corona,
  supernova,
  tempest,
  railgun,
  minefield,
  pinball,
  sanctum,
};

export const BASE_WEAPONS: WeaponId[] = ['pulse', 'orbit', 'nova', 'arc', 'lance', 'mines', 'ricochet', 'halo'];
