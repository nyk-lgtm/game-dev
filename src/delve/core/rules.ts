// Delve rules. Pure and deterministic: (state, action) -> (state, events).
// Turning is free; moving, attacking, casting and drinking take a turn,
// after which every awake monster acts.

import { Rng, mixSeed } from '../../shared/rng';
import { ARMORS, ARMOR_DEF, ETHER_MP, GEAR_PRICE, MAX_DEPTH, MONSTERS, POTION_HEAL, SHOP_DEPTHS, SPELLS, THEFT_PER_DEPTH, VIGOR_HP, WEAPONS, WEAPON_ATK, XP_TABLE, fireDamage } from './content';
import { SIZE, distances, generateFloor } from './gen';
import { DX, DY, type Action, type Dir, type GameEvent, type GameState, type Monster, type MonsterKind, type Offer, type SpellId, type StepResult, type Tile } from './types';

const LOG_MAX = 30;
export const SIGHT = 7;
export const MP_REGEN_EVERY = 6;
/** How far past a closed door (in steps) you hear what's there. */
export const NOISE_RANGE = 5;

export const idx = (x: number, y: number) => y * SIZE + x;
export const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < SIZE && y < SIZE;
export const tileAt = (s: GameState, x: number, y: number): Tile => (inside(x, y) ? s.level.tiles[idx(x, y)] : 'wall');
export const solid = (t: Tile) => t === 'wall' || t === 'pillar' || t === 'door';
export const opaqueTile = (t: Tile) => t === 'wall' || t === 'door' || t === 'pillar';
export const monsterAt = (s: GameState, x: number, y: number) => s.monsters.find((m) => m.hp > 0 && m.x === x && m.y === y);
export const attackOf = (s: GameState) => s.player.baseAtk + WEAPON_ATK[s.player.weapon];
export const defenceOf = (s: GameState) => s.player.baseDef + ARMOR_DEF[s.player.armor];

function roll(s: GameState): number {
  return new Rng(mixSeed(s.seed, 1_000_000 + s.rolls++)).next();
}
function rollInt(s: GameState, lo: number, hi: number): number {
  return lo + Math.floor(roll(s) * (hi - lo + 1));
}
/** "the giant rat", but "The Warden" (whose name already carries its article). */
function the(kind: MonsterKind, start = false): string {
  const name = MONSTERS[kind].name;
  if (name.startsWith('The ')) return start ? name : `the ${name.slice(4)}`;
  return `${start ? 'The' : 'the'} ${name.toLowerCase()}`;
}
/** "a Sword", "an Axe". */
export function article(name: string): string {
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}
function say(s: GameState, text: string): void {
  s.log.push(text);
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
}

/** Like say, but not twice in a row (repeated bumps and whiffs). */
function sayOnce(s: GameState, text: string): void {
  if (s.log[s.log.length - 1] !== text) say(s, text);
}

/** Straight-line visibility between cell centers (DDA over the grid). */
export function los(s: GameState, ax: number, ay: number, bx: number, by: number): boolean {
  const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 3;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = Math.round(ax + (bx - ax) * t);
    const y = Math.round(ay + (by - ay) * t);
    if ((x !== ax || y !== ay) && (x !== bx || y !== by) && opaqueTile(tileAt(s, x, y))) return false;
  }
  return true;
}

function markSeen(s: GameState): void {
  const p = s.player;
  for (let y = p.y - SIGHT; y <= p.y + SIGHT; y++)
    for (let x = p.x - SIGHT; x <= p.x + SIGHT; x++) {
      if (!inside(x, y) || (x - p.x) ** 2 + (y - p.y) ** 2 > SIGHT * SIGHT + 2) continue;
      if (los(s, p.x, p.y, x, y)) s.level.seen[idx(x, y)] = true;
    }
}

