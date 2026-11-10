// The Hexhold simulation: fixed 30 Hz ticks, seeded waves, towers whose
// strength depends on what's built next to them, and enemies that follow the
// maze you build. Pure and deterministic: (seed, actions at ticks) -> state.

import { Rng, mixSeed } from '../../shared/rng';
import { ADJ, CELL, CORE, FLY_DIST, N, PORTAL, POS, flowField, makeMap, nextCell, type Field, type Ground } from './board';
import {
  BURN_TIME,
  CHILL,
  ENEMIES,
  HP_GROWTH,
  LEVEL_DMG,
  LEVEL_RANGE,
  MAX_LEVEL,
  SELL_BACK,
  START_GOLD,
  START_LIVES,
  STUN_TIME,
  TOWERS,
  WAVES,
  upgradeCost,
  type EnemyId,
  type TowerId,
} from './content';

export const TICK = 1 / 30;

export interface Tower {
  cell: number;
  id: TowerId;
  level: number;
  cd: number;
  /** Gold put into it (for selling). */
  spent: number;
  /** Hits landed (every 4th stuns when next to a tesla). */
  hits: number;
}

export interface Enemy {
  uid: number;
  id: EnemyId;
  hp: number;
  maxHp: number;
  cell: number;
  next: number;
  /** Progress from cell to next, 0..1. */
  t: number;
  x: number;
  y: number;
  chill: number;
  stun: number;
  burn: number;
  burnDps: number;
  /** Healing queued for the next tick (strongest mender in reach). */
  healed: number;
  alive: boolean;
}

export type Fx =
  | { type: 'shot'; from: number; x: number; y: number; tower: TowerId }
  | { type: 'burst'; x: number; y: number; r: number }
  | { type: 'chain'; from: number; pts: number[] }
  | { type: 'die'; x: number; y: number; id: EnemyId; gold: number }
  | { type: 'leak'; lives: number }
  | { type: 'wave'; wave: number; bonus: number };

export interface Spawn {
  id: EnemyId;
  /** Tick at which it enters. */
  at: number;
}

export interface State {
  seed: number;
  ground: Ground[];
  towers: (Tower | null)[];
  field: Field;
  enemies: Enemy[];
  nextUid: number;
  gold: number;
  lives: number;
  /** Waves sent so far (the current or last wave's number). */
  wave: number;
  active: boolean;
  queue: Spawn[];
  tick: number;
  status: 'playing' | 'won' | 'lost';
  fx: Fx[];
  /** Damage dealt per tower kind, kills, leaks. */
  stats: { dealt: Partial<Record<TowerId, number>>; kills: number; leaked: number };
}

export function newGame(seed: number): State {
  const ground = makeMap(seed);
  return {
    seed,
    ground,
    towers: new Array(N).fill(null),
    field: flowField(ground, new Set()),
    enemies: [],
    nextUid: 1,
    gold: START_GOLD,
    lives: START_LIVES,
    wave: 0,
    active: false,
    queue: [],
    tick: 0,
    status: 'playing',
    fx: [],
    stats: { dealt: {}, kills: 0, leaked: 0 },
  };
}

// ---------------------------------------------------------------- waves

const GAP: Record<EnemyId, number> = { runner: 0.5, grunt: 0.75, swarm: 0.22, brute: 1.5, flyer: 0.85, healer: 1.1, splitter: 1.1, boss: 2 };
// What each enemy is worth in a wave's budget (splitters carry three runners inside).
const COST: Record<EnemyId, number> = { runner: 3, grunt: 4, swarm: 1.2, brute: 14, flyer: 7, healer: 9, splitter: 14, boss: 80 };

