// Enemies, waves and the auto-battle. Enemies march down the lane (y 0 → 1)
// toward the tower; each loom row casts whenever its cooldown is ready.

import { Rng, mixSeed } from '../../shared/rng';
import { MOD, compileRow } from './runes';
import type { Battle, Element, Enemy, EnemyKind, GameState, Spell } from './types';

export const DT = 1 / 60;
/** The lane is taller than it is wide: y distances count this much more. */
export const ASPECT = 1.6;
export const TOWER = { x: 0.5, y: 1 };
export const WAVES = 15;
/** Seconds a frost hit keeps its slow. */
export const SLOW_TIME = 1.5;

export interface EnemyDef {
  name: string;
  hp: number;
  speed: number;
  armor: number;
  shield: number;
  leak: number;
  gold: number;
  /** Damage multipliers by element (missing = 1). */
  resist: Partial<Record<Element, number>>;
  flying: boolean;
  /** Can't be slowed. */
  steady: boolean;
  r: number;
  hue: number;
  blurb: string;
}

export const ENEMIES: Record<EnemyKind, EnemyDef> = {
  imp: { name: 'Imp', hp: 20, speed: 0.085, armor: 0, shield: 0, leak: 1, gold: 0, resist: {}, flying: false, steady: false, r: 0.028, hue: 0, blurb: 'Weak, quick, many.' },
  knight: { name: 'Knight', hp: 55, speed: 0.06, armor: 3, shield: 0, leak: 2, gold: 1, resist: {}, flying: false, steady: false, r: 0.036, hue: 30, blurb: 'Armor shrugs off small hits: use big ones.' },
  wisp: { name: 'Wisp', hp: 28, speed: 0.12, armor: 0, shield: 0, leak: 1, gold: 0, resist: { frost: 0.25, arcane: 0.7 }, flying: true, steady: false, r: 0.026, hue: 190, blurb: 'Flies over novas. Frost barely touches it.' },
  golem: { name: 'Golem', hp: 150, speed: 0.04, armor: 6, shield: 0, leak: 3, gold: 1, resist: { storm: 0.5 }, flying: false, steady: true, r: 0.05, hue: 35, blurb: 'Huge armor, unstoppable. Storm is weak against it.' },
  splitter: { name: 'Splitter', hp: 45, speed: 0.065, armor: 0, shield: 0, leak: 2, gold: 0, resist: {}, flying: false, steady: false, r: 0.036, hue: 300, blurb: 'Bursts into two imps.' },
  mender: { name: 'Mender', hp: 40, speed: 0.06, armor: 1, shield: 0, leak: 1, gold: 1, resist: { arcane: 0.6 }, flying: false, steady: false, r: 0.032, hue: 130, blurb: 'Heals everything near it. Kill it first.' },
  drake: { name: 'Drake', hp: 85, speed: 0.075, armor: 2, shield: 0, leak: 3, gold: 1, resist: { fire: 0 }, flying: true, steady: false, r: 0.042, hue: 15, blurb: 'Flies, and fire cannot hurt it.' },
  warden: { name: 'Warden', hp: 1000, speed: 0.03, armor: 4, shield: 250, leak: 10, gold: 6, resist: {}, flying: false, steady: true, r: 0.075, hue: 220, blurb: 'A shielded boss. Break the shield, then the rest.' },
  colossus: { name: 'Colossus', hp: 2300, speed: 0.022, armor: 9, shield: 0, leak: 15, gold: 8, resist: { frost: 0.5 }, flying: false, steady: true, r: 0.09, hue: 40, blurb: 'Massive armor. Only heavy hits get through.' },
  lich: { name: 'Lich', hp: 4000, speed: 0.025, armor: 4, shield: 300, leak: 20, gold: 0, resist: { arcane: 0.5 }, flying: false, steady: true, r: 0.085, hue: 280, blurb: 'Summons imps as it comes. The final foe.' },
};