export function isLegal(s: GameState, a: Action): boolean {
  if (s.status !== 'playing') return false;
  const p = s.player;
  // At a merchant's stall nothing else happens until you leave it.
  if (s.shop) return a.type === 'leave' || (a.type === 'buy' && canBuy(s, s.shop[a.slot]));
  switch (a.type) {
    case 'buy':
    case 'leave':
      return false;
    case 'potion':
      return p.potions > 0 && p.hp < p.maxHp;
    case 'ether':
      return p.ethers > 0 && p.mp < p.maxMp;
    case 'read':
      return p.scrolls > 0 && !isRevealed(s);
    case 'cast':
      return p.spells.includes(a.spell) && p.mp >= SPELLS[a.spell].cost && (a.spell !== 'heal' || p.hp < p.maxHp);
    default:
      return true;
  }
}

export function applyAction(prev: GameState, a: Action): StepResult {
  if (!isLegal(prev, a)) throw new Error(`illegal action ${JSON.stringify(a)}`);
  const s: GameState = structuredClone(prev);
  const ev: GameEvent[] = [];
  const p = s.player;
  let took = true;
  switch (a.type) {
    case 'left':
    case 'right':
      p.dir = ((p.dir + (a.type === 'left' ? 3 : 1)) % 4) as Dir;
      ev.push({ type: 'turn', dir: p.dir });
      took = false;
      break;
    case 'forward':
      took = walk(s, p.dir, ev, true);
      break;
    case 'back':
      took = walk(s, ((p.dir + 2) % 4) as Dir, ev, false);
      break;
    case 'strafeL':
      took = walk(s, ((p.dir + 3) % 4) as Dir, ev, false);
      break;
    case 'strafeR':
      took = walk(s, ((p.dir + 1) % 4) as Dir, ev, false);
      break;
    case 'use':
      took = use(s, ev);
      break;
    case 'wait':
      break;
    case 'potion': {
      const heal = Math.min(p.maxHp - p.hp, Math.ceil(p.maxHp * POTION_HEAL));
      p.hp += heal;
      p.potions--;
      say(s, `You drink a potion. +${heal} HP.`);
      break;
    }
    case 'ether':
      p.mp = Math.min(p.maxMp, p.mp + ETHER_MP);
      p.ethers--;
      say(s, 'You drink an ether. Your mind clears.');
      break;
    case 'read':
      p.scrolls--;
      reveal(s);
      say(s, 'You read a scroll of seeing. The floor unfolds in your mind.');
      ev.push({ type: 'reveal' });
      break;
    case 'cast':
      cast(s, a.spell, ev);
      break;
    case 'buy':
      buy(s, s.shop![a.slot], ev);
      took = false;
      break;
    case 'leave':
      s.shop = null;
      say(s, 'The merchant packs up and is gone.');
      took = false;
      break;
  }
  if (took && s.status === 'playing') {
    s.turn++;
    if (s.turn % MP_REGEN_EVERY === 0 && p.mp < p.maxMp) p.mp++;
    monsterTurn(s, ev);
    s.monsters = s.monsters.filter((m) => m.hp > 0);
  }
  markSeen(s);
  return { state: s, events: ev };
}

// ---------- the player ----------

/** Step one cell; bumping a monster attacks it, bumping a door opens it. */
function walk(s: GameState, dir: Dir, ev: GameEvent[], canAttack: boolean): boolean {
  const p = s.player;
  const nx = p.x + DX[dir];
  const ny = p.y + DY[dir];
  const m = monsterAt(s, nx, ny);
  if (m) {
    if (!canAttack) {
      sayOnce(s, `${the(m.kind, true)} is in the way. Face it to fight.`);
      ev.push({ type: 'bump', what: 'foe' });
      return false;
    }
    attack(s, m, ev);
    return true;
  }
  const t = tileAt(s, nx, ny);
  if (t === 'door') {
    s.level.tiles[idx(nx, ny)] = 'open';
    say(s, 'The door creaks open.');
    ev.push({ type: 'door' });
    return true;
  }
  if (solid(t)) {
    sayOnce(s, t === 'pillar' ? 'You bump into a pillar.' : 'You bump into the wall.');
    ev.push({ type: 'bump', what: 'wall' });
    return false;
  }
  p.x = nx;
  p.y = ny;
  ev.push({ type: 'move' });
  pickup(s, ev);
  if (t === 'stairs') descend(s, ev);
  else if (doorNoises(s).length) say(s, 'You hear something behind the door.');
  return true;
}