/** The enemies of wave w (1-based), in order. Depends only on the seed. */
export function wavePlan(seed: number, w: number): EnemyId[] {
  const rng = new Rng(mixSeed(seed, 900 + w));
  const out: EnemyId[] = [];
  let budget = 16 + w * 7 + w * w * 0.35;
  if (w % 10 === 0) {
    out.push('boss');
    budget -= COST.boss;
  }
  const pool = (Object.keys(ENEMIES) as EnemyId[]).filter((id) => id !== 'boss' && ENEMIES[id].from <= w);
  // Waves have a theme: one or two kinds dominate. Menders support, never lead,
  // and a wave has only a few of them.
  const leads = pool.filter((id) => id !== 'healer');
  const lead = rng.pick(leads);
  const second = rng.pick(leads);
  let menders = 0;
  const maxMenders = 2 + Math.floor(w / 8);
  while (budget > 0) {
    const r = rng.next();
    let id = r < 0.5 ? lead : r < 0.8 ? second : rng.pick(pool);
    if (id === 'healer' && menders++ >= maxMenders) id = lead;
    const n = id === 'swarm' ? 5 : 1;
    for (let k = 0; k < n; k++) out.push(id);
    budget -= COST[id] * n;
  }
  return out;
}

function sendWave(s: State) {
  s.wave++;
  s.active = true;
  let at = s.tick + 15;
  for (const id of wavePlan(s.seed, s.wave)) {
    s.queue.push({ id, at });
    at += Math.round(GAP[id] / TICK);
  }
}

function spawn(s: State, id: EnemyId, cell = PORTAL, t = 0, hpScale = 1): Enemy {
  const def = ENEMIES[id];
  const hp = def.hp * Math.pow(1 + HP_GROWTH, Math.max(0, s.wave - 1)) * hpScale;
  const dist = def.fly ? FLY_DIST : s.field.dist;
  const next = nextCell(dist, cell);
  const e: Enemy = { uid: s.nextUid++, id, hp, maxHp: hp, cell, next: next < 0 ? cell : next, t, x: POS[cell].x, y: POS[cell].y, chill: 0, stun: 0, burn: 0, burnDps: 0, healed: 0, alive: true };
  s.enemies.push(e);
  return e;
}

// ---------------------------------------------------------------- towers

function neighbors(s: State, cell: number): Tower[] {
  const out: Tower[] = [];
  for (const j of ADJ[cell]) if (s.towers[j]) out.push(s.towers[j]!);
  return out;
}

export interface TowerStats {
  dmg: number;
  /** Range in world units. */
  range: number;
  air: boolean;
  shatter: boolean;
  ignite: boolean;
  stun: boolean;
}

/** A tower's effective stats, including its level, ley line and neighbors' gifts. */
export function towerStats(s: State, t: Tower): TowerStats {
  const def = TOWERS[t.id];
  const nb = neighbors(s, t.cell).map((x) => x.id);
  const has = (id: TowerId) => nb.includes(id);
  let dmg = def.dmg * LEVEL_DMG[t.level];
  if (s.ground[t.cell] === 'ley') dmg *= 1.25;
  if (has('beacon')) dmg *= 1.25;
  let range = def.range * LEVEL_RANGE[t.level];
  if (has('mortar') && range > 0) range += 0.5;
  return { dmg, range: range * CELL, air: def.air || has('bolt'), shatter: has('frost'), ignite: has('flame'), stun: has('tesla') };
}

/** How far an enemy still has to go (smaller = more dangerous). */
function remaining(s: State, e: Enemy): number {
  const dist = ENEMIES[e.id].fly ? FLY_DIST : s.field.dist;
  return dist[e.cell] - e.t;
}

function inRange(e: Enemy, x: number, y: number, r: number) {
  return (e.x - x) ** 2 + (e.y - y) ** 2 <= r * r;
}

function damage(s: State, e: Enemy, raw: number, src: TowerId, st: TowerStats | null, perSecond = false) {
  if (!e.alive) return;
  let d = raw;
  if (st?.shatter && e.chill > 0) d *= 1.3;
  const armor = ENEMIES[e.id].armor * (perSecond ? TICK : 1);
  d = Math.max(d * 0.2, d - armor);
  e.hp -= d;
  s.stats.dealt[src] = (s.stats.dealt[src] ?? 0) + d;
  if (st?.ignite && !perSecond) {
    e.burn = BURN_TIME;
    e.burnDps = Math.max(e.burnDps, raw * 0.3);
  }
  if (e.hp <= 0) kill(s, e);
}

function kill(s: State, e: Enemy) {
  e.alive = false;
  const def = ENEMIES[e.id];
  s.gold += def.bounty;
  s.stats.kills++;
  s.fx.push({ type: 'die', x: e.x, y: e.y, id: e.id, gold: def.bounty });
  if (def.split) for (let k = 0; k < def.split; k++) spawn(s, 'runner', e.cell, Math.max(0, e.t - k * 0.15), 0.8);
}

