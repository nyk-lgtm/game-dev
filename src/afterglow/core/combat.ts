// Shared combat helpers: damage, kills and drops, player damage, spawning
// player shots. Used by weapons, enemy behaviors and the main step.

import { ENEMIES } from './content';
import type { Enemy, EnemyKind, PickupKind, Shot, WeaponId, World } from './types';

export const PLAYER_R = 12;
export const MAX_GEMS = 200;
export const MAX_BULLETS = 300;

/** Hue used for hit sparks by weapon family. */
export const WEAPON_HUE: Record<string, number> = {
  pulse: 190, storm: 190,
  orbit: 160, corona: 160,
  nova: 270, supernova: 270,
  arc: 220, tempest: 220,
  lance: 50, railgun: 50,
  mines: 20, minefield: 20,
  ricochet: 300, pinball: 300,
  halo: 45, sanctum: 45,
};

export function dropPickup(w: World, kind: PickupKind, x: number, y: number, value = 1): void {
  if (kind === 'gem') {
    let gems = 0;
    let far: { d: number; i: number } | null = null;
    for (let i = 0; i < w.pickups.length; i++) {
      const p = w.pickups[i];
      if (!p.alive || p.kind !== 'gem' || p.pulled) continue;
      gems++;
      const d = (p.x - w.player.x) ** 2 + (p.y - w.player.y) ** 2;
      if (!far || d > far.d) far = { d, i };
    }
    // Too many gems on the floor: fold this one into the farthest.
    if (gems >= MAX_GEMS && far) {
      w.pickups[far.i].value += value;
      return;
    }
  }
  w.pickups.push({ kind, x, y, value, pulled: false, alive: true });
}

export function spawnEnemy(w: World, kind: EnemyKind, x: number, y: number, elite = false): Enemy {
  const d = ENEMIES[kind];
  const minutes = w.time / 60;
  const boss = kind === 'prism' || kind === 'eclipse';
  const hpMul = boss ? 1 : 1 + minutes * 0.3;
  const dmgMul = boss ? 1 : 1 + minutes * 0.07;
  const e: Enemy = {
    id: w.nextId++,
    kind,
    x,
    y,
    kx: 0,
    ky: 0,
    hp: d.hp * hpMul * (elite ? 7 : 1),
    maxHp: d.hp * hpMul * (elite ? 7 : 1),
    r: d.r * (elite ? 1.4 : 1),
    speed: d.speed * (elite ? 0.9 : 1),
    dmg: d.dmg * dmgMul * (elite ? 1.4 : 1),
    // Later enemies are worth more, so leveling keeps pace with the swarm.
    xp: d.xp * (elite ? 10 : 1) * (boss ? 1 : 1 + minutes * 0.35),
    elite,
    flash: 0,
    t: w.rng.next() * 2,
    phase: 0,
    ax: 0,
    ay: 0,
    sx: 0,
    sy: 0,
    shielded: false,
    slow: 1,
    alive: true,
  };
  w.enemies.push(e);
  return e;
}

/** Deal damage to an enemy, with optional knockback along (kx, ky) (unit vector). */
export function damage(w: World, e: Enemy, amount: number, weapon: WeaponId | null, kx = 0, ky = 0, knock = 0): void {
  if (!e.alive) return;
  let dmg = amount * w.stats.might;
  if (e.shielded) dmg *= 0.4;
  const dealt = Math.min(dmg, e.hp);
  e.hp -= dmg;
  e.flash = 0.08;
  if (weapon) w.dealt[weapon] = (w.dealt[weapon] ?? 0) + dealt;
  if (knock > 0) {
    const f = knock * (1 - ENEMIES[e.kind].heavy);
    e.kx += kx * f;
    e.ky += ky * f;
  }
  if (w.fx.length < 120) w.fx.push({ type: 'hit', x: e.x, y: e.y, color: weapon ? WEAPON_HUE[weapon] : 0, dmg });
  if (e.hp <= 0) kill(w, e);
}

