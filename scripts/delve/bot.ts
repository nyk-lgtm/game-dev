// A descent bot for Delve: explores each floor (BFS to the nearest unseen
// frontier, opening doors on the way), fights what it meets, drinks potions
// when hurt, picks things up and takes the stairs once the floor is done.
// Only legal actions through the public API: it turns to face, then acts.
// Used by balance.ts and tests/delve/complete.test.ts.
import {
  DX,
  DY,
  MAX_DEPTH,
  MONSTERS,
  SIGHT,
  SIZE,
  SPELLS,
  WEAPON_ATK,
  applyAction,
  encodeAction,
  idx,
  inside,
  isLegal,
  los,
  newGame,
  type Action,
  type GameState,
  type Monster,
  type MonsterKind,
  type SpellId,
} from '../../src/delve/core';

const LOW_HP = 0.35;
/** Turns spent on a floor before the bot stops exploring and heads down. */
const FLOOR_BUDGET = 450;
const RANGED = new Set<MonsterKind>(['archer', 'mage', 'warden']);
const DANGEROUS = new Set<MonsterKind>(['ghoul', 'wraith', 'golem', 'mage', 'warden', 'skeleton', 'archer']);

export interface FloorStat {
  depth: number;
  /** Snapshot on arrival. */
  level: number;
  weapon: number;
  armor: number;
  hp: number;
  maxHp: number;
  potions: number;
  xp: number;
  /** Turns spent on this floor. */
  turns: number;
  /** Damage taken on this floor, by monster kind. */
  hurt: Partial<Record<MonsterKind, number>>;
  /** Potions drunk and Mends cast on this floor. */
  heals: number;
}

export interface BotResult {
  state: GameState;
  actions: string;
  floors: FloorStat[];
  /** Kind of monster that landed the killing blow, if the bot died. */
  killer: MonsterKind | null;
}

const walkable = (s: GameState, x: number, y: number) => {
  const t = s.level.tiles[idx(x, y)];
  return t !== 'wall' && t !== 'pillar';
};
const known = (s: GameState, x: number, y: number) => s.level.seen[idx(x, y)];

export function visible(s: GameState, m: Monster): boolean {
  const p = s.player;
  const dx = m.x - p.x;
  const dy = m.y - p.y;
  return m.hp > 0 && dx * dx + dy * dy <= SIGHT * SIGHT + 2 && los(s, p.x, p.y, m.x, m.y);
}

/** BFS over known walkable cells, not through visible monsters. Returns distance and parent arrays. */
function bfs(s: GameState, blockers: Set<number>): { dist: Int16Array; first: Int8Array } {
  const p = s.player;
  const dist = new Int16Array(SIZE * SIZE).fill(-1);
  const first = new Int8Array(SIZE * SIZE).fill(-1);
  const q = [idx(p.x, p.y)];
  dist[q[0]] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    const x = c % SIZE;
    const y = (c / SIZE) | 0;
    // Doors are walked into (which opens them) but nothing beyond is known until then.
    if (c !== q[0] && s.level.tiles[c] === 'door') continue;
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k];
      const ny = y + DY[k];
      if (!inside(nx, ny)) continue;
      const n = idx(nx, ny);
      if (dist[n] >= 0 || !known(s, nx, ny) || !walkable(s, nx, ny) || blockers.has(n)) continue;
      dist[n] = dist[c] + 1;
      first[n] = c === q[0] ? k : first[c];
      // Never path over the stairs by accident.
      if (s.level.tiles[n] !== 'stairs') q.push(n);
    }
  }
  return { dist, first };
}

/** Turn toward k (free), or act if already facing. */
function face(s: GameState, k: number, act: Action): Action {
  const d = s.player.dir;
  if (d === k) return act;
  return { type: (k - d + 4) % 4 === 1 ? 'right' : 'left' };
}

/** Direction from the player to a cell in a straight line (any distance), or -1. */
function lineDir(s: GameState, x: number, y: number): number {
  const p = s.player;
  if (x === p.x && y !== p.y) return y < p.y ? 0 : 2;
  if (y === p.y && x !== p.x) return x > p.x ? 1 : 3;
  return -1;
}

/** Would a bolt cast toward k hit this monster first? */
function boltHits(s: GameState, k: number, target: Monster): boolean {
  const p = s.player;
  for (let d = 1; d <= 8; d++) {
    const x = p.x + DX[k] * d;
    const y = p.y + DY[k] * d;
    const m = s.monsters.find((o) => o.hp > 0 && o.x === x && o.y === y);
    if (m) return m.id === target.id;
    const t = s.level.tiles[idx(x, y)];
    if (!inside(x, y) || t === 'wall' || t === 'door' || t === 'pillar') return false;
  }
  return false;
}

const can = (s: GameState, spell: SpellId) => isLegal(s, { type: 'cast', spell });

/** Rough number of melee hits needed to kill it. */
function hitsToKill(s: GameState, m: Monster): number {
  const p = s.player;
  const atk = p.baseAtk + WEAPON_ATK[p.weapon] - MONSTERS[m.kind].def + 0.5;
  return Math.ceil(m.hp / Math.max(1, atk * 0.88));
}