/**
 * Closed doors next to you with something lurking within a few steps beyond them
 * (out of your sight): the "?" on the maps and the warning when you step up to one.
 */
export function doorNoises(s: GameState): { x: number; y: number }[] {
  const p = s.player;
  const out: { x: number; y: number }[] = [];
  for (let k = 0; k < 4; k++) {
    const dx = p.x + DX[k];
    const dy = p.y + DY[k];
    if (tileAt(s, dx, dy) !== 'door') continue;
    // Search the far side only: start past the door, never back through it.
    const fx = dx + DX[k];
    const fy = dy + DY[k];
    if (solid(tileAt(s, fx, fy)) && tileAt(s, fx, fy) !== 'door') continue;
    const seen = new Set<number>([idx(dx, dy), idx(fx, fy)]);
    let frontier = [[fx, fy]];
    let heard = false;
    for (let step = 1; step <= NOISE_RANGE && frontier.length && !heard; step++) {
      const next: number[][] = [];
      for (const [x, y] of frontier) {
        const m = monsterAt(s, x, y);
        if (m && !los(s, p.x, p.y, x, y)) {
          heard = true;
          break;
        }
        for (let j = 0; j < 4; j++) {
          const nx = x + DX[j];
          const ny = y + DY[j];
          const t = tileAt(s, nx, ny);
          if (!inside(nx, ny) || t === 'wall' || t === 'pillar' || seen.has(idx(nx, ny))) continue;
          seen.add(idx(nx, ny));
          next.push([nx, ny]);
        }
      }
      frontier = next;
    }
    if (heard) out.push({ x: dx, y: dy });
  }
  return out;
}

/** The foe in a front corner (ahead-left / ahead-right) that HIT reaches, if nothing is straight ahead. */
export function cornerFoe(s: GameState): Monster | null {
  const p = s.player;
  const fx = p.x + DX[p.dir];
  const fy = p.y + DY[p.dir];
  for (const turn of [3, 1]) {
    const sd = (p.dir + turn) % 4;
    const m = monsterAt(s, fx + DX[sd], fy + DY[sd]);
    if (!m) continue;
    // Not around a solid corner (a ghost inside a wall is fair game).
    const open = !solid(tileAt(s, fx, fy)) || !solid(tileAt(s, p.x + DX[sd], p.y + DY[sd]));
    if (open || MONSTERS[m.kind].ghost) return m;
  }
  return null;
}

/** The nearest live monster next to you (8 neighbours), for warnings. */
function adjacentFoe(s: GameState, x: number, y: number): Monster | null {
  for (const m of s.monsters) if (m.hp > 0 && Math.max(Math.abs(m.x - x), Math.abs(m.y - y)) === 1) return m;
  return null;
}

function use(s: GameState, ev: GameEvent[]): boolean {
  const p = s.player;
  const nx = p.x + DX[p.dir];
  const ny = p.y + DY[p.dir];
  const m = monsterAt(s, nx, ny);
  if (m) {
    attack(s, m, ev);
    return true;
  }
  const corner = cornerFoe(s);
  if (corner) {
    attack(s, corner, ev);
    return true;
  }
  if (tileAt(s, nx, ny) === 'door') {
    s.level.tiles[idx(nx, ny)] = 'open';
    say(s, 'The door creaks open.');
    ev.push({ type: 'door' });
    return true;
  }
  if (tileAt(s, nx, ny) === 'open') {
    // Never slam a door (and lose the turn) with a foe at your back or in the doorway.
    const near = adjacentFoe(s, p.x, p.y);
    const past = adjacentFoe(s, nx, ny);
    if (near || past) {
      const f = (near ?? past)!;
      sayOnce(s, near ? `${the(f.kind, true)} is right beside you. Turn to face it.` : `${the(f.kind, true)} is in the doorway. You can't shut it.`);
      ev.push({ type: 'bump', what: 'foe' });
      return false;
    }
    s.level.tiles[idx(nx, ny)] = 'door';
    say(s, 'You pull the door shut.');
    ev.push({ type: 'door' });
    return true;
  }
  sayOnce(s, 'You swing at nothing.');
  ev.push({ type: 'bump', what: 'air' });
  return false;
}