export function kill(w: World, e: Enemy): void {
  if (!e.alive) return;
  e.alive = false;
  w.kills++;
  w.fx.push({ type: 'kill', x: e.x, y: e.y, kind: e.kind, elite: e.elite });
  const r = w.rng.next();
  if (e.kind === 'eclipse') {
    w.status = 'won';
    w.boss = null;
    return;
  }
  if (e.kind === 'prism') {
    w.boss = null;
    dropPickup(w, 'chest', e.x, e.y);
    dropPickup(w, 'shard', e.x + 20, e.y, 30);
    dropPickup(w, 'gem', e.x - 20, e.y, e.xp);
    return;
  }
  dropPickup(w, 'gem', e.x, e.y, e.xp);
  if (e.elite) {
    dropPickup(w, 'chest', e.x + 10, e.y);
    dropPickup(w, 'shard', e.x - 10, e.y, 5);
  } else if (r < 0.004) dropPickup(w, 'heart', e.x, e.y);
  else if (r < 0.0055) dropPickup(w, 'magnet', e.x, e.y);
  else if (r < 0.0075) dropPickup(w, 'bomb', e.x, e.y);
  else if (r < 0.022) dropPickup(w, 'shard', e.x, e.y, 1);
  if (e.kind === 'splitter') {
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + w.rng.next();
      spawnEnemy(w, 'mite', e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10);
    }
  }
}

export function hurtPlayer(w: World, amount: number): void {
  const p = w.player;
  if (p.iframes > 0 || w.status !== 'playing') return;
  const dmg = Math.max(1, amount - w.stats.armor);
  p.hp -= dmg;
  p.iframes = 0.4;
  w.fx.push({ type: 'hurt', dmg });
  if (p.hp > 0) return;
  if (p.revives > 0) {
    p.revives--;
    p.hp = w.stats.maxHp * 0.5;
    p.iframes = 2;
    // A shockwave clears breathing room.
    w.grid.query(p.x, p.y, 220, (e) => {
      const dx = e.x - p.x;
      const dy = e.y - p.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      if (d < 220) damage(w, e, 500, null, dx / d, dy / d, 400);
    });
    w.fx.push({ type: 'ring', x: p.x, y: p.y, r: 220, color: 50 });
    w.fx.push({ type: 'warn', text: 'Second Wind!' });
    return;
  }
  p.hp = 0;
  w.status = 'dead';
}

export function nearestEnemy(w: World, x: number, y: number, maxR: number, skip?: (e: Enemy) => boolean): Enemy | null {
  let best: Enemy | null = null;
  let bd = maxR * maxR;
  // Search outward in rings so the common case stays cheap.
  const rings = maxR > 220 ? [100, 220, maxR] : [maxR];
  for (const r of rings) {
    w.grid.query(x, y, r, (e) => {
      if (skip && skip(e)) return;
      const d = (e.x - x) ** 2 + (e.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = e;
      }
    });
    // Only trust a hit inside this ring: the grid query covers a square.
    if (best && bd <= r * r) return best;
  }
  return best;
}

export function enemiesWithin(w: World, x: number, y: number, r: number, fn: (e: Enemy, d: number) => void): void {
  w.grid.query(x, y, r + 50, (e) => {
    const d = Math.sqrt((e.x - x) ** 2 + (e.y - y) ** 2);
    if (d < r + e.r) fn(e, d);
  });
}

export function spawnShot(w: World, s: Partial<Shot> & Pick<Shot, 'weapon' | 'x' | 'y' | 'vx' | 'vy' | 'dmg'>): Shot {
  const shot: Shot = { r: 5, pierce: 1, life: 1.2, knock: 40, hit: [], homing: 0, bounces: 0, split: false, alive: true, ...s };
  w.shots.push(shot);
  return shot;
}

/** Per-(weapon, enemy) hit cooldown for continuous damage sources. */
export function canHit(w: World, weapon: WeaponId, e: Enemy, cooldown: number): boolean {
  const k = `${weapon}:${e.id}`;
  const next = w.hitCd.get(k) ?? 0;
  if (w.time < next) return false;
  w.hitCd.set(k, w.time + cooldown);
  return true;
}