function spellOn(s: GameState, m: Monster, k: number, dist: number): Action | null {
  const p = s.player;
  const def = MONSTERS[m.kind];
  const reserve = p.spells.includes('heal') ? SPELLS.heal.cost : 0;
  const spare = (c: number) => p.mp - c >= reserve || m.kind === 'warden' || p.hp < p.maxHp * 0.5;
  if (!boltHits(s, k, m)) return null;
  // Frost on golems (and the Warden) that aren't frozen yet.
  if ((m.kind === 'golem' || m.kind === 'warden' || (m.kind === 'ghoul' && p.hp < p.maxHp * 0.6)) && m.stun === 0 && can(s, 'frost') && spare(SPELLS.frost.cost))
    return face(s, k, { type: 'cast', spell: 'frost' });
  if (!can(s, 'fire') || !spare(SPELLS.fire.cost)) return null;
  // Fire on ranged foes, dangerous ones, or anything that would take many swings.
  if (RANGED.has(m.kind) || (DANGEROUS.has(m.kind) && (dist > 1 || hitsToKill(s, m) > 2)) || hitsToKill(s, m) > 3) {
    if (m.hp <= 2 && dist === 1) return null; // finish it with the blade
    // Low on MP: save it for something worse than a weakling walking up.
    if (!def.range && dist > 1 && def.slow === 0 && p.mp < SPELLS.fire.cost * 2 && !DANGEROUS.has(m.kind)) return null;
    return face(s, k, { type: 'cast', spell: 'fire' });
  }
  return null;
}

export interface BotMemory {
  floorStart: number;
  /** Consecutive turns spent waiting for a foe to close in. */
  waited: number;
  /** A foe we've spotted and mean to fight (so it isn't forgotten behind a pillar). */
  target: number;
  targetSince: number;
}

