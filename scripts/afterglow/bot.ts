// An Afterglow pilot for balance probes. Every few ticks it scores a ring of
// candidate headings by looking a short way ahead (enemies closing in,
// bullets in flight, telegraphed dashes/blasts/slams) against the gems and
// pickups it could reach, and picks upgrades by a priority score (or at
// random with policy 'random'). It also logs what hurt it and run milestones.
import { Rng, mixSeed } from '../../src/shared/rng';
import {
  BLOAT_BLAST,
  BLOAT_SWELL,
  DT,
  PLAYER_R,
  WEAPONS,
  choose,
  createWorld,
  step,
  takeChest,
  waiting,
  xpToNext,
  type Choice,
  type EnemyKind,
  type PassiveId,
  type WeaponId,
  type World,
} from '../../src/afterglow/core';

export type Policy = 'smart' | 'random' | 'greedy';

export interface BotOptions {
  policy?: Policy;
  /** Replace the character's starting weapon. */
  weapon?: WeaponId;
  /** Ticks between movement decisions (reaction time). */
  think?: number;
  /** Called after every step (for traces). */
  onStep?: (w: World) => void;
}

// ---------- upgrade policy ----------

/** How much the bot values each passive in general (before evolution needs). */
const PASSIVE_VALUE: Record<PassiveId, number> = {
  might: 34,
  haste: 33,
  multicast: 33,
  vitality: 30,
  reach: 28,
  regen: 27,
  magnet: 26,
  duration: 22,
  velocity: 20,
  swift: 24,
};

function score(w: World, c: Choice): number {
  if (c.kind === 'gold') return 0;
  if (c.kind === 'weapon') {
    const owned = w.weapons.find((ws) => ws.id === c.id);
    if (owned) {
      // Push weapons to max, the first (starting) weapon hardest.
      const main = w.weapons[0] === owned ? 6 : 0;
      return 50 + main + c.level;
    }
    if (w.weapons.length < 3) return 52;
    return w.weapons.length < 4 ? 40 : 8;
  }
  const id = c.id as PassiveId;
  // Passives that unlock an evolution for a held weapon rank high (first rank matters most).
  const evo = w.weapons.some((ws) => WEAPONS[ws.id].evolvesWith === id && WEAPONS[ws.id].evolvesInto);
  if (evo && c.level === 1) return 49;
  let v = PASSIVE_VALUE[id] + (evo ? 6 : 0);
  if (id === 'magnet' && w.time > 360) v -= 10;
  if (id === 'vitality' || id === 'regen') v += w.player.hp < w.stats.maxHp * 0.5 ? 6 : 0;
  return v + 2 * c.level;
}

/** Greedy: the original simple policy (kept for comparison). */
function scoreGreedy(w: World, c: Choice): number {
  if (c.kind === 'gold') return 0;
  if (c.kind === 'weapon') {
    const owned = w.weapons.some((ws) => ws.id === c.id);
    return owned ? 50 + c.level : w.weapons.length < 4 ? 45 : 10;
  }
  const evo = w.weapons.some((ws) => WEAPONS[ws.id].evolvesWith === c.id);
  return evo ? 48 : c.id === 'vitality' || c.id === 'might' || c.id === 'haste' ? 30 : 20;
}

function pickChoice(w: World, policy: Policy, rng: Rng): number {
  if (policy === 'random') return Math.floor(rng.next() * w.choices.length);
  const f = policy === 'greedy' ? scoreGreedy : score;
  let best = 0;
  w.choices.forEach((c, i) => {
    if (f(w, c) > f(w, w.choices[best])) best = i;
  });
  return best;
}

// ---------- movement ----------

const DIRS = 16;
/** What a portrait phone shows around the player (world units, half-extents). */
const VIEW_X = 205;
const VIEW_Y = 380;
const onScreen = (p: { x: number; y: number }, o: { x: number; y: number }) => Math.abs(o.x - p.x) < VIEW_X && Math.abs(o.y - p.y) < VIEW_Y;
/** Reaction time to a newly fired bullet, seconds. */
export let REACT = Number(process.env.AG_REACT ?? 0.2);
const firstSeen = new WeakMap<object, number>();
function noticed(w: World, b: object): boolean {
  const t = firstSeen.get(b);
  if (t === undefined) {
    firstSeen.set(b, w.time);
    return REACT <= 0;
  }
  return w.time - t >= REACT;
}
export let LURE = Number(process.env.AG_LURE ?? 2);
export let LURE_CAP = Number(process.env.AG_LCAP ?? 40);
export let SOFT = Number(process.env.AG_SOFT ?? 70);
export let CROWD = Number(process.env.AG_CROWD ?? 2.2);
const HORIZON = [0.12, 0.3, 0.55];

