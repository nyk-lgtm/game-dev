// Enemy behaviors. Each kind decides its desired velocity (and attacks) every
// step. Dangerous moves are telegraphed: `phase` and `t` tell the renderer
// what to show (aim lines, swelling, slam circles).

import { TAU } from './math';
import { MAX_BULLETS, damage, enemiesWithin, hurtPlayer, spawnEnemy } from './combat';
import type { Enemy, World } from './types';

/** Telegraph lengths, seconds (shown to the player before the hit lands). */
export const DART_AIM = 0.7;
export const SPIT_AIM = 0.45;
export const BLOAT_SWELL = 0.9;
export const SLAM_AIM = 1.6;
/** The Eclipse enrages below this HP fraction (faster cycle). */
export const ECLIPSE_ENRAGE = 0.35;
export const SLAM_RADIUS = 150;
export const eclipseCycle = (hp: number, maxHp: number) => (hp < maxHp * ECLIPSE_ENRAGE ? 9 : 12);
export const PRISM_AIM = 0.8;
/** A bloater's blast hits for this multiple of its contact damage. */
export const BLOAT_BLAST = 1.5;

function fire(w: World, x: number, y: number, dx: number, dy: number, speed: number, dmg: number, r = 6, life = 4): void {
  if (w.bullets.length >= MAX_BULLETS) return;
  w.bullets.push({ x, y, vx: dx * speed, vy: dy * speed, r, dmg, life, alive: true });
}

/** Spitters hold fire while this many enemy shots are already in the air, so
 *  regular enemies never fill the screen with bullets (bosses aren't limited). */
export const SPIT_BUDGET = 14;