function fire(s: State, t: Tower) {
  const def = TOWERS[t.id];
  if (def.id === 'beacon') return;
  const st = towerStats(s, t);
  const { x, y } = POS[t.cell];
  const targets = s.enemies.filter((e) => e.alive && (st.air || !ENEMIES[e.id].fly) && inRange(e, x, y, st.range));

  // Auras act every tick.
  if (def.rate === 0) {
    for (const e of targets) {
      if (def.id === 'frost') e.chill = Math.max(e.chill, 0.3);
      damage(s, e, st.dmg * TICK, t.id, st, true);
    }
    return;
  }
  t.cd -= TICK;
  if (t.cd > 0 || !targets.length) return;
  t.cd = def.rate;
  let target = targets[0];
  for (const e of targets) if (remaining(s, e) < remaining(s, target)) target = e;
  const hit = (e: Enemy, dmg: number) => {
    t.hits++;
    if (st.stun && t.hits % 4 === 0) e.stun = STUN_TIME;
    damage(s, e, dmg, t.id, st);
  };
  if (def.id === 'bolt') {
    s.fx.push({ type: 'shot', from: t.cell, x: target.x, y: target.y, tower: t.id });
    hit(target, st.dmg);
  } else if (def.id === 'mortar') {
    const r = 0.9 * CELL;
    s.fx.push({ type: 'burst', x: target.x, y: target.y, r });
    const tx = target.x;
    const ty = target.y;
    for (const e of s.enemies) if (e.alive && !ENEMIES[e.id].fly && inRange(e, tx, ty, r)) hit(e, st.dmg);
  } else if (def.id === 'tesla') {
    const pts = [target.x, target.y];
    const seen = new Set([target.uid]);
    let cur = target;
    hit(cur, st.dmg);
    for (let k = 0; k < 2; k++) {
      let best: Enemy | null = null;
      for (const e of s.enemies) {
        if (!e.alive || seen.has(e.uid) || (!st.air && ENEMIES[e.id].fly) || !inRange(e, cur.x, cur.y, 1.6 * CELL)) continue;
        if (!best || remaining(s, e) < remaining(s, best)) best = e;
      }
      if (!best) break;
      seen.add(best.uid);
      pts.push(best.x, best.y);
      hit(best, st.dmg * 0.8);
      cur = best;
    }
    s.fx.push({ type: 'chain', from: t.cell, pts });
  }
}

// ---------------------------------------------------------------- building

export function blockedSet(s: State, extra = -1): Set<number> {
  const b = new Set<number>();
  for (let i = 0; i < N; i++) if (s.towers[i]) b.add(i);
  if (extra >= 0) b.add(extra);
  return b;
}

/** Why a tower can't go here, or null if it can. */
export function buildError(s: State, cell: number, id: TowerId): string | null {
  if (s.status !== 'playing') return 'The game is over';
  const g = s.ground[cell];
  if (g === 'rock') return 'Solid rock';
  if (g === 'portal' || g === 'core') return 'Keep this clear';
  if (s.towers[cell]) return 'Already built';
  if (s.gold < TOWERS[id].cost) return 'Not enough gold';
  if (s.enemies.some((e) => e.alive && !ENEMIES[e.id].fly && (e.cell === cell || e.next === cell))) return 'An enemy is in the way';
  const f = flowField(s.ground, blockedSet(s, cell));
  if (f.dist[PORTAL] === Infinity) return 'That would seal the path';
  if (s.enemies.some((e) => e.alive && !ENEMIES[e.id].fly && f.dist[e.cell] === Infinity)) return 'That would trap an enemy';
  return null;
}

function reroute(s: State) {
  s.field = flowField(s.ground, blockedSet(s));
  for (const e of s.enemies) {
    if (!e.alive || ENEMIES[e.id].fly) continue;
    const n = nextCell(s.field.dist, e.cell);
    // Enemies that haven't committed to their step turn toward the new path.
    if (e.t < 0.5 && n >= 0 && n !== e.next) {
      e.next = n;
      e.t = 0;
    }
  }
}

