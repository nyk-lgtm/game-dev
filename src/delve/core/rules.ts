// Delve rules. Pure and deterministic: (state, action) -> (state, events).
// Turning is free; moving, attacking, casting and drinking take a turn,
// after which every awake monster acts.

import { Rng, mixSeed } from '../../shared/rng';
import { ARMORS, ARMOR_DEF, ETHER_MP, MAX_DEPTH, MONSTERS, POTION_HEAL, SPELLS, WEAPONS, WEAPON_ATK, XP_TABLE, fireDamage } from './content';
import { SIZE, distances, generateFloor } from './gen';
import { DX, DY, type Action, type Dir, type GameEvent, type GameState, type Monster, type SpellId, type StepResult, type Tile } from './types';

const LOG_MAX = 30;
export const SIGHT = 7;
export const MP_REGEN_EVERY = 6;

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
function say(s: GameState, text: string): void {
  s.log.push(text);
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
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
  switch (a.type) {
    case 'potion':
      return p.potions > 0 && p.hp < p.maxHp;
    case 'ether':
      return p.ethers > 0 && p.mp < p.maxMp;
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
    case 'cast':
      cast(s, a.spell, ev);
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
      ev.push({ type: 'bump' });
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
    ev.push({ type: 'bump' });
    return false;
  }
  p.x = nx;
  p.y = ny;
  ev.push({ type: 'move' });
  pickup(s, ev);
  if (t === 'stairs') descend(s, ev);
  return true;
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
  if (tileAt(s, nx, ny) === 'door') {
    s.level.tiles[idx(nx, ny)] = 'open';
    ev.push({ type: 'door' });
    return true;
  }
  if (tileAt(s, nx, ny) === 'open') {
    s.level.tiles[idx(nx, ny)] = 'door';
    say(s, 'You pull the door shut.');
    ev.push({ type: 'door' });
    return true;
  }
  ev.push({ type: 'bump' });
  return false;
}

