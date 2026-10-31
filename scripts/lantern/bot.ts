// A "completion bot" for Lantern: plays the whole story using pathTo.
// Elder -> shop -> clear the forest -> explore the dark caves -> kill the
// Hollow King -> back to the Elder. Used by balance.ts and tests.
import {
  DIRS8,
  MAPS,
  WORLD,
  addPos,
  applyAction,
  canStep,
  chebyshev,
  encodeAction,
  fov,
  inMap,
  isLegal,
  markerAt,
  markerPos,
  monsterAt,
  newGame,
  passable,
  pathTo,
  type Action,
  type GameState,
  type MapId,
  type Pos,
} from '../../src/lantern/core';

/** Exit marker to take from each map when heading home / heading deeper. */
const HOMEWARD: Partial<Record<MapId, string>> = { forest: 'W', cave1: 'U', cave2: 'V' };
const ONWARD: Partial<Record<MapId, string>> = { village: 'E', forest: 'C', cave1: 'D' };
const POTION_STOCK = 3;
const LOW_HP = 0.4;

export interface KingSnapshot {
  turn: number;
  level: number;
  weapon: string;
  armor: string;
  potions: number;
  hp: number;
  maxHp: number;
  deaths: number;
}

export interface BotResult {
  state: GameState;
  actions: string;
  king: KingSnapshot | null;
  /** Each knock-out: where, at what level, and who landed the last blow. */
  knockouts: { map: MapId; level: number; by: string }[];
}

const idx = (m: (typeof WORLD)[MapId], p: Pos) => p.y * m.w + p.x;

function known(s: GameState, p: Pos): boolean {
  const id = s.player.map;
  if (!MAPS[id].dark) return true;
  const seen = s.seen[id];
  return seen !== undefined && seen[idx(WORLD[id], p)] === '1';
}

/** BFS walking distance over known, open, monster-free, non-exit ground. */
function distField(s: GameState): Int32Array {
  const m = WORLD[s.player.map];
  const dist = new Int32Array(m.w * m.h).fill(-1);
  const q: Pos[] = [s.player.pos];
  dist[idx(m, s.player.pos)] = 0;
  for (let i = 0; i < q.length; i++) {
    const cur = q[i];
    const dc = dist[idx(m, cur)];
    for (let k = 0; k < 8; k++) {
      const n = addPos(cur, DIRS8[k]);
      if (!inMap(m, n) || dist[idx(m, n)] >= 0 || !canStep(m, cur, k)) continue;
      if (!passable(m, n) || !known(s, n) || monsterAt(s, m.id, n)) continue;
      if (markerAt(m, n)?.kind === 'exit') continue;
      dist[idx(m, n)] = dc + 1;
      q.push(n);
    }
  }
  return dist;
}

/** Cost to reach (or bump into) a cell: open cells by distance, blocked ones via a neighbour. */
function costTo(s: GameState, dist: Int32Array, p: Pos): number {
  const m = WORLD[s.player.map];
  const direct = dist[idx(m, p)];
  if (direct >= 0) return direct;
  let best = Infinity;
  for (const d of DIRS8) {
    const n = addPos(p, d);
    if (inMap(m, n) && dist[idx(m, n)] >= 0) best = Math.min(best, dist[idx(m, n)] + 1);
  }
  return best;
}

/** First step of a path to the cheapest reachable candidate, or null. */
function stepToward(s: GameState, dist: Int32Array, cands: Pos[]): Action | null {
  const ranked = cands
    .map((p) => ({ p, c: costTo(s, dist, p) }))
    .filter((x) => Number.isFinite(x.c))
    .sort((a, b) => a.c - b.c);
  for (const { p } of ranked) {
    const path = pathTo(s, p);
    if (path && path.length) return { type: 'step', dir: path[0] };
  }
  return null;
}

function visibleMonsters(s: GameState) {
  const m = WORLD[s.player.map];
  const lit = MAPS[m.id].dark ? fov(m, s.player.pos) : null;
  return s.monsters.filter((mo) => mo.hp > 0 && mo.map === m.id && (!lit || lit.has(idx(m, mo.pos))));
}

/** Seen open cells that border an unseen cell (dark maps only). */
function frontier(s: GameState): Pos[] {
  const m = WORLD[s.player.map];
  const seen = s.seen[m.id];
  if (!MAPS[m.id].dark || !seen) return [];
  const out: Pos[] = [];
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const p = { x, y };
      if (seen[idx(m, p)] !== '1' || !passable(m, p) || markerAt(m, p)?.kind === 'exit') continue;
      if (DIRS8.some((d) => { const n = addPos(p, d); return inMap(m, n) && seen[idx(m, n)] === '0'; })) out.push(p);
    }
  return out;
}

function npcPos(id: string): Pos {
  const m = WORLD.village;
  for (const [i, v] of m.markers) if (v.marker.kind === 'npc' && v.marker.npc === id) return { x: i % m.w, y: Math.floor(i / m.w) };
  throw new Error(id);
}