function attack(s: GameState, m: Monster, ev: GameEvent[]): void {
  const def = MONSTERS[m.kind];
  m.awake = true;
  if (roll(s) > 0.88) {
    say(s, `You miss ${the(m.kind)}.`);
    ev.push({ type: 'miss', target: m.id });
    return;
  }
  const crit = roll(s) < 0.1;
  let dmg = Math.max(1, attackOf(s) - def.def + rollInt(s, -1, 2));
  if (crit) dmg *= 2;
  ev.push({ type: 'hit', target: m.id, dmg, crit });
  damage(s, m, dmg, ev, crit ? 'A critical blow!' : '');
}

function damage(s: GameState, m: Monster, dmg: number, ev: GameEvent[], prefix = ''): void {
  const def = MONSTERS[m.kind];
  m.hp -= dmg;
  m.awake = true;
  if (m.hp > 0) {
    say(s, `${prefix ? prefix + ' ' : ''}You hit ${the(m.kind)} for ${dmg}.`);
    return;
  }
  s.kills++;
  say(s, `${prefix ? prefix + ' ' : ''}${the(m.kind, true)} falls.${def.xp ? ` +${def.xp} XP.` : ''}`);
  ev.push({ type: 'kill', kind: m.kind });
  if (m.kind === 'warden') {
    s.status = 'won';
    say(s, 'The Warden crumbles. The deep is quiet at last.');
    ev.push({ type: 'win' });
    return;
  }
  // A cutpurse drops what it took.
  if (m.loot) {
    s.items.push({ id: s.nextId++, kind: 'gold', x: m.x, y: m.y, value: m.loot });
    say(s, `Your ${m.loot} gold spills across the floor.`);
  }
  // Monsters sometimes leave something behind.
  else if (roll(s) < 0.18) {
    const kind = roll(s) < 0.6 ? 'potion' : 'gold';
    s.items.push({ id: s.nextId++, kind, x: m.x, y: m.y, value: kind === 'gold' ? rollInt(s, 3, 8) * s.depth : 0 });
  }
  gainXp(s, def.xp, ev);
}

function gainXp(s: GameState, xp: number, ev: GameEvent[]): void {
  const p = s.player;
  p.xp += xp;
  while (p.level < XP_TABLE.length && p.xp >= XP_TABLE[p.level]) {
    p.level++;
    p.maxHp += 6;
    p.hp += 6;
    p.maxMp += 2;
    p.mp += 2;
    p.baseAtk += 1;
    if (p.level % 2 === 0) p.baseDef += 1;
    say(s, `You reach level ${p.level}!`);
    for (const [id, sp] of Object.entries(SPELLS) as [SpellId, (typeof SPELLS)[SpellId]][])
      if (sp.level === p.level && !p.spells.includes(id)) {
        p.spells.push(id);
        say(s, `You learn ${sp.name}.`);
      }
    ev.push({ type: 'levelUp', level: p.level });
  }
}