/** Score a heading (dx, dy unit or 0) by short look-ahead; lower is better. */
function cost(w: World, dx: number, dy: number): number {
  const p = w.player;
  const sp = w.stats.speed;
  let c = 0;
  const near: World['enemies'] = [];
  w.grid.query(p.x, p.y, 300, (e) => {
    if (onScreen(p, e)) near.push(e);
  });
  for (const t of HORIZON) {
    const px = p.x + dx * sp * t;
    const py = p.y + dy * sp * t;
    const wt = t === HORIZON[0] ? 1.4 : 1;
    for (const e of near) {
      let ex = e.x;
      let ey = e.y;
      let reach = e.r + PLAYER_R;
      if (e.kind === 'dart' && e.phase >= 1) {
        // Aiming or dashing along (ax, ay).
        const run = e.phase === 1 ? Math.max(0, t - 0.0) * 310 : 310 * t;
        ex += e.ax * Math.min(run, 140);
        ey += e.ay * Math.min(run, 140);
        reach += 8;
      } else if (e.kind === 'bloater' && e.phase === 1) {
        // Swelling: treat the whole blast as solid, more so near the end.
        reach = 78 + 12 + (e.t + t > BLOAT_SWELL - 0.2 ? 12 : 4);
      } else if (e.kind === 'prism' && e.phase >= 1) {
        const run = 420 * Math.min(0.65, t);
        ex += Math.cos(e.ay) * run;
        ey += Math.sin(e.ay) * run;
        reach += 10;
      } else {
        // Chases toward where we will be.
        const ddx = px - e.x;
        const ddy = py - e.y;
        const dd = Math.sqrt(ddx * ddx + ddy * ddy) || 1;
        const mv = Math.min(dd, e.speed * e.slow * t);
        ex += (ddx / dd) * mv;
        ey += (ddy / dd) * mv;
      }
      const gap = Math.sqrt((px - ex) ** 2 + (py - ey) ** 2) - reach;
      const threat = e.dmg + 4;
      if (gap < 3) c += threat * 6 * wt;
      else if (gap < SOFT) c += (threat * 2 * wt * (SOFT - gap)) / SOFT / (gap + 12);
      if (e.kind === 'eclipse' && e.ay === 1) {
        // Slam marked at (sx, sy): be out of it before it lands.
        const ds = Math.sqrt((px - e.sx) ** 2 + (py - e.sy) ** 2);
        if (ds < 172) c += 400 * (1 + (172 - ds) / 50);
      }
    }
  }
  // Bullets: closest approach over the whole horizon (sampling would miss
  // fast crossings between sample times).
  const T = HORIZON[HORIZON.length - 1];
  const vpx = dx * sp;
  const vpy = dy * sp;
  for (const b of w.bullets) {
    const rx = b.x - p.x;
    const ry = b.y - p.y;
    if (rx * rx + ry * ry > 260 * 260 || !onScreen(p, b) || !noticed(w, b)) continue;
    const vx = b.vx - vpx;
    const vy = b.vy - vpy;
    const v2 = vx * vx + vy * vy || 1;
    const tc = Math.max(0, Math.min(T, -(rx * vx + ry * vy) / v2));
    const gap = Math.sqrt((rx + vx * tc) ** 2 + (ry + vy * tc) ** 2) - (b.r + PLAYER_R - 3);
    const soon = 1.5 - tc / T;
    if (gap < 5) c += b.dmg * 14 * soon;
    else if (gap < 40) c += (b.dmg * 3 * soon) / (gap + 4);
  }
  return c;
}

function eclipseSlam(w: World): { x: number; y: number } | null {
  for (const e of w.enemies) if (e.kind === 'eclipse' && e.ay === 1) return { x: e.sx, y: e.sy };
  return null;
}

