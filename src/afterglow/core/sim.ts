// The Afterglow simulation: create a world, advance it one fixed step at a
// time with the joystick as input, and resolve level-up / chest choices.
// Deterministic for a given seed and input sequence.

import { Rng, mixSeed } from '../../shared/rng';
import { CHARACTERS, ENEMIES, META, baseStats, xpToNext, type Profile } from './content';
import { PLAYER_R, damage, enemiesWithin, hurtPlayer } from './combat';
import { direct, spawnPoint } from './director';
import { think } from './enemyai';
import { SpatialHash } from './spatial';
import { applyChoice, choiceKey, openChest, recomputeStats, rollChoices } from './upgrades';
import { WEAPONS } from './weapons';
import type { Choice, Enemy, World } from './types';

export const DT = 1 / 60;
export const RECYCLE_DIST = 900;
export const BASE_REROLLS = 2;
export const BASE_BANISHES = 1;

export function createWorld(seed: number, characterId = 'spark', profile?: Profile): World {
  const ch = CHARACTERS.find((c) => c.id === characterId) ?? CHARACTERS[0];
  const base = baseStats();
  ch.mod(base);
  const extras = { rerolls: BASE_REROLLS, revives: 0 };
  for (const m of META) {
    const rank = profile?.ranks[m.id] ?? 0;
    if (rank) m.apply(base, rank, extras);
  }
  const w: World = {
    seed,
    rng: new Rng(mixSeed(seed, 7)),
    time: 0,
    tick: 0,
    character: ch.id,
    base,
    stats: { ...base },
    player: { x: 0, y: 0, hp: base.maxHp, fx: 0, fy: -1, iframes: 0, level: 1, xp: 0, revives: extras.revives },
    weapons: [{ id: ch.weapon, level: 1, cd: 0.3, t: 0, dealt: 0 }],
    passives: {},
    enemies: [],
    shots: [],
    mines: [],
    bullets: [],
    pickups: [],
    nextId: 1,
    kills: 0,
    shards: 0,
    pendingLevels: 0,
    choices: [],
    rerolls: extras.rerolls,
    banishes: BASE_BANISHES,
    banished: [],
    chestQueue: 0,
    spawnAcc: 0,
    eventsDone: [],
    boss: null,
    status: 'playing',
    fx: [],
    grid: new SpatialHash(64),
    hitCd: new Map(),
    dealt: {},
    blades: [],
    auras: [],
  };
  recomputeStats(w);
  w.player.hp = w.stats.maxHp;
  return w;
}

/** True while the sim is waiting on the player (level-up or chest). */
export const waiting = (w: World) => w.pendingLevels > 0 || w.chestQueue > 0;

/** Advance one fixed step. (ix, iy) is the joystick, magnitude <= 1. */
export function step(w: World, ix: number, iy: number): void {
  if (w.status !== 'playing' || waiting(w)) return;
  const dt = DT;
  w.time += dt;
  w.tick++;
  const p = w.player;
  const st = w.stats;

  // Move.
  const m = Math.sqrt(ix * ix + iy * iy);
  if (m > 1) {
    ix /= m;
    iy /= m;
  }
  p.x += ix * st.speed * dt;
  p.y += iy * st.speed * dt;
  if (m > 0.2) {
    const ml = Math.sqrt(ix * ix + iy * iy);
    p.fx = ix / ml;
    p.fy = iy / ml;
  }
  if (st.regen > 0) p.hp = Math.min(st.maxHp, p.hp + st.regen * dt);
  if (p.iframes > 0) p.iframes -= dt;

  // Index enemies; wardens shield their neighbors; auras will set slows.
  w.grid.rebuild(w.enemies);
  for (const e of w.enemies) {
    e.shielded = false;
    e.slow = 1;
  }
  for (const e of w.enemies) {
    if (e.kind !== 'warden' || !e.alive) continue;
    enemiesWithin(w, e.x, e.y, 95, (o) => {
      if (o !== e) o.shielded = true;
    });
  }

  w.blades.length = 0;
  w.auras.length = 0;
  for (const ws of w.weapons) WEAPONS[ws.id].tick(w, ws, dt);

  moveEnemies(w, dt);
  moveShots(w, dt);
  updateMines(w, dt);
  moveBullets(w, dt);
  collectPickups(w, dt);
  direct(w, dt);

  // Compact dead entities.
  w.enemies = w.enemies.filter((e) => e.alive);
  w.shots = w.shots.filter((s) => s.alive);
  w.mines = w.mines.filter((s) => s.alive);
  w.bullets = w.bullets.filter((s) => s.alive);
  w.pickups = w.pickups.filter((s) => s.alive);
  if (w.tick % 300 === 0) for (const [k, t] of w.hitCd) if (t < w.time) w.hitCd.delete(k);

  // Level-ups.
  while (p.xp >= xpToNext(p.level)) {
    p.xp -= xpToNext(p.level);
    p.level++;
    w.pendingLevels++;
    w.fx.push({ type: 'levelUp' });
  }
  if (w.pendingLevels > 0 && w.choices.length === 0) w.choices = rollChoices(w);
}