const UNLOCK: [EnemyKind, number, number][] = [
  // kind, first wave, budget cost
  ['imp', 1, 1],
  ['knight', 2, 3],
  ['wisp', 3, 2],
  ['splitter', 4, 3],
  ['mender', 6, 4],
  ['golem', 7, 6],
  ['drake', 9, 5],
];

const BOSSES: Record<number, EnemyKind> = { 5: 'warden', 10: 'colossus', 15: 'lich' };

/** Seconds over which a wave's foes arrive (battles run a little longer). */
export function waveWindow(wave: number): number {
  return WAVE_TIME.base + WAVE_TIME.perWave * wave;
}

export const WAVE_TIME = { base: 28, perWave: 1.9 };
/** Wave budget: what the foes of a wave "cost" in total (see UNLOCK). */
export function waveBudget(wave: number): number {
  return Math.round(BUDGET.base + BUDGET.perWave * wave + BUDGET.square * wave * wave);
}
export const BUDGET = { base: 8, perWave: 6, square: 0.4 };

/** The wave's spawn list: [time, kind, x]. Deterministic per seed and wave. */
export function waveQueue(seed: number, wave: number): [number, EnemyKind, number][] {
  const rng = new Rng(mixSeed(seed, 900 + wave));
  let budget = waveBudget(wave);
  const kinds = UNLOCK.filter(([, w]) => w <= wave);
  // Pick the groups first, then spread them over the wave's window, a little
  // denser toward the end.
  const groups: [EnemyKind, number][] = [];
  while (budget > 0) {
    const options = kinds.filter(([, , c]) => c <= budget);
    if (!options.length) break;
    const [kind, , cost] = options[rng.int(0, options.length - 1)];
    // Imps come in little packs.
    const n = kind === 'imp' ? Math.min(rng.int(2, 4), budget) : 1;
    groups.push([kind, n]);
    budget -= cost * n;
  }
  const W = waveWindow(wave);
  const q: [number, EnemyKind, number][] = [];
  groups.forEach(([kind, n], i) => {
    const t = 0.5 + W * Math.pow((i + 0.3 * rng.next()) / groups.length, 0.85);
    for (let j = 0; j < n; j++) q.push([t + j * (kind === 'imp' ? 0.35 : 0.8), kind, 0.12 + rng.next() * 0.76]);
  });
  const boss = BOSSES[wave];
  if (boss) q.push([W * 0.3, boss, 0.5]);
  return q.sort((a, b) => a[0] - b[0]);
}

export function newBattle(s: GameState): Battle {
  return {
    t: 0,
    enemies: [],
    projectiles: [],
    queue: waveQueue(s.seed, s.wave),
    cooldowns: [0.4, 0.7, 1.0],
    echoQueue: [],
    nextId: 1,
    goldEarned: 0,
    kills: 0,
    leaked: 0,
    fx: [],
    over: false,
  };
}

export const isBoss = (kind: EnemyKind) => kind === 'warden' || kind === 'colossus' || kind === 'lich';

/** Regular foes gain this fraction of their base HP every wave. */
export const HP_GROWTH = 0.22;

/** Max HP of a foe on a given wave: regular foes toughen every wave, bosses don't. */
export function enemyHp(kind: EnemyKind, wave: number): number {
  return ENEMIES[kind].hp * (isBoss(kind) ? 1 : 1 + HP_GROWTH * (wave - 1));
}

function spawn(s: GameState, b: Battle, kind: EnemyKind, x: number, y = 0): Enemy {
  const d = ENEMIES[kind];
  const hp = enemyHp(kind, s.wave);
  const e: Enemy = { id: b.nextId++, kind, x, y, hp, maxHp: hp, shield: d.shield, speed: d.speed, slow: 0, slowT: 0, burn: 0, burnT: 0, alive: true, flash: 0 };
  b.enemies.push(e);
  return e;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = (ay - by) * ASPECT;
  return Math.sqrt(dx * dx + dy * dy);
}