function pickup(s: GameState, ev: GameEvent[]): void {
  const p = s.player;
  for (const it of s.items) {
    if (it.x !== p.x || it.y !== p.y) continue;
    it.x = -1;
    let text = '';
    switch (it.kind) {
      case 'potion':
        p.potions++;
        text = 'a healing potion';
        break;
      case 'ether':
        p.ethers++;
        text = 'an ether';
        break;
      case 'gold':
        p.gold += it.value;
        text = `${it.value} gold`;
        break;
      case 'map':
        p.scrolls++;
        text = isRevealed(s) ? 'a scroll of seeing (kept for later)' : 'a scroll of seeing (read it from the map)';
        break;
      case 'weapon':
        if (it.value > p.weapon) {
          p.weapon = it.value;
          text = `${article(WEAPONS[it.value])} (equipped)`;
        } else text = `${article(WEAPONS[it.value])} (${it.value === p.weapon ? 'same as yours' : 'you have better'})`;
        break;
      case 'armor':
        if (it.value > p.armor) {
          p.armor = it.value;
          text = `${ARMORS[it.value]} (equipped)`;
        } else text = `${ARMORS[it.value]} (${it.value === p.armor ? 'same as yours' : 'you have better'})`;
        break;
      default:
        text = 'something';
    }
    say(s, `You find ${text}.`);
    ev.push({ type: 'pickup', text });
  }
  s.items = s.items.filter((i) => i.x >= 0);
}

function descend(s: GameState, ev: GameEvent[]): void {
  enterFloor(s, s.depth + 1);
  const p = s.player;
  const healed = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.15)) - p.hp;
  p.hp += healed;
  say(s, s.depth === MAX_DEPTH ? 'The air is cold. Something vast waits ahead.' : `You descend to depth ${s.depth}.`);
  if (healed > 0) say(s, `You catch your breath on the stairs (+${healed} HP).`);
  ev.push({ type: 'descend', depth: s.depth });
  if (SHOP_DEPTHS.includes(s.depth)) {
    s.shop = stock(s);
    say(s, 'A hooded merchant waits at the foot of the stairs.');
    ev.push({ type: 'shop' });
  }
}

/** Cells a scroll of seeing shows: every walkable cell and the walls around it. */
function revealable(s: GameState, x: number, y: number): boolean {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inside(x + dx, y + dy) && s.level.tiles[idx(x + dx, y + dy)] !== 'wall') return true;
  return false;
}

/** Mark every walkable cell of the floor (and the walls around it) as seen. */
export function reveal(s: GameState): void {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (!s.level.seen[idx(x, y)] && revealable(s, x, y)) s.level.seen[idx(x, y)] = true;
}

/** Has the whole floor been seen already (so a scroll of seeing would show nothing new)? */
export function isRevealed(s: GameState): boolean {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (!s.level.seen[idx(x, y)] && s.level.tiles[idx(x, y)] !== 'wall') return false;
  return true;
}

// ---------- the merchant ----------

/** The stall's wares for this depth (fixed by seed and depth). */
export function stock(s: GameState): Offer[] {
  const d = s.depth;
  const rng = new Rng(mixSeed(s.seed, 777 + d));
  const tier = Math.min(4, Math.floor(d / 2.5) + 1);
  const gear = rng.next() < 0.5 ? 'weapon' : 'armor';
  return [
    { kind: 'potion', value: 0, price: 40 + 8 * d, sold: false },
    rng.next() < 0.5 ? { kind: 'ether', value: 0, price: 30 + 5 * d, sold: false } : { kind: 'map', value: 0, price: 15 + 3 * d, sold: false },
    { kind: gear, value: tier, price: GEAR_PRICE[tier] + 15 * d, sold: false },
    { kind: 'vigor', value: VIGOR_HP, price: 90 + 15 * d, sold: false },
  ];
}

export function offerName(o: Offer): string {
  switch (o.kind) {
    case 'potion':
      return 'Healing potion';
    case 'ether':
      return 'Ether';
    case 'map':
      return 'Scroll of seeing';
    case 'weapon':
      return WEAPONS[o.value];
    case 'armor':
      return ARMORS[o.value];
    case 'vigor':
      return `Vigor draught (+${o.value} max HP)`;
  }
}