function moveEnemies(w: World, dt: number): void {
  const p = w.player;
  const decay = Math.pow(0.0005, dt);
  for (const e of w.enemies) {
    if (!e.alive) continue;
    const v = think(w, e, dt);
    if (!e.alive) continue; // exploded
    e.x += (v.vx + e.kx) * dt;
    e.y += (v.vy + e.ky) * dt;
    e.kx *= decay;
    e.ky *= decay;
    if (e.flash > 0) e.flash -= dt;

    // Gentle separation so swarms don't stack into one blob.
    w.grid.query(e.x, e.y, e.r * 2, (o) => {
      if (o === e || o.id < e.id) return;
      const dx = o.x - e.x;
      const dy = o.y - e.y;
      const min = (o.r + e.r) * 0.9;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) return;
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.25;
      const ex = (dx / d) * push;
      const ey = (dy / d) * push;
      const he = ENEMIES[e.kind].heavy;
      const ho = ENEMIES[o.kind].heavy;
      e.x -= ex * (1 - he * 0.8);
      e.y -= ey * (1 - he * 0.8);
      o.x += ex * (1 - ho * 0.8);
      o.y += ey * (1 - ho * 0.8);
    });

    const dx = e.x - p.x;
    const dy = e.y - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < (e.r + PLAYER_R) ** 2) hurtPlayer(w, e.dmg);
    // Far behind? Bring it back around in front of the player.
    if (d2 > RECYCLE_DIST * RECYCLE_DIST) {
      const s = spawnPoint(w);
      e.x = s.x;
      e.y = s.y;
    }
  }
}

function moveShots(w: World, dt: number): void {
  for (const s of w.shots) {
    if (!s.alive) continue;
    s.life -= dt;
    if (s.life <= 0) {
      s.alive = false;
      continue;
    }
    if (s.homing > 0) {
      let best: Enemy | null = null;
      let bd = 260 * 260;
      w.grid.query(s.x, s.y, 260, (e) => {
        const d = (e.x - s.x) ** 2 + (e.y - s.y) ** 2;
        if (d < bd && !s.hit.includes(e.id)) {
          bd = d;
          best = e;
        }
      });
      if (best) {
        const b: Enemy = best;
        const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        const dx = b.x - s.x;
        const dy = b.y - s.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const k = Math.min(1, s.homing * dt);
        s.vx += ((dx / d) * sp - s.vx) * k;
        s.vy += ((dy / d) * sp - s.vy) * k;
        const ns = Math.sqrt(s.vx * s.vx + s.vy * s.vy) || 1;
        s.vx = (s.vx / ns) * sp;
        s.vy = (s.vy / ns) * sp;
      }
    }
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    w.grid.query(s.x, s.y, s.r + 50, (e) => {
      if (!s.alive || s.hit.includes(e.id)) return;
      if ((e.x - s.x) ** 2 + (e.y - s.y) ** 2 > (e.r + s.r) ** 2) return;
      s.hit.push(e.id);
      const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy) || 1;
      damage(w, e, s.dmg, s.weapon, s.vx / sp, s.vy / sp, s.knock);
      if (s.bounces > 0) {
        bounce(w, s, e);
        return;
      }
      s.pierce--;
      if (s.pierce <= 0) s.alive = false;
    });
  }
}

/** Ricochet: turn toward the nearest enemy not yet hit; pinball discs also split. */
function bounce(w: World, s: World['shots'][number], from: Enemy): void {
  s.bounces--;
  let best: Enemy | null = null;
  let bd = 240 * 240;
  w.grid.query(from.x, from.y, 240, (e) => {
    if (s.hit.includes(e.id)) return;
    const d = (e.x - from.x) ** 2 + (e.y - from.y) ** 2;
    if (d < bd) {
      bd = d;
      best = e;
    }
  });
  const sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  if (best) {
    const b: Enemy = best;
    const dx = b.x - s.x;
    const dy = b.y - s.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    s.vx = (dx / d) * sp;
    s.vy = (dy / d) * sp;
  } else {
    // Nothing nearby: carom off at an angle.
    const a = Math.atan2(s.vy, s.vx) + Math.PI * (0.6 + w.rng.next() * 0.8);
    s.vx = Math.cos(a) * sp;
    s.vy = Math.sin(a) * sp;
  }
  if (s.split && w.shots.length < 400) {
    const a = Math.atan2(s.vy, s.vx) + 0.6;
    w.shots.push({ ...s, hit: [...s.hit], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, split: false, bounces: Math.max(0, s.bounces - 1) });
  }
  s.life = Math.max(s.life, 0.6);
}