function battleRng(s: GameState, b: Battle, salt: number): number {
  // Deterministic per wave, tick and kill.
  return new Rng(mixSeed(mixSeed(s.seed, salt), s.wave * 100000 + Math.round(b.t * 60) * 7 + b.kills)).next();
}

/** Apply a hit. Returns damage dealt. */
function hit(s: GameState, b: Battle, e: Enemy, sp: Spell, dmg: number, chainLeft = sp.chain): number {
  if (!e.alive) return 0;
  const d = ENEMIES[e.kind];
  let amount = dmg * (d.resist[sp.element] ?? 1);
  amount = Math.max(amount > 0 ? 1 : 0, amount - Math.max(0, d.armor - sp.shred));
  if (e.shield > 0) {
    const absorbed = Math.min(e.shield, amount);
    e.shield -= absorbed;
    amount -= absorbed;
  }
  e.hp -= amount;
  e.flash = 0.1;
  if (sp.slow > 0 && !d.steady && !(d.flying && sp.element === 'frost' && (d.resist.frost ?? 1) < 0.5)) {
    e.slow = Math.max(e.slow, sp.slow);
    e.slowT = SLOW_TIME;
  }
  if (sp.burn > 0 && (d.resist.fire ?? 1) > 0) {
    e.burn = Math.max(e.burn, sp.burn);
    e.burnT = 3;
  }
  if (b.fx.length < 150) b.fx.push({ type: 'hit', x: e.x, y: e.y, element: sp.element, dmg: amount });
  if (e.hp <= 0) die(s, b, e, sp);
  // Storm arcs to the nearest unhit foes.
  if (chainLeft > 0) {
    const pts = [e.x, e.y];
    let from = e;
    const done = new Set([e.id]);
    for (let i = 0; i < chainLeft; i++) {
      let best: Enemy | null = null;
      let bd = 0.3;
      for (const o of b.enemies) {
        if (!o.alive || done.has(o.id)) continue;
        const dd = dist(o.x, o.y, from.x, from.y);
        if (dd < bd) {
          bd = dd;
          best = o;
        }
      }
      if (!best) break;
      done.add(best.id);
      pts.push(best.x, best.y);
      hit(s, b, best, sp, dmg * MOD.stormDmg, 0);
      from = best;
    }
    if (pts.length > 2) b.fx.push({ type: 'chain', pts, element: sp.element });
  }
  return amount;
}

function die(s: GameState, b: Battle, e: Enemy, sp: Spell | null): void {
  if (!e.alive) return;
  e.alive = false;
  b.kills++;
  const d = ENEMIES[e.kind];
  let gold = d.gold;
  if (sp && sp.gild > 0 && battleRng(s, b, 1) < sp.gild) gold++;
  if (sp && sp.leech > 0 && battleRng(s, b, 2) < sp.leech) s.hp = Math.min(s.maxHp, s.hp + 1);
  b.goldEarned += gold;
  b.fx.push({ type: 'kill', x: e.x, y: e.y, kind: e.kind, gold });
  if (e.kind === 'splitter') for (const dx of [-0.04, 0.04]) spawn(s, b, 'imp', Math.min(0.95, Math.max(0.05, e.x + dx)), e.y);
}

/** The enemy closest to the tower. */
function front(b: Battle): Enemy | null {
  let best: Enemy | null = null;
  for (const e of b.enemies) if (e.alive && e.y > 0.02 && (!best || e.y > best.y)) best = e;
  return best;
}

const novaRadius = (sp: Spell) => sp.area * (1 + (sp.count - 1) * 0.35);
const inNova = (e: Enemy, r: number) => e.alive && !ENEMIES[e.kind].flying && dist(e.x, e.y, TOWER.x, TOWER.y) < r + ENEMIES[e.kind].r;

/** Is there something for this spell to hit? Novas wait for foes in reach. */
function hasTarget(b: Battle, sp: Spell): boolean {
  if (sp.caster !== 'nova') return !!front(b);
  const r = novaRadius(sp);
  return b.enemies.some((e) => inNova(e, r));
}