export function canBuy(s: GameState, o: Offer | undefined): boolean {
  if (!o || o.sold || s.player.gold < o.price) return false;
  if (o.kind === 'weapon') return o.value > s.player.weapon;
  if (o.kind === 'armor') return o.value > s.player.armor;
  return true;
}

function buy(s: GameState, o: Offer, ev: GameEvent[]): void {
  const p = s.player;
  p.gold -= o.price;
  o.sold = true;
  switch (o.kind) {
    case 'potion':
      p.potions++;
      break;
    case 'ether':
      p.ethers++;
      break;
    case 'map':
      p.scrolls++;
      break;
    case 'weapon':
      p.weapon = o.value;
      break;
    case 'armor':
      p.armor = o.value;
      break;
    case 'vigor':
      p.maxHp += o.value;
      p.hp += o.value;
      break;
  }
  say(s, `You buy ${offerName(o).replace(/ \(.*\)$/, '')} for ${o.price} gold.`);
  ev.push({ type: 'buy', kind: o.kind });
}

/** A run's score: experience, depth reached, and a bonus for beating the Warden. */
export function runScore(s: GameState): number {
  return s.player.xp + s.depth * 100 + s.kills * 5 + (s.status === 'won' ? 2000 : 0);
}

/** The first monster in a straight line ahead, within range, before any wall. */
function firstAhead(s: GameState, range: number): { m: Monster | null; dist: number } {
  const p = s.player;
  for (let d = 1; d <= range; d++) {
    const x = p.x + DX[p.dir] * d;
    const y = p.y + DY[p.dir] * d;
    const m = monsterAt(s, x, y);
    if (m) return { m, dist: d };
    if (opaqueTile(tileAt(s, x, y))) return { m: null, dist: d - 1 };
  }
  return { m: null, dist: range };
}

function cast(s: GameState, spell: SpellId, ev: GameEvent[]): void {
  const p = s.player;
  p.mp -= SPELLS[spell].cost;
  if (spell === 'heal') {
    const heal = Math.min(p.maxHp - p.hp, Math.ceil(p.maxHp * 0.5));
    p.hp += heal;
    say(s, `Warm light knits your wounds. +${heal} HP.`);
    return;
  }
  if (spell === 'blink') {
    let d = 0;
    for (let i = 1; i <= 4; i++) {
      const x = p.x + DX[p.dir] * i;
      const y = p.y + DY[p.dir] * i;
      if (solid(tileAt(s, x, y)) || monsterAt(s, x, y)) break;
      d = i;
    }
    p.x += DX[p.dir] * d;
    p.y += DY[p.dir] * d;
    say(s, d ? 'You blink forward.' : 'The spell fizzles against the wall.');
    ev.push({ type: 'bolt', spell, dist: d });
    if (d) pickup(s, ev);
    if (tileAt(s, p.x, p.y) === 'stairs') descend(s, ev);
    return;
  }
  const { m, dist } = firstAhead(s, 8);
  ev.push({ type: 'bolt', spell, dist });
  if (!m) {
    say(s, 'The spell splashes against stone.');
    return;
  }
  if (spell === 'fire') damage(s, m, fireDamage(p.level), ev, 'Fire engulfs it!');
  else {
    // The Warden shakes frost off after one turn (otherwise it could be frozen forever).
    m.stun = m.kind === 'warden' ? 1 : 3;
    damage(s, m, 3 + p.level, ev, 'Frost locks it in place!');
  }
}

// ---------- monsters ----------