function updateMines(w: World, dt: number): void {
  for (const m of w.mines) {
    if (!m.alive) continue;
    m.life -= dt;
    if (m.arm > 0) {
      m.arm -= dt;
      continue;
    }
    let trip = m.life <= 0;
    if (!trip)
      w.grid.query(m.x, m.y, m.r + 40, (e) => {
        if (!trip && (e.x - m.x) ** 2 + (e.y - m.y) ** 2 < (e.r + m.r) ** 2) trip = true;
      });
    if (trip) detonate(w, m);
  }
}

function detonate(w: World, m: World['mines'][number]): void {
  if (!m.alive) return;
  m.alive = false;
  enemiesWithin(w, m.x, m.y, m.blast, (e, d) => damage(w, e, m.dmg, m.weapon, (e.x - m.x) / (d || 1), (e.y - m.y) / (d || 1), 150));
  w.fx.push({ type: 'boom', x: m.x, y: m.y, r: m.blast, color: 25 });
  // Minefield blasts set off neighbors.
  if (m.weapon === 'minefield')
    for (const o of w.mines)
      if (o.alive && o.arm <= 0 && (o.x - m.x) ** 2 + (o.y - m.y) ** 2 < m.blast * m.blast) detonate(w, o);
}

function moveBullets(w: World, dt: number): void {
  const p = w.player;
  for (const b of w.bullets) {
    if (!b.alive) continue;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) b.alive = false;
    else if ((b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.r + PLAYER_R - 3) ** 2) {
      b.alive = false;
      hurtPlayer(w, b.dmg);
    }
  }
}

function collectPickups(w: World, dt: number): void {
  const p = w.player;
  const reach = w.stats.magnet;
  for (const k of w.pickups) {
    if (!k.alive) continue;
    const dx = p.x - k.x;
    const dy = p.y - k.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    if (!k.pulled && d < (k.kind === 'gem' || k.kind === 'shard' ? reach : 30)) k.pulled = true;
    if (k.pulled) {
      const sp = Math.max(220, 600 - d);
      k.x += (dx / d) * sp * dt;
      k.y += (dy / d) * sp * dt;
    }
    if (d > 16) continue;
    k.alive = false;
    w.fx.push({ type: 'pickup', kind: k.kind });
    switch (k.kind) {
      case 'gem':
        p.xp += k.value;
        break;
      case 'shard':
        w.shards += k.value * w.stats.greed;
        break;
      case 'heart':
        p.hp = Math.min(w.stats.maxHp, p.hp + 30);
        break;
      case 'magnet':
        for (const g of w.pickups) if (g.kind === 'gem') g.pulled = true;
        break;
      case 'bomb':
        enemiesWithin(w, p.x, p.y, 520, (e, dd) => damage(w, e, 250 / w.stats.might, null, (e.x - p.x) / (dd || 1), (e.y - p.y) / (dd || 1), 300));
        w.fx.push({ type: 'ring', x: p.x, y: p.y, r: 520, color: 0 });
        break;
      case 'chest':
        w.chestQueue++;
        break;
    }
  }
}

// ---------- decisions ----------

/** Take one of the offered level-up choices. */
export function choose(w: World, index: number): void {
  const c = w.choices[index];
  if (!c || w.pendingLevels <= 0) throw new Error('nothing to choose');
  applyChoice(w, c);
  w.pendingLevels--;
  w.choices = w.pendingLevels > 0 ? rollChoices(w) : [];
}

export function reroll(w: World): void {
  if (w.rerolls <= 0 || w.pendingLevels <= 0) return;
  w.rerolls--;
  w.choices = rollChoices(w);
}

/** Skip this level-up (no reward). */
export function skip(w: World): void {
  if (w.pendingLevels <= 0) return;
  w.pendingLevels--;
  w.choices = w.pendingLevels > 0 ? rollChoices(w) : [];
}

/** Remove a choice from the pool for the rest of the run, then re-roll. */
export function banish(w: World, index: number): void {
  const c = w.choices[index];
  if (!c || w.banishes <= 0 || c.kind === 'gold') return;
  w.banishes--;
  w.banished.push(choiceKey(c));
  w.choices = rollChoices(w);
}

/** Open the next queued chest; returns what it gave. */
export function takeChest(w: World): Choice[] {
  if (w.chestQueue <= 0) return [];
  w.chestQueue--;
  return openChest(w);
}