/** Returns the enemy's intended velocity for this step. */
export function think(w: World, e: Enemy, dt: number): { vx: number; vy: number } {
  const p = w.player;
  const dx = p.x - e.x;
  const dy = p.y - e.y;
  const d = Math.sqrt(dx * dx + dy * dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const sp = e.speed * e.slow;
  const chase = { vx: ux * sp, vy: uy * sp };
  e.t += dt;

  switch (e.kind) {
    case 'dart': {
      if (e.phase === 0) {
        if (e.t > 3.2 && d < 360) {
          e.phase = 1;
          e.t = 0;
          e.ax = ux;
          e.ay = uy;
        }
        return chase;
      }
      if (e.phase === 1) {
        if (e.t > DART_AIM) {
          e.phase = 2;
          e.t = 0;
        }
        return { vx: 0, vy: 0 };
      }
      if (e.t > 0.45) {
        e.phase = 0;
        e.t = 0;
      }
      return { vx: e.ax * 310, vy: e.ay * 310 };
    }

    case 'spitter': {
      let vx = 0;
      let vy = 0;
      // Hold a band close enough to stay on a portrait screen (~200 units to the side).
      if (d > 195) [vx, vy] = [ux * sp, uy * sp];
      else if (d < 140) [vx, vy] = [-ux * sp, -uy * sp];
      else [vx, vy] = [-uy * sp * 0.6, ux * sp * 0.6];
      if (e.phase === 0 && e.t > 3.6 && d < 320 && w.bullets.length < SPIT_BUDGET) {
        e.phase = 1;
        e.t = 0;
      } else if (e.phase === 1) {
        if (e.t > SPIT_AIM) {
          // Short-lived: a missed shot fades before it can drift back on screen.
          fire(w, e.x, e.y, ux, uy, 150, e.dmg, 6, 2.6);
          e.phase = 0;
          e.t = 0;
        }
        return { vx: 0, vy: 0 };
      }
      return { vx, vy };
    }

    case 'bloater': {
      if (e.phase === 0) {
        if (d < 55 + e.r) {
          e.phase = 1;
          e.t = 0;
        }
        return chase;
      }
      if (e.t > BLOAT_SWELL) {
        explode(w, e);
      }
      return { vx: 0, vy: 0 };
    }

    case 'orbiter': {
      // Circle the player, drifting inward.
      const tx = -uy;
      const ty = ux;
      const inward = d > 90 ? 0.4 : 0.15;
      return { vx: (tx * 0.9 + ux * inward) * sp, vy: (ty * 0.9 + uy * inward) * sp };
    }

    case 'prism':
      return prism(w, e, ux, uy, d, chase);

    case 'eclipse':
      return eclipse(w, e, chase);

    default:
      return chase;
  }
}

/** Bloater blast: hurts the player and other enemies nearby. */
function explode(w: World, e: Enemy): void {
  const r = 78;
  const p = w.player;
  if ((p.x - e.x) ** 2 + (p.y - e.y) ** 2 < (r + 12) ** 2) hurtPlayer(w, e.dmg * BLOAT_BLAST);
  e.alive = false;
  w.fx.push({ type: 'boom', x: e.x, y: e.y, r, color: 0 });
  enemiesWithin(w, e.x, e.y, r, (o, dd) => {
    if (o === e) return;
    damage(w, o, 40 / w.stats.might, null, (o.x - e.x) / (dd || 1), (o.y - e.y) / (dd || 1), 120);
  });
}

function prism(w: World, e: Enemy, ux: number, uy: number, d: number, chase: { vx: number; vy: number }) {
  // phase 0 roam; every 3.4s a radial burst; every 4th cycle a telegraphed lunge.
  if (e.phase === 0) {
    if (e.t > 3.4) {
      e.t = 0;
      e.ax += 1;
      const n = e.hp < e.maxHp / 2 ? 22 : 16;
      const off = e.ax * 0.3;
      for (let i = 0; i < n; i++) {
        const a = off + (i / n) * TAU;
        fire(w, e.x, e.y, Math.cos(a), Math.sin(a), 120, 12, 7);
      }
      if (e.ax % 3 === 0 && d < 420) {
        e.phase = 1;
        e.ay = Math.atan2(uy, ux);
      }
    }
    return chase;
  }
  if (e.phase === 1) {
    if (e.t > PRISM_AIM) {
      e.phase = 2;
      e.t = 0;
    }
    return { vx: 0, vy: 0 };
  }
  if (e.t > 0.65) {
    e.phase = 0;
    e.t = 0;
  }
  return { vx: Math.cos(e.ay) * 420, vy: Math.sin(e.ay) * 420 };
}

function eclipse(w: World, e: Enemy, chase: { vx: number; vy: number }) {
  // A 12-second cycle: spiral, summon, slam, then chase. Faster when hurt.
  // (The renderer mirrors this threshold and cycle for the slam telegraph.)
  const enraged = e.hp < e.maxHp * ECLIPSE_ENRAGE;
  // A long fight wears you down: after 75s every attack gets denser.
  const fury = e.t > 75 ? 2 : 0;
  const cycle = eclipseCycle(e.hp, e.maxHp);
  const t = e.t % cycle;
  const step = Math.floor(e.t * 8);
  if (t < 3) {
    if (step !== e.phase) {
      e.phase = step;
      const arms = (enraged ? 7 : 5) + fury;
      for (let i = 0; i < arms; i++) {
        const a = e.t * 1.7 + (i / arms) * TAU;
        fire(w, e.x, e.y, Math.cos(a), Math.sin(a), 150, 28, 7);
      }
    }
    return { vx: chase.vx * 0.3, vy: chase.vy * 0.3 };
  }
  if (t < 3.2 && e.ax !== Math.floor(e.t / cycle) + 1) {
    e.ax = Math.floor(e.t / cycle) + 1;
    // Moths circle in; every other call, bloaters too.
    const moths = 12 + fury * 3;
    for (let i = 0; i < moths; i++) {
      const a = (i / moths) * TAU;
      spawnEnemy(w, 'orbiter', w.player.x + Math.cos(a) * 330, w.player.y + Math.sin(a) * 330);
    }
    if (e.ax % 2 === 0)
      for (let i = 0; i < 6; i++) {
        const a = ((i + 0.5) / 6) * TAU;
        spawnEnemy(w, 'bloater', w.player.x + Math.cos(a) * 300, w.player.y + Math.sin(a) * 300);
      }
    w.fx.push({ type: 'warn', text: 'The Eclipse calls its moths' });
  }
  if (t >= 4 && t < 4 + SLAM_AIM) {
    if (e.ay === 0) {
      // Mark where the slam will land: on the player, right now.
      e.ay = 1;
      e.sx = w.player.x;
      e.sy = w.player.y;
    }
    return { vx: 0, vy: 0 };
  }
  if (t >= 4 + SLAM_AIM && e.ay === 1) {
    e.ay = 0;
    const r = SLAM_RADIUS;
    const p = w.player;
    if ((p.x - e.sx) ** 2 + (p.y - e.sy) ** 2 < r * r) hurtPlayer(w, 65);
    w.fx.push({ type: 'boom', x: e.sx, y: e.sy, r, color: 15 });
    // The impact throws a ring of embers outward from the edge of the blast.
    const n = (enraged ? 24 : 18) + fury * 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + e.t;
      fire(w, e.sx + Math.cos(a) * r * 0.5, e.sy + Math.sin(a) * r * 0.5, Math.cos(a), Math.sin(a), 120, 30, 7);
    }
  }
  return chase;
}