function monsterTurn(s: GameState, ev: GameEvent[]): void {
  const p = s.player;
  let dist: Int16Array | null = null;
  for (const m of s.monsters) {
    if (m.hp <= 0 || s.status !== 'playing') continue;
    const def = MONSTERS[m.kind];
    const d = Math.abs(m.x - p.x) + Math.abs(m.y - p.y);
    if (!m.awake) {
      // Noticing you costs a sleeping monster its turn (so opening a door is never an instant ambush).
      if (d <= SIGHT && los(s, m.x, m.y, p.x, p.y)) m.awake = true;
      continue;
    }
    if (m.stun > 0) {
      m.stun--;
      continue;
    }
    if (m.wait > 0) {
      m.wait--;
      continue;
    }
    m.wait = def.slow;
    const charged = !m.cd;
    if (m.cd) m.cd--;

    // Boss: every few turns, raise a skeleton.
    if (m.kind === 'warden' && s.turn % 7 === 0 && s.monsters.filter((o) => o.hp > 0).length < 8) {
      const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !solid(tileAt(s, m.x + dx, m.y + dy)) && !monsterAt(s, m.x + dx, m.y + dy) && (m.x + dx !== p.x || m.y + dy !== p.y));
      if (spot) {
        s.monsters.push({ id: s.nextId++, kind: 'skeleton', x: m.x + spot[0], y: m.y + spot[1], hp: MONSTERS.skeleton.hp, maxHp: MONSTERS.skeleton.hp, wait: 1, awake: true, stun: 0 });
        say(s, 'The Warden raises the dead!');
        continue;
      }
    }

    // A cutpurse with your gold runs for it.
    const fleeing = !!m.loot;
    if (d === 1 && !fleeing) {
      if (hurt(s, m, def.atk, ev) && m.kind === 'thief' && s.status === 'playing') {
        const take = Math.min(s.player.gold, THEFT_PER_DEPTH * s.depth);
        if (take > 0) {
          s.player.gold -= take;
          m.loot = take;
          say(s, `The cutpurse snatches ${take} gold!`);
          ev.push({ type: 'stolen', gold: take });
        }
      }
      continue;
    }
    // Ranged: shoot along a clear straight line.
    const inLine = def.range && (m.x === p.x || m.y === p.y) && d <= def.range && los(s, m.x, m.y, p.x, p.y) && !monsterBetween(s, m);
    if (inLine && !charged) {
      // A cultist gathers flame for a turn after each firebolt: a tell to step out of line.
      say(s, `${the(m.kind, true)} gathers flame.`);
      continue;
    }
    if (inLine && roll(s) < 0.7) {
      ev.push({ type: 'shot', by: m.kind });
      hurt(s, m, def.atk, ev, m.kind === 'mage' ? 'A firebolt' : m.kind === 'warden' ? 'A wave of grave-cold' : 'An arrow');
      if (m.kind === 'mage') m.cd = 1;
      continue;
    }
    // Move: erratic flutter, ghosts beeline through walls, others path around.
    // Hunters try their best step first, then an equally good one if a monster blocks it.
    const steps: [number, number][] = [];
    if (def.erratic && roll(s) < def.erratic) {
      const k = rollInt(s, 0, 3);
      steps.push([DX[k], DY[k]]);
    } else if (def.ghost) {
      const sx: [number, number] = [Math.sign(p.x - m.x), 0];
      const sy: [number, number] = [0, Math.sign(p.y - m.y)];
      const xFirst = Math.abs(p.x - m.x) > Math.abs(p.y - m.y);
      for (const st of xFirst ? [sx, sy] : [sy, sx]) if (st[0] || st[1]) steps.push(st);
    } else {
      dist ??= distances(s.level.tiles.map((t) => (t === 'door' ? 'floor' : t)), p);
      const here = dist[idx(m.x, m.y)];
      const opts: { k: number; nd: number }[] = [];
      for (let k = 0; k < 4; k++) {
        const nx = m.x + DX[k];
        const ny = m.y + DY[k];
        const nd = inside(nx, ny) ? dist[idx(nx, ny)] : -1;
        if (nd >= 0 && (fleeing ? nd > here : here < 0 || nd < here)) opts.push({ k, nd });
      }
      opts.sort((a, b) => (fleeing ? b.nd - a.nd : a.nd - b.nd));
      for (const o of opts) steps.push([DX[o.k], DY[o.k]]);
    }
    const step = steps.find(([sx, sy]) => {
      const x = m.x + sx;
      const y = m.y + sy;
      return inside(x, y) && !(x === p.x && y === p.y) && !monsterAt(s, x, y) && !(def.ghost && (x <= 0 || y <= 0 || x >= SIZE - 1 || y >= SIZE - 1));
    });
    if (!step) continue;
    const nx = m.x + step[0];
    const ny = m.y + step[1];
    const t = tileAt(s, nx, ny);
    if (t === 'door' && !def.ghost) {
      s.level.tiles[idx(nx, ny)] = 'open';
      continue;
    }
    if (!def.ghost && solid(t)) continue;
    m.x = nx;
    m.y = ny;
    // Out of sight with your gold, a cutpurse slips away for good.
    if (fleeing && Math.abs(m.x - p.x) + Math.abs(m.y - p.y) >= 4 && !los(s, m.x, m.y, p.x, p.y)) {
      m.hp = 0;
      say(s, 'Coins jingle away into the dark. The cutpurse is gone.');
    }
  }
}