export type Action = { t: 'build'; cell: number; tower: TowerId } | { t: 'up'; cell: number } | { t: 'sell'; cell: number } | { t: 'wave' };

/** Applies a player action at the current tick. Returns false if illegal. */
export function act(s: State, a: Action): boolean {
  if (s.status !== 'playing') return false;
  switch (a.t) {
    case 'build': {
      if (buildError(s, a.cell, a.tower)) return false;
      const cost = TOWERS[a.tower].cost;
      s.gold -= cost;
      s.towers[a.cell] = { cell: a.cell, id: a.tower, level: 1, cd: 0, spent: cost, hits: 0 };
      reroute(s);
      return true;
    }
    case 'up': {
      const t = s.towers[a.cell];
      if (!t || t.level >= MAX_LEVEL) return false;
      const cost = upgradeCost(t.id, t.level);
      if (s.gold < cost) return false;
      s.gold -= cost;
      t.spent += cost;
      t.level++;
      return true;
    }
    case 'sell': {
      const t = s.towers[a.cell];
      if (!t) return false;
      s.gold += Math.floor(t.spent * SELL_BACK);
      s.towers[a.cell] = null;
      reroute(s);
      return true;
    }
    case 'wave': {
      if (s.active || s.wave >= WAVES) return false;
      sendWave(s);
      return true;
    }
  }
}

// ---------------------------------------------------------------- the tick

export function step(s: State): void {
  if (s.status !== 'playing') return;
  s.tick++;

  // Arrivals.
  while (s.queue.length && s.queue[0].at <= s.tick) spawn(s, s.queue.shift()!.id);

  // Towers.
  for (const t of s.towers) if (t) fire(s, t);

  // Heals gathered last pass land now (the strongest one only).
  for (const e of s.enemies) {
    if (e.healed > 0 && e.alive) e.hp = Math.min(e.maxHp, e.hp + e.healed);
    e.healed = 0;
  }
  // Enemies: statuses, healing, movement.
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const def = ENEMIES[e.id];
    if (e.burn > 0) {
      e.burn -= TICK;
      e.hp -= e.burnDps * TICK;
      s.stats.dealt.flame = (s.stats.dealt.flame ?? 0) + e.burnDps * TICK;
      if (e.hp <= 0) {
        kill(s, e);
        continue;
      }
    }
    if (def.heal) {
      const amount = def.heal * TICK * (1 + s.wave * 0.08);
      for (const o of s.enemies) {
        // Heals don't stack (each enemy takes the strongest), and menders can't mend each other.
        if (o !== e && o.alive && !ENEMIES[o.id].heal && inRange(o, e.x, e.y, 1.5 * CELL)) o.healed = Math.max(o.healed, amount);
      }
    }
    if (e.stun > 0) {
      e.stun -= TICK;
      continue;
    }
    const speed = def.speed * (e.chill > 0 ? CHILL : 1);
    if (e.chill > 0) e.chill -= TICK;
    e.t += speed * TICK;
    while (e.t >= 1 && e.alive) {
      e.t -= 1;
      e.cell = e.next;
      if (e.cell === CORE) {
        e.alive = false;
        s.lives -= def.leak;
        s.stats.leaked += def.leak;
        s.fx.push({ type: 'leak', lives: def.leak });
        break;
      }
      const n = nextCell(def.fly ? FLY_DIST : s.field.dist, e.cell);
      e.next = n < 0 ? CORE : n;
    }
    const a = POS[e.cell];
    const b = POS[e.next];
    e.x = a.x + (b.x - a.x) * e.t;
    e.y = a.y + (b.y - a.y) * e.t;
  }
  s.enemies = s.enemies.filter((e) => e.alive);

  if (s.lives <= 0) {
    s.lives = 0;
    s.status = 'lost';
    return;
  }
  if (s.active && !s.queue.length && !s.enemies.length) {
    s.active = false;
    const bonus = 18 + s.wave * 3 + Math.min(25, Math.floor(s.gold * 0.05));
    s.gold += bonus;
    s.fx.push({ type: 'wave', wave: s.wave, bonus });
    if (s.wave >= WAVES) s.status = 'won';
  }
}