function cast(s: GameState, b: Battle, row: number, sp: Spell): void {
  const target = front(b);
  if (!target) return;
  b.fx.push({ type: 'cast', row });
  switch (sp.caster) {
    case 'bolt':
    case 'orb': {
      const homing = sp.caster === 'orb';
      const speed = homing ? 0.55 : 1.25;
      for (let i = 0; i < sp.count; i++) {
        const spread = (i - (sp.count - 1) / 2) * 0.12;
        let dx = target.x - TOWER.x;
        let dy = (target.y - TOWER.y) * ASPECT;
        const m = Math.hypot(dx, dy) || 1;
        dx /= m;
        dy /= m;
        const c = Math.cos(spread);
        const sn = Math.sin(spread);
        const vx = (dx * c - dy * sn) * speed;
        const vy = ((dx * sn + dy * c) * speed) / ASPECT;
        b.projectiles.push({ row, x: TOWER.x, y: TOWER.y - 0.02, vx, vy, spell: sp, pierce: sp.pierce, hit: [], life: homing ? 4 : 2, homing, alive: true });
      }
      break;
    }
    case 'beam': {
      // Each extra count adds a parallel beam on the next foe's column.
      const cols = [target.x];
      const others = b.enemies.filter((e) => e.alive && e !== target).sort((a, c) => c.y - a.y);
      for (let i = 1; i < sp.count && others[i - 1]; i++) cols.push(others[i - 1].x);
      for (const x of cols) {
        b.fx.push({ type: 'beam', x, element: sp.element });
        let chain = sp.chain;
        for (const e of b.enemies)
          if (e.alive && Math.abs(e.x - x) < sp.area + ENEMIES[e.kind].r) {
            hit(s, b, e, sp, sp.dmg, chain);
            chain = 0;
          }
      }
      break;
    }
    case 'nova': {
      const r = novaRadius(sp);
      b.fx.push({ type: 'nova', r, element: sp.element });
      let chain = sp.chain;
      for (const e of b.enemies)
        if (inNova(e, r)) {
          hit(s, b, e, sp, sp.dmg, chain);
          chain = 0;
        }
      break;
    }
    case 'rain': {
      const alive = b.enemies.filter((e) => e.alive && e.y > 0.02);
      for (let i = 0; i < sp.count && alive.length; i++) {
        const pick = alive[Math.floor(new Rng(mixSeed(s.seed, Math.round(b.t * 60) * 1000 + i * 31 + row)).next() * alive.length)];
        b.fx.push({ type: 'strike', x: pick.x, y: pick.y, element: sp.element });
        let chain = sp.chain;
        for (const e of b.enemies)
          if (e.alive && dist(e.x, e.y, pick.x, pick.y) < sp.area + ENEMIES[e.kind].r) {
            hit(s, b, e, sp, sp.dmg, chain);
            chain = 0;
          }
      }
      break;
    }
  }
}

// The loom can't change mid-battle (moves are build-phase only), so each
// battle compiles its rows once. A cache on the side, not state: it is rebuilt
// identically after a reload.
const compiled = new WeakMap<Battle, (Spell | null)[]>();
function rowSpells(s: GameState, b: Battle): (Spell | null)[] {
  let c = compiled.get(b);
  if (!c) {
    c = s.loom.map((r) => compileRow(r));
    compiled.set(b, c);
  }
  return c;
}