/** Another monster standing on the straight line between m and the player (it would take the shot). */
function monsterBetween(s: GameState, m: Monster): boolean {
  const p = s.player;
  const sx = Math.sign(p.x - m.x);
  const sy = Math.sign(p.y - m.y);
  for (let x = m.x + sx, y = m.y + sy; x !== p.x || y !== p.y; x += sx, y += sy) if (monsterAt(s, x, y)) return true;
  return false;
}

/** A monster's blow at the player; true if it landed. */
function hurt(s: GameState, m: Monster, atk: number, ev: GameEvent[], what = ''): boolean {
  if (roll(s) > 0.8) {
    say(s, `${what || the(m.kind, true)} misses you.`);
    return false;
  }
  const dmg = Math.max(1, atk - defenceOf(s) + rollInt(s, -1, 1));
  s.player.hp -= dmg;
  say(s, `${what || the(m.kind, true)} hits you for ${dmg}.`);
  ev.push({ type: 'hurt', dmg, by: m.kind });
  if (s.player.hp <= 0) {
    s.player.hp = 0;
    s.status = 'dead';
    s.killer = m.kind;
    say(s, 'You die in the dark.');
    ev.push({ type: 'death' });
  }
  return true;
}

// ---------- setup ----------

function enterFloor(s: GameState, depth: number): void {
  const f = generateFloor(s.seed, depth);
  s.depth = depth;
  s.level = f.level;
  s.player.x = f.start.x;
  s.player.y = f.start.y;
  s.monsters = f.monsters.map((m) => ({ ...m, id: s.nextId++ }));
  s.items = f.items.map((i) => ({ ...i, id: s.nextId++ }));
  // Face the most open direction.
  let best: Dir = 0;
  let run = -1;
  for (let k = 0; k < 4; k++) {
    let n = 0;
    while (!solid(tileAt(s, s.player.x + DX[k] * (n + 1), s.player.y + DY[k] * (n + 1))) && n < 10) n++;
    if (n > run) {
      run = n;
      best = k as Dir;
    }
  }
  s.player.dir = best;
}

export function newGame(seed: number): GameState {
  const s: GameState = {
    seed,
    depth: 1,
    turn: 0,
    rolls: 0,
    level: { w: SIZE, h: SIZE, tiles: [], seen: [] },
    player: { x: 0, y: 0, dir: 0, hp: 30, maxHp: 30, mp: 6, maxMp: 6, level: 1, xp: 0, baseAtk: 4, baseDef: 0, weapon: 0, armor: 0, gold: 0, potions: 2, ethers: 1, scrolls: 0, spells: ['fire'] },
    monsters: [],
    items: [],
    nextId: 1,
    log: ['You descend into the dark with a torch and a dagger.'],
    status: 'playing',
    kills: 0,
    shop: null,
    killer: null,
  };
  enterFloor(s, 1);
  markSeen(s);
  return s;
}
