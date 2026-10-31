// Lantern rules. Pure and deterministic: (state, action) -> (state, events).
// All dice come from the seed via a roll counter in the state.

import { Rng, mixSeed } from '../../shared/rng';
import { ARMORS, LANTERN_TEXT, MONSTERS, POTION_HEAL, PRICES, WEAPONS, XP_TABLE } from './content';
import { MAPS } from './maps';
import type { Action, GameEvent, GameState, MapId, Monster, NpcId, Pos, StepResult } from './types';
import {
  DIRS8,
  WORLD,
  addPos,
  arrivalPos,
  canStep,
  chebyshev,
  fov,
  inMap,
  los,
  markerAt,
  markerPos,
  monsterAt,
  passable,
  samePos,
} from './world';

export const PLAYER_HIT = 0.85;
export const MONSTER_HIT = 0.8;
/** Regain 1 HP every this many turns. */
export const REGEN_EVERY = 10;
const LOG_MAX = 40;

export const attackOf = (s: GameState) => s.player.baseAtk + WEAPONS[s.player.weapon].atk;
export const defenceOf = (s: GameState) => s.player.baseDef + ARMORS[s.player.armor].def;

function roll(s: GameState): number {
  return new Rng(mixSeed(s.seed, s.rolls++)).next();
}
function rollInt(s: GameState, lo: number, hi: number): number {
  return lo + Math.floor(roll(s) * (hi - lo + 1));
}
function say(s: GameState, text: string): void {
  s.log.push(text);
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
}

/** Adjacent (8-way) NPC of the given id. */
function nextToNpc(s: GameState, npc: NpcId): boolean {
  const m = WORLD[s.player.map];
  return DIRS8.some((d) => {
    const mk = markerAt(m, addPos(s.player.pos, d));
    return mk?.kind === 'npc' && mk.npc === npc;
  });
}

export function isLegal(s: GameState, a: Action): boolean {
  if (s.quest === 'won' && a.type !== 'step' && a.type !== 'wait') return false;
  const p = s.player;
  switch (a.type) {
    case 'step': {
      if (!(a.dir >= 0 && a.dir < 8)) return false;
      const m = WORLD[p.map];
      const to = addPos(p.pos, DIRS8[a.dir]);
      if (!inMap(m, to) || !canStep(m, p.pos, a.dir)) return false;
      return passable(m, to) || !!monsterAt(s, p.map, to) || !!markerAt(m, to);
    }
    case 'wait':
      return true;
    case 'potion':
      return p.potions > 0 && p.hp < p.maxHp;
    case 'rest':
      return nextToNpc(s, 'healer') && p.gold >= PRICES.rest && p.hp < p.maxHp;
    case 'buy': {
      if (p.gold < PRICES[a.item]) return false;
      if (a.item === 'potion') return nextToNpc(s, 'healer');
      if (!nextToNpc(s, 'smith')) return false;
      if (a.item === 'sword') return p.weapon === 'dagger';
      if (a.item === 'leather') return p.armor === 'cloth';
      return p.armor !== 'chain';
    }
  }
}

export function applyAction(prev: GameState, a: Action): StepResult {
  if (!isLegal(prev, a)) throw new Error(`illegal action ${JSON.stringify(a)}`);
  const s: GameState = structuredClone(prev);
  const events: GameEvent[] = [];
  const p = s.player;
  let tookTurn = true;

  switch (a.type) {
    case 'step':
      tookTurn = step(s, a.dir, events);
      break;
    case 'wait':
      break;
    case 'potion': {
      const amount = Math.min(POTION_HEAL, p.maxHp - p.hp);
      p.hp += amount;
      p.potions--;
      say(s, `You drink a potion. +${amount} HP.`);
      events.push({ type: 'heal', amount });
      break;
    }
    case 'rest':
      p.gold -= PRICES.rest;
      events.push({ type: 'heal', amount: p.maxHp - p.hp });
      p.hp = p.maxHp;
      say(s, 'You rest by Mira’s fire. Fully healed.');
      tookTurn = false;
      break;
    case 'buy':
      p.gold -= PRICES[a.item];
      if (a.item === 'potion') p.potions++;
      else if (a.item === 'sword') p.weapon = 'sword';
      else p.armor = a.item;
      say(s, `Bought: ${a.item === 'potion' ? 'a potion' : a.item === 'sword' ? WEAPONS.sword.name : ARMORS[a.item].name}.`);
      tookTurn = false;
      break;
  }

  if (tookTurn) {
    s.turn++;
    monsterPhase(s, events);
    if (p.hp <= 0) knockedOut(s, events);
    else if (s.turn % REGEN_EVERY === 0 && p.hp < p.maxHp) p.hp++;
  }
  updateSeen(s);
  return { state: s, events };
}