/** Where to go for pickups: a reward per heading. */
function lure(w: World, dx: number, dy: number): number {
  const p = w.player;
  const t = 0.55;
  const px = p.x + dx * w.stats.speed * t;
  const py = p.y + dy * w.stats.speed * t;
  let r = 0;
  for (const g of w.pickups) {
    if (!g.alive || g.pulled) continue;
    const d0 = Math.sqrt((g.x - p.x) ** 2 + (g.y - p.y) ** 2);
    if (d0 > 650) continue;
    const d1 = Math.sqrt((g.x - px) ** 2 + (g.y - py) ** 2);
    let v = g.kind === 'gem' ? Math.min(30, 1 + Math.sqrt(g.value)) : g.kind === 'chest' ? 60 : g.kind === 'heart' ? (p.hp < w.stats.maxHp * 0.7 ? 40 : 0) : g.kind === 'magnet' ? 25 : g.kind === 'bomb' ? 15 : 2;
    // Only progress counts, so gems on every side don't cancel out.
    r += (v * Math.max(0, d0 - d1)) / (d0 + 60);
  }
  // Greed has limits: a big gem field shouldn't outweigh a blast.
  return Math.min(r, LURE_CAP);
}

/** Gentle bias toward open space: away from the crowd's center of mass. */
function crowd(w: World, dx: number, dy: number): number {
  const p = w.player;
  let cx = 0;
  let cy = 0;
  w.grid.query(p.x, p.y, 420, (e) => {
    const ex = e.x - p.x;
    const ey = e.y - p.y;
    const d = Math.sqrt(ex * ex + ey * ey) || 1;
    if (d > 420) return;
    const k = (e.dmg + 4) / (d + 40);
    cx += (ex / d) * k;
    cy += (ey / d) * k;
  });
  // Heading into the crowd costs; away or around it is equally fine.
  return Math.max(0, cx * dx + cy * dy);
}

export function botInput(w: World): { x: number; y: number } {
  let best = { x: 0, y: 0 };
  let bestScore = Infinity;
  const lureK = LURE;
  const slam = eclipseSlam(w);
  for (let i = -1; i < DIRS; i++) {
    const a = (i / DIRS) * Math.PI * 2 + 0.1;
    const dx = i < 0 ? 0 : Math.cos(a);
    const dy = i < 0 ? 0 : Math.sin(a);
    let s = cost(w, dx, dy) - lureK * lure(w, dx, dy) + CROWD * crowd(w, dx, dy);
    if (slam) {
      // Escape the slam directly if inside it.
      const ox = w.player.x - slam.x;
      const oy = w.player.y - slam.y;
      const od = Math.sqrt(ox * ox + oy * oy) || 1;
      if (od < 172) s -= 60 * ((ox / od) * dx + (oy / od) * dy);
    }
    if (s < bestScore) {
      bestScore = s;
      best = { x: dx, y: dy };
    }
  }
  return best;
}

// ---------- damage attribution ----------

/** Name the likely source of a hit of `amount` (pre-armor) this step. */
function hurtSource(w: World, before: { bullets: { dmg: number }[]; touching: { kind: EnemyKind; dmg: number; elite: boolean }[] }, amount: number): string {
  const armor = w.stats.armor;
  const match = (d: number) => Math.abs(Math.max(1, d - armor) - amount) < 1e-6;
  const bossKind = w.enemies.find((e) => e.kind === 'eclipse' || e.kind === 'prism')?.kind;
  for (const t of before.touching) if (match(t.dmg)) return t.elite ? `elite ${t.kind}` : t.kind;
  for (const b of before.bullets)
    if (match(b.dmg)) {
      if (bossKind === 'prism' && b.dmg === 12) return 'prism shards';
      if (bossKind === 'eclipse' && b.dmg === 28) return 'eclipse spiral';
      if (bossKind === 'eclipse' && b.dmg === 30) return 'eclipse embers';
      return 'spitter shot';
    }
  if (bossKind === 'eclipse' && match(65)) return 'eclipse slam';
  return 'unknown';
}

export interface BotRun {
  w: World;
  peak: number;
  peakBullets: number;
  dt: number;
  /** Player level at 3, 6 and 10 minutes (0 if not reached). */
  levelAt: Record<number, number>;
  firstLevel: number;
  /** Evolution id -> time it came online. */
  evolutions: Record<string, number>;
  prismKilled: number;
  eclipseFight: number;
  /** Lowest health fraction during the Eclipse fight. */
  eclipseMinHp: number;
  hurt: Record<string, number>;
  killer: string;
  /** Per minute: [alive, damage dealt that minute, hp fraction, level, kills, total xp]. */
  timeline: number[][];
}