export function stepBattle(s: GameState, b: Battle): void {
  if (b.over) return;
  // Effects are per step: the view drains them after each tick.
  b.fx.length = 0;
  const dt = DT;
  b.t += dt;
  while (b.queue.length && b.queue[0][0] <= b.t) {
    const [, kind, x] = b.queue.shift()!;
    spawn(s, b, kind, x);
  }
  // Enemies.
  for (const e of b.enemies) {
    if (!e.alive) continue;
    const d = ENEMIES[e.kind];
    if (e.slowT > 0) e.slowT -= dt;
    else e.slow = 0;
    if (e.burnT > 0) {
      e.burnT -= dt;
      e.hp -= e.burn * dt;
      if (e.hp <= 0) die(s, b, e, null);
      if (!e.alive) continue;
    }
    if (e.flash > 0) e.flash -= dt;
    e.y += e.speed * (1 - e.slow) * dt;
    // Menders heal neighbors; the Lich raises imps.
    if (e.kind === 'mender')
      for (const o of b.enemies) if (o.alive && o !== e && dist(o.x, o.y, e.x, e.y) < 0.14) o.hp = Math.min(o.maxHp, o.hp + 5 * dt);
    if (e.kind === 'lich' && Math.floor(b.t / 3) !== Math.floor((b.t - dt) / 3))
      for (const dx of [-0.08, 0.08]) spawn(s, b, 'imp', Math.min(0.95, Math.max(0.05, e.x + dx)), e.y + 0.02);
    if (e.y >= 1) {
      e.alive = false;
      b.leaked += d.leak;
      s.hp -= d.leak;
      b.fx.push({ type: 'leak', dmg: d.leak });
    }
  }
  // Spells.
  const spells = rowSpells(s, b);
  for (let row = 0; row < 3; row++) {
    const sp = spells[row];
    if (!sp) continue;
    b.cooldowns[row] -= dt;
    if (b.cooldowns[row] > 0 || !hasTarget(b, sp)) continue;
    b.cooldowns[row] = sp.cooldown;
    cast(s, b, row, sp);
    sp.echoes.forEach((echo, i) => b.echoQueue.push([b.t + 0.22 * (i + 1), row, echo]));
  }
  for (let i = b.echoQueue.length - 1; i >= 0; i--) {
    const [t, row, sp] = b.echoQueue[i];
    if (t > b.t) continue;
    b.echoQueue.splice(i, 1);
    cast(s, b, row, sp);
  }
  // Projectiles.
  for (const p of b.projectiles) {
    if (!p.alive) continue;
    p.life -= dt;
    if (p.life <= 0 || p.y < -0.05 || p.x < -0.05 || p.x > 1.05) {
      p.alive = false;
      continue;
    }
    if (p.homing) {
      let best: Enemy | null = null;
      let bd = 9;
      for (const e of b.enemies) {
        if (!e.alive || p.hit.includes(e.id)) continue;
        const dd = dist(e.x, e.y, p.x, p.y);
        if (dd < bd) {
          bd = dd;
          best = e;
        }
      }
      if (best) {
        const sp = Math.hypot(p.vx, p.vy * ASPECT);
        const dx = best.x - p.x;
        const dy = (best.y - p.y) * ASPECT;
        const m = Math.hypot(dx, dy) || 1;
        p.vx += ((dx / m) * sp - p.vx) * Math.min(1, dt * 4);
        p.vy += (((dy / m) * sp) / ASPECT - p.vy) * Math.min(1, dt * 4);
      }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    for (const e of b.enemies) {
      if (!e.alive || p.hit.includes(e.id)) continue;
      if (dist(e.x, e.y, p.x, p.y) > ENEMIES[e.kind].r + p.spell.area) continue;
      // Storm arcs from a projectile's first hit only.
      hit(s, b, e, p.spell, p.spell.dmg, p.hit.length ? 0 : p.spell.chain);
      p.hit.push(e.id);
      p.pierce--;
      if (p.pierce <= 0) {
        p.alive = false;
        break;
      }
    }
  }
  if (b.enemies.some((e) => !e.alive)) b.enemies = b.enemies.filter((e) => e.alive);
  if (b.projectiles.some((p) => !p.alive)) b.projectiles = b.projectiles.filter((p) => p.alive);
  if (s.hp <= 0 || (b.queue.length === 0 && b.enemies.length === 0)) b.over = true;
}