// ---------- the player's step ----------

/** Returns whether the step used up the turn (talking and reading are free). */
function step(s: GameState, dir: number, events: GameEvent[]): boolean {
  const p = s.player;
  const m = WORLD[p.map];
  const to = addPos(p.pos, DIRS8[dir]);

  const foe = monsterAt(s, p.map, to);
  if (foe) {
    playerAttack(s, foe, events);
    return true;
  }
  const mk = markerAt(m, to);
  if (mk?.kind === 'npc') {
    talk(s, mk.npc, events);
    return false;
  }
  if (mk?.kind === 'sign') {
    say(s, `The sign reads: “${mk.text}”`);
    events.push({ type: 'read', text: mk.text });
    return false;
  }
  if (mk?.kind === 'lantern') {
    const text = s.quest === 'won' ? LANTERN_TEXT.lit : LANTERN_TEXT.cold;
    say(s, text);
    events.push({ type: 'read', text });
    return false;
  }
  if (mk?.kind === 'chest') {
    openChest(s, mk, events);
    return false;
  }

  events.push({ type: 'move', from: p.pos, to });
  p.pos = to;
  if (mk?.kind === 'exit') {
    p.map = mk.to;
    p.pos = arrivalPos(WORLD[mk.to], mk.entry, (q) => !monsterAt(s, mk.to, q));
    say(s, `You enter ${MAPS[mk.to].name}.`);
    events.push({ type: 'enterMap', map: mk.to });
  }
  return true;
}

function damageRoll(s: GameState, atk: number, def: number): number {
  return Math.max(1, atk - def + rollInt(s, -1, 1));
}

function playerAttack(s: GameState, foe: Monster, events: GameEvent[]): void {
  const def = MONSTERS[foe.kind];
  if (roll(s) >= PLAYER_HIT) {
    say(s, `You miss the ${def.name}.`);
    events.push({ type: 'miss', at: foe.pos });
    return;
  }
  const dmg = damageRoll(s, attackOf(s), def.def);
  foe.hp = Math.max(0, foe.hp - dmg);
  events.push({ type: 'hit', at: foe.pos, dmg, onPlayer: false });
  if (foe.hp > 0) {
    say(s, `You hit the ${def.name} for ${dmg}.`);
    return;
  }
  const gold = rollInt(s, def.gold[0], def.gold[1]);
  s.player.gold += gold;
  say(s, `The ${def.name} dies.${gold ? ` +${gold} gold.` : ''} +${def.xp} XP.`);
  events.push({ type: 'kill', at: foe.pos, kind: foe.kind });
  if (foe.kind === 'king') {
    s.quest = 'ember';
    say(s, 'The Ember falls from the crown, still warm. Take it home!');
    events.push({ type: 'loot', text: 'The Ember' });
  }
  gainXp(s, def.xp, events);
}

function gainXp(s: GameState, xp: number, events: GameEvent[]): void {
  const p = s.player;
  p.xp += xp;
  while (p.level < XP_TABLE.length && p.xp >= XP_TABLE[p.level]) {
    p.level++;
    p.maxHp += 6;
    p.hp += 6;
    p.baseAtk += 1;
    if (p.level % 2 === 0) p.baseDef += 1;
    say(s, `You reach level ${p.level}!`);
    events.push({ type: 'levelUp', level: p.level });
  }
}

function talk(s: GameState, npc: NpcId, events: GameEvent[]): void {
  if (npc === 'elder') {
    if (s.quest === 'none') {
      s.quest = 'started';
      say(s, 'Quest: bring the Ember back from the Hollow.');
    } else if (s.quest === 'ember') {
      s.quest = 'won';
      say(s, 'The Elder sets the Ember in the Lantern. Light floods Emberwick!');
      events.push({ type: 'talk', npc });
      events.push({ type: 'win' });
      return;
    }
  }
  if (npc === 'hermit' && !s.done.includes('hermit-gift')) {
    s.done.push('hermit-gift');
    s.player.potions++;
    say(s, 'The Hermit gives you a potion.');
  }
  events.push({ type: 'talk', npc });
}