function attack(s: GameState, m: Monster, ev: GameEvent[]): void {
  const def = MONSTERS[m.kind];
  m.awake = true;
  if (roll(s) > 0.88) {
    say(s, `You miss the ${def.name.toLowerCase()}.`);
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
    say(s, `${prefix ? prefix + ' ' : ''}You hit the ${def.name.toLowerCase()} for ${dmg}.`);
    return;
  }
  s.kills++;
  say(s, `${prefix ? prefix + ' ' : ''}The ${def.name.toLowerCase()} falls. +${def.xp} XP.`);
  ev.push({ type: 'kill', kind: m.kind });
  if (m.kind === 'warden') {
    s.status = 'won';
    say(s, 'The Warden crumbles. The deep is quiet at last.');
    ev.push({ type: 'win' });
    return;
  }
  // Monsters sometimes leave something behind.
  if (roll(s) < 0.18) {
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
      case 'weapon':
        if (it.value > p.weapon) {
          p.weapon = it.value;
          text = `a ${WEAPONS[it.value]} (equipped)`;
        } else text = `a ${WEAPONS[it.value]} (you have better)`;
        break;
      case 'armor':
        if (it.value > p.armor) {
          p.armor = it.value;
          text = `${ARMORS[it.value]} (equipped)`;
        } else text = `${ARMORS[it.value]} (you have better)`;
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
  p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.15));
  say(s, s.depth === MAX_DEPTH ? 'The air is cold. Something vast waits ahead.' : `You descend to depth ${s.depth}.`);
  ev.push({ type: 'descend', depth: s.depth });
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
    m.stun = 3;
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
    if (!m.awake && d <= SIGHT && los(s, m.x, m.y, p.x, p.y)) m.awake = true;
    if (!m.awake) continue;
    if (m.stun > 0) {
      m.stun--;
      continue;
    }
    if (m.wait > 0) {
      m.wait--;
      continue;
    }
    m.wait = def.slow;

    // Boss: every few turns, raise a skeleton.
    if (m.kind === 'warden' && s.turn % 7 === 0 && s.monsters.filter((o) => o.hp > 0).length < 8) {
      const spot = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => !solid(tileAt(s, m.x + dx, m.y + dy)) && !monsterAt(s, m.x + dx, m.y + dy) && (m.x + dx !== p.x || m.y + dy !== p.y));
      if (spot) {
        s.monsters.push({ id: s.nextId++, kind: 'skeleton', x: m.x + spot[0], y: m.y + spot[1], hp: 16, maxHp: 16, wait: 1, awake: true, stun: 0 });
        say(s, 'The Warden raises the dead!');
        continue;
      }
    }

    if (d === 1) {
      hurt(s, m, def.atk, ev);
      continue;
    }
    // Ranged: shoot along a clear straight line.
    if (def.range && (m.x === p.x || m.y === p.y) && d <= def.range && los(s, m.x, m.y, p.x, p.y) && roll(s) < 0.7) {
      ev.push({ type: 'shot', by: m.kind });
      hurt(s, m, def.atk, ev, m.kind === 'mage' ? 'A firebolt' : m.kind === 'warden' ? 'A wave of grave-cold' : 'An arrow');
      continue;
    }
    // Move: erratic flutter, ghosts beeline through walls, others path around.
    let step: [number, number] | null = null;
    if (def.erratic && roll(s) < def.erratic) {
      const k = rollInt(s, 0, 3);
      step = [DX[k], DY[k]];
    } else if (def.ghost) {
      step = Math.abs(p.x - m.x) > Math.abs(p.y - m.y) ? [Math.sign(p.x - m.x), 0] : [0, Math.sign(p.y - m.y)];
    } else {
      dist ??= distances(s.level.tiles.map((t) => (t === 'door' ? 'floor' : t)), p);
      let best = dist[idx(m.x, m.y)];
      for (let k = 0; k < 4; k++) {
        const nx = m.x + DX[k];
        const ny = m.y + DY[k];
        const nd = inside(nx, ny) ? dist[idx(nx, ny)] : -1;
        if (nd >= 0 && (best < 0 || nd < best)) {
          best = nd;
          step = [DX[k], DY[k]];
        }
      }
    }
    if (!step) continue;
    const nx = m.x + step[0];
    const ny = m.y + step[1];
    if ((nx === p.x && ny === p.y) || monsterAt(s, nx, ny) || !inside(nx, ny)) continue;
    const t = tileAt(s, nx, ny);
    if (t === 'door' && !def.ghost) {
      s.level.tiles[idx(nx, ny)] = 'open';
      continue;
    }
    if (!def.ghost && solid(t)) continue;
    if (def.ghost && (nx <= 0 || ny <= 0 || nx >= SIZE - 1 || ny >= SIZE - 1)) continue;
    m.x = nx;
    m.y = ny;
  }
}

function hurt(s: GameState, m: Monster, atk: number, ev: GameEvent[], what = ''): void {
  const def = MONSTERS[m.kind];
  if (roll(s) > 0.8) {
    say(s, `${what || `The ${def.name.toLowerCase()}`} misses you.`);
    return;
  }
  const dmg = Math.max(1, atk - defenceOf(s) + rollInt(s, -1, 1));
  s.player.hp -= dmg;
  say(s, `${what || `The ${def.name.toLowerCase()}`} hits you for ${dmg}.`);
  ev.push({ type: 'hurt', dmg, by: m.kind });
  if (s.player.hp <= 0) {
    s.player.hp = 0;
    s.status = 'dead';
    say(s, 'You die in the dark.');
    ev.push({ type: 'death' });
  }
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
    player: { x: 0, y: 0, dir: 0, hp: 30, maxHp: 30, mp: 6, maxMp: 6, level: 1, xp: 0, baseAtk: 4, baseDef: 0, weapon: 0, armor: 0, gold: 0, potions: 2, ethers: 1, spells: ['fire'] },
    monsters: [],
    items: [],
    nextId: 1,
    log: ['You descend into the dark with a torch and a dagger.'],
    status: 'playing',
    kills: 0,
  };
  enterFloor(s, 1);
  markSeen(s);
  return s;
}