export function botAction(s: GameState, mem: BotMemory): Action {
  const p = s.player;
  const wait: Action = { type: 'wait' };
  const vis = s.monsters.filter((m) => visible(s, m));
  const awakeNear = vis.filter((m) => m.awake && Math.abs(m.x - p.x) + Math.abs(m.y - p.y) <= 6);

  // Heal when hurt: Mend first (cheap), then potions.
  if (p.hp < p.maxHp * LOW_HP || (p.hp < p.maxHp * 0.5 && awakeNear.some((m) => m.kind === 'warden' || m.kind === 'golem'))) {
    if (can(s, 'heal')) return { type: 'cast', spell: 'heal' };
    if (isLegal(s, { type: 'potion' })) return { type: 'potion' };
  }
  if (!awakeNear.length && p.hp < p.maxHp * 0.6 && can(s, 'heal') && p.mp >= p.maxMp - 1) return { type: 'cast', spell: 'heal' };
  if (p.mp <= 1 && p.ethers > 0 && awakeNear.some((m) => DANGEROUS.has(m.kind)) && isLegal(s, { type: 'ether' })) return { type: 'ether' };

  // Adjacent foes: spell or blade, weakest / most dangerous first.
  const adj = s.monsters
    .filter((m) => m.hp > 0 && Math.abs(m.x - p.x) + Math.abs(m.y - p.y) === 1)
    .sort((a, b) => Number(RANGED.has(b.kind)) - Number(RANGED.has(a.kind)) || a.hp - b.hp);
  if (adj.length) {
    const m = adj[0];
    const k = lineDir(s, m.x, m.y);
    return spellOn(s, m, k, 1) ?? face(s, k, { type: 'forward' });
  }

  // Foes in a straight line: bolt them.
  for (const m of vis.filter((m) => m.awake || RANGED.has(m.kind)).sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.y - p.y) - (Math.abs(b.x - p.x) + Math.abs(b.y - p.y)))) {
    const k = lineDir(s, m.x, m.y);
    if (k < 0) continue;
    const d = Math.abs(m.x - p.x) + Math.abs(m.y - p.y);
    const a = spellOn(s, m, k, d);
    if (a) return a;
  }

  const blockers = new Set<number>();
  for (const m of vis) blockers.add(idx(m.x, m.y));
  const { dist, first } = bfs(s, blockers);
  const reach = (x: number, y: number) => {
    // Distance to stand next to (x, y).
    let best = -1;
    let k = -1;
    for (let j = 0; j < 4; j++) {
      const nx = x + DX[j];
      const ny = y + DY[j];
      if (!inside(nx, ny)) continue;
      const n = idx(nx, ny);
      if (nx === p.x && ny === p.y) return { d: 0, k: -1 };
      if (dist[n] >= 0 && (best < 0 || dist[n] < best)) {
        best = dist[n];
        k = first[n];
      }
    }
    return { d: best, k };
  };
  const go = (k: number): Action => {
    if (k < 0) return wait;
    return face(s, k, { type: 'forward' });
  };

  // An awake melee foe closing in: let it come to us (we strike first).
  const closing = awakeNear.filter((m) => !MONSTERS[m.kind].range && Math.abs(m.x - p.x) + Math.abs(m.y - p.y) <= 3);
  if (closing.length && !closing.every((m) => m.stun > 0)) {
    const m = closing[0];
    if (MONSTERS[m.kind].erratic === 0 && mem.waited < 3) {
      mem.waited++;
      return wait;
    }
  } else mem.waited = 0;

  // Engage visible foes (XP matters), nearest first; keep after one we lost sight of.
  let bestFoe: { d: number; k: number; id: number } | null = null;
  for (const m of vis) {
    const r = reach(m.x, m.y);
    if (r.d > 0 && r.d <= 10 && (!bestFoe || r.d < bestFoe.d)) bestFoe = { ...r, id: m.id };
  }
  const old = s.monsters.find((m) => m.id === mem.target && m.hp > 0);
  if (!bestFoe && old && s.turn - mem.targetSince < 25) {
    const r = reach(old.x, old.y);
    if (r.d > 0 && r.d <= 14) bestFoe = { ...r, id: old.id };
  }
  if (bestFoe) {
    if (bestFoe.id !== mem.target) {
      mem.target = bestFoe.id;
      mem.targetSince = s.turn;
    }
    return go(bestFoe.k);
  }

  // Items we know about.
  let bestItem: { d: number; k: number } | null = null;
  for (const it of s.items) {
    if (!known(s, it.x, it.y)) continue;
    const n = idx(it.x, it.y);
    const d = dist[n];
    if (d > 0 && (!bestItem || d < bestItem.d)) bestItem = { d, k: first[n] };
  }
  if (bestItem) return go(bestItem.k);

  const stairs = s.level.tiles.indexOf('stairs');
  const stairsKnown = stairs >= 0 && s.level.seen[stairs];
  const onFloor = s.turn - mem.floorStart;
  const hurry = onFloor > FLOOR_BUDGET;

  if (!(hurry && stairsKnown)) {
    // Explore: nearest known walkable cell next to the unknown, or a closed door.
    let bestF: { d: number; k: number } | null = null;
    for (let n = 0; n < SIZE * SIZE; n++) {
      const d = dist[n];
      if (d < 0 || (bestF && d >= bestF.d)) continue;
      const x = n % SIZE;
      const y = (n / SIZE) | 0;
      let frontier = s.level.tiles[n] === 'door';
      for (let j = 0; j < 4 && !frontier; j++) {
        const nx = x + DX[j];
        const ny = y + DY[j];
        if (inside(nx, ny) && !known(s, nx, ny)) frontier = true;
      }
      if (frontier && d > 0) bestF = { d, k: first[n] };
    }
    if (bestF) return go(bestF.k);
  }

  if (stairsKnown && s.depth < MAX_DEPTH) {
    // Top up before going down if it's cheap to.
    if (p.hp < p.maxHp * 0.5 && can(s, 'heal')) return { type: 'cast', spell: 'heal' };
    const d = dist[stairs];
    if (d > 0) return go(first[stairs]);
  }
  // Nothing to do: wander (look around).
  if (s.depth === MAX_DEPTH) {
    // Seek the Warden through anything in the way.
    const w = s.monsters.find((m) => m.kind === 'warden');
    if (w) {
      const n = reach(w.x, w.y);
      if (n.k >= 0) return go(n.k);
    }
  }
  return wait;
}

export function playDescent(seed: number, maxActions = 8000): BotResult {
  let s = newGame(seed);
  let actions = '';
  const floors: FloorStat[] = [];
  const snap = (): FloorStat => ({ depth: s.depth, level: s.player.level, weapon: s.player.weapon, armor: s.player.armor, hp: s.player.hp, maxHp: s.player.maxHp, potions: s.player.potions, xp: s.player.xp, turns: 0, hurt: {}, heals: 0 });
  floors.push(snap());
  const mem: BotMemory = { floorStart: 0, waited: 0, target: -1, targetSince: 0 };
  let killer: MonsterKind | null = null;
  let idle = 0;
  while (s.status === 'playing' && actions.length < maxActions) {
    const a = botAction(s, mem);
    const r = applyAction(s, a);
    const depth = s.depth;
    s = r.state;
    actions += encodeAction(a);
    idle = a.type === 'wait' && !s.monsters.some((m) => m.awake && visible(s, m)) ? idle + 1 : 0;
    if (idle > 40) break; // stuck
    const f = floors[floors.length - 1];
    if (a.type === 'potion' || (a.type === 'cast' && a.spell === 'heal')) f.heals++;
    for (const e of r.events)
      if (e.type === 'hurt') {
        f.hurt[e.by] = (f.hurt[e.by] ?? 0) + e.dmg;
        if (s.status === 'dead') killer = e.by;
      }
    if (s.depth !== depth) {
      floors[floors.length - 1].turns = s.turn - mem.floorStart;
      mem.floorStart = s.turn;
      floors.push(snap());
    }
  }
  floors[floors.length - 1].turns = s.turn - mem.floorStart;
  return { state: s, actions, floors, killer };
}