export function playBot(seed: number, character = 'spark', maxSeconds = 780, opts: BotOptions = {}): BotRun {
  const policy = opts.policy ?? 'smart';
  const thinkEvery = opts.think ?? 10;
  const w = createWorld(seed, character);
  if (opts.weapon) w.weapons[0].id = opts.weapon;
  const rng = new Rng(mixSeed(seed, 99));
  let peak = 0;
  let peakBullets = 0;
  const levelAt: Record<number, number> = { 180: 0, 360: 0, 600: 0 };
  let firstLevel = 0;
  const evolutions: Record<string, number> = {};
  let prismKilled = 0;
  let eclipseAt = 0;
  let eclipseMinHp = 1;
  const hurt: Record<string, number> = {};
  let killer = '';
  let inp = { x: 0, y: 0 };
  const timeline: number[][] = [];
  let lastDealt = 0;
  let lastKills = 0;
  while (w.status === 'playing' && w.time < maxSeconds) {
    while (waiting(w)) {
      if (w.chestQueue > 0) {
        for (const c of takeChest(w)) if (c.evolves) evolutions[c.id] = w.time;
      } else choose(w, pickChoice(w, policy, rng));
    }
    if (w.tick % thinkEvery === 0) inp = botInput(w);
    // Snapshot what could hit us this step.
    const p = w.player;
    const touching: { kind: EnemyKind; dmg: number; elite: boolean }[] = [];
    w.grid.query(p.x, p.y, 130, (e) => {
      if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 < (e.r + PLAYER_R + 12) ** 2) touching.push({ kind: e.kind, dmg: e.dmg, elite: e.elite });
      // A bloater about to burst (its blast hits for 1.5x).
      if (e.kind === 'bloater' && e.phase === 1 && e.t > BLOAT_SWELL - 0.05) touching.push({ kind: 'bloater blast' as EnemyKind, dmg: e.dmg * BLOAT_BLAST, elite: e.elite });
    });
    const bullets = w.bullets.filter((b) => (b.x - p.x) ** 2 + (b.y - p.y) ** 2 < (b.r + PLAYER_R + 10) ** 2).map((b) => ({ dmg: b.dmg }));
    const hadPrism = w.boss !== null && w.enemies.some((e) => e.kind === 'prism');
    step(w, inp.x, inp.y);
    for (const f of w.fx) {
      if (f.type !== 'hurt') continue;
      const src = hurtSource(w, { touching, bullets }, f.dmg);
      hurt[src] = (hurt[src] ?? 0) + f.dmg;
      if ((w.status as World['status']) === 'dead') killer = src;
    }
    w.fx.length = 0;
    opts.onStep?.(w);
    if (w.player.level > 1 && !firstLevel) firstLevel = w.time;
    for (const t of [180, 360, 600]) if (!levelAt[t] && w.time >= t) levelAt[t] = w.player.level;
    if (hadPrism && !w.enemies.some((e) => e.kind === 'prism')) prismKilled = w.time;
    if (!eclipseAt && w.enemies.some((e) => e.kind === 'eclipse')) eclipseAt = w.time;
    if (eclipseAt) eclipseMinHp = Math.min(eclipseMinHp, Math.max(0, w.player.hp) / w.stats.maxHp);
    if (w.tick % 3600 === 0) {
      const dealt = Object.values(w.dealt).reduce((a, b) => a + (b ?? 0), 0);
      let xp = w.player.xp;
      for (let l = 1; l < w.player.level; l++) xp += xpToNext(l);
      timeline.push([w.enemies.length, dealt - lastDealt, w.player.hp / w.stats.maxHp, w.player.level, w.kills - lastKills, xp]);
      lastDealt = dealt;
      lastKills = w.kills;
    }
    peak = Math.max(peak, w.enemies.length);
    peakBullets = Math.max(peakBullets, w.bullets.length);
  }
  const eclipseFight = eclipseAt ? w.time - eclipseAt : 0;
  return { w, peak, peakBullets, dt: DT, levelAt, firstLevel, evolutions, prismKilled, eclipseFight, eclipseMinHp, hurt, killer, timeline };
}