const ELDER = npcPos('elder');
const SMITH = npcPos('smith');
const HEALER = npcPos('healer');

function smithWants(s: GameState): Action | null {
  const p = s.player;
  if (p.weapon === 'dagger' && p.gold >= 20) return { type: 'buy', item: 'sword' };
  if (p.weapon === 'dagger') return null; // save for the sword first
  if (p.armor !== 'chain' && p.gold >= 35) return { type: 'buy', item: 'chain' };
  if (p.armor === 'cloth' && p.gold >= 12) return { type: 'buy', item: 'leather' };
  return null;
}

function healerWants(s: GameState): Action | null {
  const p = s.player;
  if (p.hp < p.maxHp && p.gold >= 2) return { type: 'rest' };
  if (p.potions < POTION_STOCK && p.gold >= 6 && !smithWants(s)) return { type: 'buy', item: 'potion' };
  return null;
}

const near = (s: GameState, at: Pos) => chebyshev(s.player.pos, at) === 1;

export function botAction(s: GameState, mem: { retreat: boolean }): Action {
  const p = s.player;
  const m = WORLD[p.map];
  const dist = distField(s);
  const wait: Action = { type: 'wait' };
  const low = p.hp < p.maxHp * LOW_HP;

  if (low && p.potions > 0 && isLegal(s, { type: 'potion' })) return { type: 'potion' };
  if (low && p.potions === 0 && p.map !== 'village') mem.retreat = true;

  // Adjacent monsters: hit the weakest.
  const dirTo = (q: Pos) => DIRS8.findIndex((v) => v.x === q.x - p.pos.x && v.y === q.y - p.pos.y);
  const adj = s.monsters
    .filter((mo) => mo.hp > 0 && mo.map === p.map && chebyshev(mo.pos, p.pos) === 1)
    .filter((mo) => isLegal(s, { type: 'step', dir: dirTo(mo.pos) }))
    .sort((a, b) => a.hp - b.hp);
  if (adj.length) return { type: 'step', dir: dirTo(adj[0].pos) };

  if (p.map === 'village') {
    if (s.quest === 'none' || s.quest === 'ember') return stepToward(s, dist, [ELDER]) ?? wait;
    const sm = smithWants(s);
    if (sm) return near(s, SMITH) ? sm : stepToward(s, dist, [SMITH]) ?? wait;
    const he = healerWants(s);
    if (he) return near(s, HEALER) ? he : stepToward(s, dist, [HEALER]) ?? wait;
    if (p.hp < p.maxHp * 0.9) return wait; // broke: regenerate in safety
    mem.retreat = false;
    return stepToward(s, dist, [markerPos(m, ONWARD.village!)]) ?? wait;
  }

  const wantsShop = p.map === 'forest' && !!smithWants(s);
  if (s.quest === 'ember' || mem.retreat || wantsShop) {
    const home = stepToward(s, dist, [markerPos(m, HOMEWARD[p.map]!)]);
    if (home) return home;
  }

  const cands: Pos[] = visibleMonsters(s).map((mo) => mo.pos);
  for (const [i, v] of m.markers) {
    const at = { x: i % m.w, y: Math.floor(i / m.w) };
    if (!known(s, at)) continue;
    if (v.marker.kind === 'chest' && !s.done.includes(v.marker.id)) cands.push(at);
    if (v.marker.kind === 'npc' && v.marker.npc === 'hermit' && !s.done.includes('hermit-gift')) cands.push(at);
  }
  const target = stepToward(s, dist, cands) ?? stepToward(s, dist, frontier(s));
  if (target) return target;
  const on = ONWARD[p.map];
  if (on && known(s, markerPos(m, on))) return stepToward(s, dist, [markerPos(m, on)]) ?? wait;
  return wait;
}

export function playCompletion(seed: number, maxActions = 6000): BotResult {
  let s = newGame(seed);
  let actions = '';
  let king: KingSnapshot | null = null;
  const knockouts: BotResult['knockouts'] = [];
  const mem = { retreat: false };
  while (s.quest !== 'won' && actions.length < maxActions) {
    const a = botAction(s, mem);
    const before = s.quest;
    const prev = s;
    const r = applyAction(s, a);
    s = r.state;
    actions += encodeAction(a);
    if (r.events.some((e) => e.type === 'playerDown')) {
      const hit = [...s.log].reverse().find((l) => / hits you /.test(l));
      knockouts.push({ map: prev.player.map, level: prev.player.level, by: hit?.match(/^The (.+) hits you/)?.[1] ?? '?' });
    }
    if (before !== 'ember' && s.quest === 'ember') {
      const p = s.player;
      king = { turn: s.turn, level: p.level, weapon: p.weapon, armor: p.armor, potions: p.potions, hp: p.hp, maxHp: p.maxHp, deaths: s.deaths };
    }
  }
  return { state: s, actions, king, knockouts };
}