function openChest(
  s: GameState,
  mk: Extract<ReturnType<typeof markerAt>, { kind: 'chest' }>,
  events: GameEvent[],
): void {
  if (s.done.includes(mk.id)) {
    say(s, 'The chest is empty.');
    return;
  }
  s.done.push(mk.id);
  const p = s.player;
  const got: string[] = [];
  if (mk.gold) {
    p.gold += mk.gold;
    got.push(`${mk.gold} gold`);
  }
  if (mk.potions) {
    p.potions += mk.potions;
    got.push(`${mk.potions} potion${mk.potions > 1 ? 's' : ''}`);
  }
  if (mk.item === 'axe') {
    p.weapon = 'axe';
    got.push('an Iron Axe (+5 attack)');
  }
  const text = got.join(', ');
  say(s, `You open the chest: ${text}.`);
  events.push({ type: 'loot', text });
}

// ---------- monsters ----------

function monsterPhase(s: GameState, events: GameEvent[]): void {
  const p = s.player;
  const m = WORLD[p.map];
  const free = (q: Pos) =>
    passable(m, q) && markerAt(m, q)?.kind !== 'exit' && !monsterAt(s, p.map, q) && !samePos(q, p.pos);
  for (const mo of s.monsters) {
    if (mo.hp <= 0 || mo.map !== p.map || p.hp <= 0) continue;
    const def = MONSTERS[mo.kind];
    const d = chebyshev(mo.pos, p.pos);
    if (d === 1) {
      if (roll(s) >= MONSTER_HIT) {
        say(s, `The ${def.name} misses you.`);
        events.push({ type: 'miss', at: p.pos });
        continue;
      }
      const dmg = damageRoll(s, def.atk, defenceOf(s));
      p.hp = Math.max(0, p.hp - dmg);
      say(s, `The ${def.name} hits you for ${dmg}.`);
      events.push({ type: 'hit', at: p.pos, dmg, onPlayer: true });
      continue;
    }
    let target: Pos | null = null;
    const chasing = d <= def.sight && los(m, mo.pos, p.pos);
    if (chasing && !(def.erratic > 0 && roll(s) < def.erratic)) {
      // Step to the free neighbor closest to the player.
      let best = d;
      for (let k = 0; k < 8; k++) {
        const n = addPos(mo.pos, DIRS8[k]);
        const nd = chebyshev(n, p.pos);
        if (nd < best && free(n) && canStep(m, mo.pos, k)) {
          best = nd;
          target = n;
        }
      }
    } else if (chasing || roll(s) < 0.25) {
      const k = rollInt(s, 0, 7);
      const n = addPos(mo.pos, DIRS8[k]);
      if (free(n) && canStep(m, mo.pos, k)) target = n;
    }
    if (target) mo.pos = target;
  }
}

function knockedOut(s: GameState, events: GameEvent[]): void {
  const p = s.player;
  s.deaths++;
  p.gold = Math.floor(p.gold / 2);
  p.hp = p.maxHp;
  p.map = 'village';
  p.pos = markerPos(WORLD.village, '@');
  // Survivors heal and return home.
  for (const mo of s.monsters) {
    if (mo.hp <= 0) continue;
    mo.hp = MONSTERS[mo.kind].hp;
    mo.pos = { ...HOMES[mo.id] };
  }
  say(s, 'You fall... and wake by the cold Lantern, your purse lighter.');
  events.push({ type: 'playerDown' });
}

/** Monsters' starting positions, indexed by id (ids follow map load order). */
const HOMES: Pos[] = (Object.keys(WORLD) as MapId[]).flatMap((id) => WORLD[id].monsters.map((mo) => mo.pos));

// ---------- setup ----------

function updateSeen(s: GameState): void {
  const id = s.player.map;
  if (!MAPS[id].dark) return;
  const m = WORLD[id];
  const cur = s.seen[id] ?? '0'.repeat(m.w * m.h);
  const lit = fov(m, s.player.pos);
  let out = '';
  for (let i = 0; i < cur.length; i++) out += lit.has(i) ? '1' : cur[i];
  s.seen[id] = out;
}

export function newGame(seed: number): GameState {
  const monsters: Monster[] = [];
  for (const id of Object.keys(WORLD) as MapId[]) {
    for (const mo of WORLD[id].monsters) {
      monsters.push({ id: monsters.length, kind: mo.kind, map: id, pos: { ...mo.pos }, hp: MONSTERS[mo.kind].hp });
    }
  }
  const s: GameState = {
    seed,
    turn: 0,
    rolls: 0,
    player: {
      pos: markerPos(WORLD.village, '@'),
      map: 'village',
      hp: 20,
      maxHp: 20,
      level: 1,
      xp: 0,
      baseAtk: 3,
      baseDef: 0,
      gold: 8,
      potions: 2,
      weapon: 'dagger',
      armor: 'cloth',
    },
    monsters,
    done: [],
    quest: 'none',
    seen: {},
    log: ['Emberwick has gone cold. Find Elder Wenna.'],
    deaths: 0,
  };
  return s;
}
