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
    const dmg = at([10, 12, 12, 12, 12, 15, 15, 18], l);
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
  levels: ['Bursts around you, knocking enemies back', '+4 damage', 'Bigger', 'Faster', '+7 damage', 'Bigger', 'Faster', '+9 damage, bigger'],
  evolvesWith: 'haste',
  evolvesInto: 'supernova',
  tick(w, ws, dt) {
    const l = ws.level;
    const r = at([105, 105, 120, 120, 120, 135, 135, 150], l) * w.stats.area;
    const dmg = at([16, 20, 20, 20, 27, 27, 27, 36], l);
    // Multicast adds echoes: smaller follow-up bursts 0.25s apart (ws.t counts them down).
    if (ws.t > 0) {
      const before = Math.ceil(ws.t / 0.25);
      ws.t -= dt;
      if (Math.ceil(Math.max(0, ws.t) / 0.25) < before) {
        burst(w, 'nova', w.player.x, w.player.y, r * 0.85, dmg * 0.6, 120);
        w.fx.push({ type: 'ring', x: w.player.x, y: w.player.y, r: r * 0.85, color: 280 });
      }
    }
    if (!ready(w, ws, dt, at([2.6, 2.6, 2.6, 2.2, 2.2, 2.2, 1.9, 1.9], l))) return;
    burst(w, 'nova', w.player.x, w.player.y, r, dmg, 170);
    w.fx.push({ type: 'ring', x: w.player.x, y: w.player.y, r, color: 270 });
    ws.t = w.stats.amount * 0.25;
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
  desc: 'Piercing beams along the direction you move.',
  levels: ['Piercing beams ahead of and behind you', '+6 damage', 'Longer', '+2 beams to the sides', '+8 damage', 'Wider', 'Faster', '+10 damage, longer'],
  evolvesWith: 'velocity',
  evolvesInto: 'railgun',
  tick(w, ws, dt) {
    const l = ws.level;
    if (!ready(w, ws, dt, at([1.7, 1.7, 1.7, 1.7, 1.7, 1.7, 1.3, 1.3], l))) return;
    const dmg = at([20, 26, 26, 26, 34, 34, 34, 44], l);
    const length = at([230, 230, 290, 290, 290, 290, 290, 350], l) * w.stats.area * Math.sqrt(w.stats.velocity);
    const width = at([16, 16, 16, 16, 16, 24, 24, 24], l) * w.stats.area;
    const p = w.player;
    const dirs = [0, Math.PI];
    if (l >= 4) dirs.push(Math.PI / 2, -Math.PI / 2);
    // Each extra projectile is a mirrored pair, so Lance stays symmetric front and back.
    for (let i = 0; i < w.stats.amount; i++) {
      const off = (i % 2 ? -1 : 1) * (0.35 + 0.2 * Math.floor(i / 2));
      dirs.push(off, off + Math.PI);
    }
    for (const a of dirs) {
      const d = rotate(p.fx, p.fy, a);
      beam(w, 'lance', p.x, p.y, d.x, d.y, length, width, dmg, 50);
    }
  },
};

const mines: WeaponDef = {
  id: 'mines',
  name: 'Mines',
  hue: 175,
  maxLevel: 8,
  desc: 'Drops mines that blow up when enemies step on them.',
  levels: ['Drops a mine behind you', '+6 damage', 'Bigger blasts', '+1 mine per drop', '+6 damage', 'Faster', 'Bigger blasts', '+1 mine, +8 damage'],
  evolvesWith: 'duration',
  evolvesInto: 'minefield',
  tick(w, ws, dt) {
    const l = ws.level;
    if (!ready(w, ws, dt, at([1.6, 1.6, 1.6, 1.6, 1.6, 1.25, 1.25, 1.25], l))) return;
    const n = at([1, 1, 1, 2, 2, 2, 2, 3], l) + w.stats.amount;
    const dmg = at([24, 30, 30, 30, 36, 36, 36, 44], l);
    const blast = at([50, 50, 60, 60, 60, 60, 72, 72], l) * w.stats.area;
    dropMines(w, 'mines', n, 18, dmg, blast, 8);
  },
};

/** Live mines per weapon. More than this just carpets the screen. */
const MAX_MINES = 14;

function dropMines(w: World, id: WeaponId, n: number, spread: number, dmg: number, blast: number, life: number): void {
  const live = w.mines.filter((m) => m.alive && m.weapon === id).length;
  const p = w.player;
  for (let i = 0; i < n && live + i < MAX_MINES; i++) {
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
  levels: ['Aura hurts and slows enemies near you', '+1 damage', 'Bigger', '+2 damage', 'Bigger', 'Stronger slow', '+3 damage', 'Bigger, +4 damage'],
  evolvesWith: 'vitality',
  evolvesInto: 'sanctum',
  tick(w, ws, dt) {
    const l = ws.level;
    const r = at([56, 56, 66, 66, 76, 76, 76, 90], l) * w.stats.area;
    const dmg = at([6, 7, 7, 9, 9, 9, 12, 16], l);
    const slow = at([0.75, 0.75, 0.75, 0.75, 0.75, 0.6, 0.6, 0.6], l);
    aura(w, ws, dt, 'halo', r, dmg, slow, 0);
  },
};

const siphon: WeaponDef = {
  id: 'siphon',
  name: 'Siphon',
  hue: 130,
  maxLevel: 8,
  desc: 'Tethers to the nearest enemies and drains them.',
  levels: ['Drains the nearest enemy', '+1 tether', '+2 damage', 'Longer reach', '+1 tether', '+3 damage', 'Faster drain', '+1 tether, +3 damage'],
  evolvesWith: 'regen',
  evolvesInto: 'wellspring',
  tick(w, ws, dt) {
    const l = ws.level;
    const n = at([1, 2, 2, 2, 3, 3, 3, 4], l) + Math.floor(w.stats.amount / 2);
    const range = at([150, 150, 150, 185, 185, 185, 185, 200], l) * w.stats.area;
    const dmg = at([8, 8, 10, 10, 10, 14, 14, 18], l);
    const every = at([0.4, 0.4, 0.4, 0.4, 0.4, 0.4, 0.3, 0.3], l);
    drain(w, ws, dt, 'siphon', n, range, dmg, every, 0);
  },
};

const well: WeaponDef = {
  id: 'well',
  name: 'Gravity Well',
  hue: 250,
  maxLevel: 8,
  desc: 'Opens a well in the swarm that drags enemies in and grinds them.',
  levels: ['A well pulls enemies in and hurts them', '+2 damage', 'Bigger', 'Lasts longer', '+1 well', 'Stronger pull', '+3 damage', 'Bigger, +1 well'],
  evolvesWith: 'magnet',
  evolvesInto: 'horizon',
  tick(w, ws, dt) {
    const l = ws.level;
    tickWells(w, 'well', dt);
    if (!ready(w, ws, dt, 4.2)) return;
    const n = at([1, 1, 1, 1, 2, 2, 2, 3], l) + Math.floor(w.stats.amount / 2);
    const r = at([70, 70, 85, 85, 85, 85, 85, 100], l) * w.stats.area;
    const life = at([2.6, 2.6, 2.6, 3.4, 3.4, 3.4, 3.4, 3.4], l) * w.stats.duration;
    const pull = at([90, 90, 90, 90, 90, 130, 130, 130], l);
    const dmg = at([5, 7, 7, 7, 7, 7, 10, 10], l);
    openWells(w, 'well', n, r, life, pull, dmg);
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

/** Lash the n nearest enemies within range; heal per tethered enemy each pulse. */
function drain(w: World, ws: WeaponState, dt: number, id: WeaponId, n: number, range: number, dmg: number, every: number, heal: number): void {
  const p = w.player;
  const near: { e: Enemy; d: number }[] = [];
  enemiesWithin(w, p.x, p.y, range, (e, d) => {
    if (near.length < n) near.push({ e, d });
    else {
      let far = 0;
      for (let i = 1; i < near.length; i++) if (near[i].d > near[far].d) far = i;
      if (d < near[far].d) near[far] = { e, d };
    }
  });
  const hue = WEAPONS[id].hue;
  for (const t of near) w.tethers.push({ x: t.e.x, y: t.e.y, hue });
  ws.t -= dt;
  if (ws.t > 0) return;
  ws.t += every * w.stats.haste;
  if (ws.t < 0) ws.t = 0;
  for (const t of near) damage(w, t.e, dmg, id, 0, 0, 0);
  if (heal && near.length) p.hp = Math.min(w.stats.maxHp, p.hp + heal * near.length);
}

/** Open wells on the densest nearby enemies (falls back to ahead of you). */
function openWells(w: World, id: WeaponId, n: number, r: number, life: number, pull: number, dmg: number): void {
  const p = w.player;
  for (let i = 0; i < n; i++) {
    const t = i === 0 ? nearestEnemy(w, p.x, p.y, 300) : randomEnemyNear(w, 320);
    const x = t ? t.x : p.x + p.fx * 120;
    const y = t ? t.y : p.y + p.fy * 120;
    w.wells.push({ weapon: id, x, y, r, pull, dmg, life, t: 0, alive: true });
  }
}

function tickWells(w: World, id: WeaponId, dt: number): void {
  for (const wl of w.wells) {
    if (wl.weapon !== id || !wl.alive) continue;
    wl.life -= dt;
    if (wl.life <= 0) {
      wl.alive = false;
      if (id === 'horizon') {
        burst(w, id, wl.x, wl.y, wl.r * 1.2, wl.dmg * 4, 260);
        w.fx.push({ type: 'ring', x: wl.x, y: wl.y, r: wl.r * 1.2, color: 250 });
      }
      continue;
    }
    wl.t -= dt;
    const hit = wl.t <= 0;
    if (hit) wl.t += 0.3;
    enemiesWithin(w, wl.x, wl.y, wl.r, (e, d) => {
      const def = e.kind === 'prism' || e.kind === 'eclipse' ? 1 : 0;
      if (!def && d > 4) {
        const k = (wl.pull * dt) / d;
        e.x -= (e.x - wl.x) * Math.min(1, k);
        e.y -= (e.y - wl.y) * Math.min(1, k);
      }
      if (hit) damage(w, e, wl.dmg, id, 0, 0, 0);
    });
    if (id === 'horizon') {
      // The horizon swallows loose gems and sends them to you.
      for (const g of w.pickups) {
        if (g.kind === 'gem' && !g.pulled && (g.x - wl.x) ** 2 + (g.y - wl.y) ** 2 < (wl.r * 1.6) ** 2) g.pulled = true;
      }
    }
  }
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
      spawnShot(w, { weapon: 'storm', x: w.player.x, y: w.player.y, vx: v.x * sp, vy: v.y * sp, dmg: 18, pierce: 2, homing: 7, r: 6 * w.stats.area, life: 1.4 * w.stats.duration });
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
    orbitBlades(w, ws.t, 'corona', 6 + w.stats.amount, 70 * a, 34, 12 * a);
    // The outer ring spins the other way, a little slower.
    orbitBlades(w, -ws.t * 0.7, 'corona', 8 + w.stats.amount, 120 * a, 34, 12 * a);
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
    // One echo, plus one more per Multicast, 0.3s apart (ws.t counts them down).
    if (ws.t > 0) {
      const before = Math.ceil(ws.t / 0.3);
      ws.t -= dt;
      if (Math.ceil(Math.max(0, ws.t) / 0.3) < before) {
        const r = 210 * w.stats.area;
        burst(w, 'supernova', p.x, p.y, r, 30, 220);
        w.fx.push({ type: 'ring', x: p.x, y: p.y, r, color: 290 });
      }
    }
    if (!ready(w, ws, dt, 1.3)) return;
    const r = 170 * w.stats.area;
    burst(w, 'supernova', p.x, p.y, r, 40, 220);
    w.fx.push({ type: 'ring', x: p.x, y: p.y, r, color: 270 });
    ws.t = 0.3 * (1 + w.stats.amount);
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
    if (!ready(w, ws, dt, 0.7)) return;
    for (let i = 0; i < 2 + w.stats.amount; i++) {
      const t = randomEnemyNear(w, 380);
      if (t) chain(w, 'tempest', t, 5, 130 * w.stats.area, 24, 210);
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
    // A cross of beams; each Multicast adds a mirrored diagonal pair.
    const n = 4 + 2 * w.stats.amount;
    for (let i = 0; i < n; i++) {
      const d = rotate(p.fx, p.fy, (i * 2 * Math.PI) / n);
      beam(w, 'railgun', p.x, p.y, d.x, d.y, 650 * w.stats.area, 30 * w.stats.area, 85, 50);
    }
  },
};

const minefield: WeaponDef = {
  id: 'minefield',
  name: 'Minefield',
  hue: 175,
  maxLevel: 1,
  from: 'mines',
  desc: 'Scatters clusters of mines whose blasts set each other off.',
  levels: ['Evolved Mines: clusters of chain-detonating mines'],
  tick(w, ws, dt) {
    if (!ready(w, ws, dt, 0.9)) return;
    dropMines(w, 'minefield', 3 + w.stats.amount, 45, 70, 95 * w.stats.area, 10);
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
      spawnShot(w, { weapon: 'pinball', x: w.player.x, y: w.player.y, vx: dir.x * sp, vy: dir.y * sp, dmg: 15, pierce: 99, bounces: 4, split: true, r: 9 * w.stats.area, life: 2.4 * w.stats.duration, knock: 70 });
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
    aura(w, ws, dt, 'sanctum', 135 * w.stats.area, 26, 0.5, 0.5);
  },
};

const wellspring: WeaponDef = {
  id: 'wellspring',
  name: 'Wellspring',
  hue: 130,
  maxLevel: 1,
  from: 'siphon',
  desc: 'Six tethers that drain the swarm and heal you.',
  levels: ['Evolved Siphon: many tethers, each drain heals you'],
  tick(w, ws, dt) {
    drain(w, ws, dt, 'wellspring', 6 + w.stats.amount, 230 * w.stats.area, 16, 0.25, 0.12);
  },
};

const horizon: WeaponDef = {
  id: 'horizon',
  name: 'Event Horizon',
  hue: 250,
  maxLevel: 1,
  from: 'well',
  desc: 'Huge wells that swallow gems and collapse in a blast.',
  levels: ['Evolved Gravity Well: huge wells that pull in gems and collapse with a blast'],
  tick(w, ws, dt) {
    tickWells(w, 'horizon', dt);
    if (!ready(w, ws, dt, 3.2)) return;
    openWells(w, 'horizon', 2 + Math.floor(w.stats.amount / 2), 120 * w.stats.area, 3.4 * w.stats.duration, 170, 10);
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
  siphon,
  wellspring,
  well,
  horizon,
};

export const BASE_WEAPONS: WeaponId[] = ['pulse', 'orbit', 'nova', 'arc', 'lance', 'mines', 'ricochet', 'halo', 'siphon', 'well'];
