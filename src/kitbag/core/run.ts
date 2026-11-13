// A Kitbag run: a 12-floor map of fights, rests and shrines with a boss on top.
// Each turn you roll your dice and place them into the action slots of your gear.
// Pure and deterministic: a run is its seed plus the action list, and replay()
// rebuilds it exactly. Actions:
//   M<k>             pick node k (0 or 1) on the next floor of the map
//   P<die>.<card>.<slot>  place a rolled die into a gear slot
//   U                undo the last placement this turn
//   E                end the turn (the enemy acts)
//   C<k>[.<r>]       take option k of a reward/rest/shrine (r: gear card it replaces when the kit is full)
//   S                skip a reward
//   X                give up

import { Rng, mixSeed } from '../../shared/rng';
import { enemiesOfTier, enemyDef, type Intent } from './enemies';
import {
  GEAR,
  diceFor,
  dieDef,
  meets,
  slotsOf,
  type Die,
  type DieKind,
  type Gear,
  type GearId,
} from './gear';

export const RULES_VERSION = 1;
export const FLOORS = 12;
export const START_HP = 40;
export const MAX_GEAR = 6;
export const MAX_DICE = 5;
export const WIN_BONUS = 1000;
/** Numbers a balance probe may tweak. */
export const TUNE = {
  /** Enemy hit points ×. */
  hp: 1,
  /** Enemy damage ×. */
  dmg: 1,
  /** Heal from a reward. */
  heal: 12,
  /** Share of max HP a rest heals. */
  rest: 0.35,
};

export type NodeKind = 'fight' | 'elite' | 'rest' | 'shrine' | 'boss';
export interface MapNode {
  kind: NodeKind;
  /** Enemy id for fights. */
  foe?: string;
}

export interface PoolDie {
  v: number;
  /** Index into the player's dice, or -1 for a half split off another die. */
  src: number;
  used: boolean;
  locked: boolean;
}

export interface SlotState {
  /** Uses this turn. */
  used: number;
  /** Uses this fight. */
  fight: number;
  /** Pool index of the first die of a two-dice slot, waiting for its partner. */
  held: number;
  /** Powder Keg fuse. */
  fuse: number;
  /** Dice values placed here this turn (for display). */
  vals: number[];
}

export interface Enemy {
  id: string;
  hp: number;
  max: number;
  block: number;
  poison: number;
  str: number;
  /** Index of the current intent in the pattern. */
  step: number;
  stunned: boolean;
}

export interface Fight {
  enemy: Enemy;
  elite: boolean;
  boss: boolean;
  turn: number;
  pool: PoolDie[];
  slots: SlotState[][];
  rerolls: number;
  /** Curses that land on your next roll. */
  hexNext: number;
  witherNext: number;
  /** Dice hexed / withered this turn (for the UI). */
  hexed: number;
  withered: number;
}

export type Gift =
  | { t: 'gear'; id: GearId }
  | { t: 'up'; card: number }
  | { t: 'die'; kind: DieKind }
  | { t: 'hone'; die: number }
  | { t: 'heal'; n: number }
  | { t: 'maxhp'; n: number };

export interface Option {
  /** HP paid for it (shrines). */
  cost: number;
  gifts: Gift[];
  /** Shrine flavour line. */
  label?: string;
}

export interface Choice {
  kind: 'reward' | 'rest' | 'shrine';
  options: Option[];
  /** Picks left after this one (elites give two). */
  more: number;
  /** Seed tag so a second pick gets fresh options. */
  pick: number;
}

export interface Stats {
  fights: number;
  turns: number;
  dealt: number;
  taken: number;
  biggest: number;
  blocked: number;
}

export interface Run {
  seed: number;
  actions: string[];
  phase: 'map' | 'fight' | 'choice' | 'over';
  map: MapNode[][];
  /** Chosen node on each floor so far. */
  path: number[];
  /** Floors completed. */
  floor: number;
  hp: number;
  maxHp: number;
  block: number;
  poison: number;
  dice: Die[];
  gear: Gear[];
  fight: Fight | null;
  choice: Choice | null;
  /** Snapshots for undo within the current turn. */
  hist: string[];
  score: number;
  won: boolean;
  /** What ended the run. */
  killedBy: string | null;
  stats: Stats;
}

// ---------------------------------------------------------------- map

/** Enemy tier for an ordinary fight on floor f (0-based). */
export const stageOf = (f: number): 1 | 2 | 3 => (f < 4 ? 1 : f < 8 ? 2 : 3);

export function makeMap(seed: number): MapNode[][] {
  const rng = new Rng(mixSeed(seed, 0x6d6170));
  const map: MapNode[][] = [];
  const foe = (t: number, avoid: string[]) => {
    const pool = enemiesOfTier(t).filter((e) => !avoid.includes(e.id));
    return rng.pick(pool.length ? pool : enemiesOfTier(t)).id;
  };
  const recent: string[] = [];
  for (let f = 0; f < FLOORS; f++) {
    let kinds: NodeKind[];
    if (f === FLOORS - 1) kinds = ['boss'];
    else if (f < 2) kinds = ['fight', 'fight'];
    else if (f === 5) kinds = ['rest', 'shrine'];
    else if (f === FLOORS - 2) kinds = ['rest', rng.next() < 0.5 ? 'shrine' : 'elite'];
    else {
      const roll = (): NodeKind => {
        const x = rng.next();
        return x < 0.5 ? 'fight' : x < 0.72 ? 'elite' : x < 0.86 ? 'rest' : 'shrine';
      };
      const a = roll();
      let b = roll();
      for (let k = 0; k < 4 && b === a && a !== 'fight'; k++) b = roll();
      // Every floor offers a fight or an elite, so a run can't dodge them all.
      if (a !== 'fight' && a !== 'elite' && b !== 'fight' && b !== 'elite') b = 'fight';
      kinds = [a, b];
    }
    const row: MapNode[] = kinds.map((k) => {
      if (k === 'fight') {
        const id = foe(stageOf(f), recent);
        recent.push(id);
        if (recent.length > 3) recent.shift();
        return { kind: k, foe: id };
      }
      if (k === 'elite') return { kind: k, foe: enemiesOfTier(3 + stageOf(f))[0].id };
      if (k === 'boss') return { kind: k, foe: 'house' };
      return { kind: k };
    });
    map.push(row);
  }
  return map;
}

// ---------------------------------------------------------------- run setup

export function newRun(seed: number): Run {
  const d6 = (): Die => ({ kind: 'd6', faces: dieDef('d6').faces.slice() });
  return {
    seed,
    actions: [],
    phase: 'map',
    map: makeMap(seed),
    path: [],
    floor: 0,
    hp: START_HP,
    maxHp: START_HP,
    block: 0,
    poison: 0,
    dice: [d6(), d6(), d6()],
    gear: [
      { id: 'sword', up: false },
      { id: 'buckler', up: false },
      { id: 'dagger', up: false },
    ],
    fight: null,
    choice: null,
    hist: [],
    score: 0,
    won: false,
    killedBy: null,
    stats: { fights: 0, turns: 0, dealt: 0, taken: 0, biggest: 0, blocked: 0 },
  };
}

export const intentOf = (e: Enemy): Intent => {
  const p = enemyDef(e.id).pattern;
  return p[e.step % p.length];
};
/** The intent after the current one (shown while an enemy winds up). */
export const nextIntentOf = (e: Enemy): Intent => {
  const p = enemyDef(e.id).pattern;
  return p[(e.step + 1) % p.length];
};
/** Damage of one hit of an intent, after strength and tuning. */
export const hitOf = (e: Enemy, it: Intent): number => (it.atk ? Math.max(0, Math.round(it.atk * TUNE.dmg) + e.str) : 0);
/** Total damage an intent would deal before block. */
export const attackOf = (e: Enemy, it: Intent): number => hitOf(e, it) * (it.atk ? (it.hits ?? 1) : 0);

function startFight(r: Run, node: MapNode): void {
  const def = enemyDef(node.foe!);
  const rng = new Rng(mixSeed(r.seed, 0x66000 + r.floor));
  const elite = node.kind === 'elite';
  const boss = node.kind === 'boss';
  const max = Math.round(def.hp * TUNE.hp);
  r.fight = {
    enemy: { id: def.id, hp: max, max, block: 0, poison: 0, str: 0, step: boss ? 0 : rng.int(0, def.pattern.length - 1), stunned: false },
    elite,
    boss,
    turn: 0,
    pool: [],
    slots: r.gear.map((g) => slotsOf(g).map(() => ({ used: 0, fight: 0, held: -1, fuse: 0, vals: [] as number[] }))),
    rerolls: 0,
    hexNext: 0,
    witherNext: 0,
    hexed: 0,
    withered: 0,
  };
  // A wind-up as the opening move would be a free turn; start on the blow's neighbour instead.
  if (!boss && intentOf(r.fight.enemy).charge) r.fight.enemy.step = (r.fight.enemy.step + 2) % def.pattern.length;
  r.phase = 'fight';
  r.block = 0;
  r.poison = 0;
  r.stats.fights++;
  startTurn(r);
}

/** Rolls a die's faces with the given rng. */
const rollDie = (d: Die | undefined, rng: Rng): number => (d ? d.faces[rng.int(0, d.faces.length - 1)] : rng.int(1, 6));

function startTurn(r: Run): void {
  const f = r.fight!;
  f.turn++;
  r.stats.turns++;
  r.block = 0;
  r.hist = [];
  if (r.poison > 0) {
    hurtPlayer(r, r.poison, `${enemyDef(f.enemy.id).name} (poison)`);
    r.poison--;
    if (r.phase === 'over') return;
  }
  const rng = new Rng(mixSeed(r.seed, mixSeed(r.floor, f.turn)));
  f.pool = r.dice.map((d, i) => ({ v: rollDie(d, rng), src: i, used: false, locked: false }));
  f.withered = f.witherNext;
  if (f.witherNext) for (const p of f.pool) p.v = Math.max(1, p.v - f.witherNext);
  // Hex locks the highest dice (ties: the later die).
  f.hexed = Math.min(f.hexNext, f.pool.length - 1);
  for (let k = 0; k < f.hexed; k++) {
    let best = -1;
    f.pool.forEach((p, i) => {
      if (!p.locked && (best < 0 || p.v >= f.pool[best].v)) best = i;
    });
    f.pool[best].locked = true;
  }
  f.hexNext = 0;
  f.witherNext = 0;
  for (const row of f.slots) for (const s of row) {
    s.used = 0;
    s.held = -1;
    s.vals = [];
  }
}

function hurtPlayer(r: Run, n: number, by: string): void {
  if (n <= 0) return;
  r.hp -= n;
  r.stats.taken += n;
  if (r.hp <= 0) {
    r.hp = 0;
    r.phase = 'over';
    r.killedBy = by;
    r.fight && (r.hist = []);
  }
}

/** Damage to the enemy; returns hit points it lost. */
function hurtEnemy(r: Run, n: number, pierce: boolean): number {
  const e = r.fight!.enemy;
  if (!pierce) {
    const soak = Math.min(e.block, n);
    e.block -= soak;
    n -= soak;
  }
  const lost = Math.min(e.hp, n);
  e.hp -= lost;
  r.stats.dealt += lost;
  return lost;
}

// ---------------------------------------------------------------- placing dice

export interface SlotRef {
  card: number;
  slot: number;
}

/** Why a die can't go into a slot, or null if it can. */
export function placeError(r: Run, die: number, card: number, slot: number): string | null {
  const f = r.fight;
  if (r.phase !== 'fight' || !f) return 'not in a fight';
  const p = f.pool[die];
  if (!p) return 'no such die';
  if (p.used) return 'that die is used';
  if (p.locked) return 'that die is hexed';
  const g = r.gear[card];
  const def = g && slotsOf(g)[slot];
  if (!def) return 'no such slot';
  const st = f.slots[card][slot];
  if (def.uses && st.used >= def.uses) return 'used this turn';
  if (def.perFight && st.fight >= def.perFight) return def.perFight === 1 ? 'once a fight' : 'used up this fight';
  if (!meets(def.need, p.v)) return 'doesn’t fit';
  if (def.fx === 'split' && p.v < 2) return 'can’t split a 1';
  if (diceFor(def.need) === 2) {
    if (st.held >= 0) {
      if (def.need === 'pair' && f.pool[st.held].v !== p.v) return `needs another ${f.pool[st.held].v}`;
    } else {
      // The first die waits for a partner, so one must be there.
      const partner = f.pool.some((q, i) => i !== die && !q.used && !q.locked && (def.need !== 'pair' || q.v === p.v));
      if (!partner) return def.need === 'pair' ? 'no matching die' : 'needs a second die';
    }
  }
  return null;
}

export interface Effect {
  /** Damage dealt to hit points. */
  dmg: number;
  /** Damage soaked by enemy block. */
  soaked: number;
  block: number;
  heal: number;
  poison: number;
  stun: boolean;
  /** The die that came back (reroll/flip/bump) or the halves (split). */
  back: number[];
  /** Powder Keg went off. */
  boom: boolean;
  /** First die of a two-dice slot: waiting for its partner. */
  waiting: boolean;
  killed: boolean;
}

const noEffect = (): Effect => ({ dmg: 0, soaked: 0, block: 0, heal: 0, poison: 0, stun: false, back: [], boom: false, waiting: false, killed: false });

/** Applies a placement (already checked) and returns what happened. */
function applyPlace(r: Run, die: number, card: number, slot: number): Effect {
  const f = r.fight!;
  const p = f.pool[die];
  const def = slotsOf(r.gear[card])[slot];
  const st = f.slots[card][slot];
  const out = noEffect();
  p.used = true;
  st.vals.push(p.v);
  let x = p.v;
  if (diceFor(def.need) === 2) {
    if (st.held < 0) {
      st.held = die;
      out.waiting = true;
      return out;
    }
    x += f.pool[st.held].v;
    st.held = -1;
  }
  st.used++;
  st.fight++;
  const e = f.enemy;
  const amount = Math.floor(def.mult * x) + def.add;
  const deal = (n: number, pierce: boolean) => {
    const before = e.block;
    const lost = hurtEnemy(r, n, pierce);
    out.dmg += lost;
    out.soaked += pierce ? 0 : Math.min(before, n);
    r.stats.biggest = Math.max(r.stats.biggest, lost);
  };
  const giveBack = (v: number, src: number) => {
    f.pool.push({ v, src, used: false, locked: false });
    out.back.push(v);
  };
  switch (def.fx) {
    case 'dmg':
      deal(amount, false);
      break;
    case 'pierce':
      deal(amount, true);
      break;
    case 'block':
      r.block += amount;
      out.block = amount;
      break;
    case 'spike':
      r.block += def.mult * x;
      out.block = def.mult * x;
      deal(def.add, false);
      break;
    case 'heal': {
      const h = Math.min(amount, r.maxHp - r.hp);
      r.hp += h;
      out.heal = h;
      break;
    }
    case 'poison': {
      const n = Math.ceil(def.mult * x) + def.add;
      e.poison += n;
      out.poison = n;
      break;
    }
    case 'reroll': {
      const rng = new Rng(mixSeed(r.seed, mixSeed(0x7272 + r.floor, f.turn * 64 + f.rerolls++)));
      giveBack(rollDie(r.dice[p.src], rng), p.src);
      break;
    }
    case 'split':
      giveBack(Math.floor(x / 2), -1);
      giveBack(Math.ceil(x / 2), -1);
      break;
    case 'flip':
      giveBack(Math.min(6, Math.max(1, 7 - x)), p.src);
      break;
    case 'bump':
      giveBack(Math.min(9, x + def.add), p.src);
      break;
    case 'stun':
      e.stunned = true;
      out.stun = true;
      break;
    case 'keg':
      st.fuse += x;
      if (st.fuse >= def.fuse!) {
        st.fuse = 0;
        out.boom = true;
        deal(def.add, true);
      }
      break;
  }
  if (e.hp <= 0) out.killed = true;
  return out;
}

/** What placing this die would do, without doing it (for previews). Null if it can't go there. */
export function previewPlace(r: Run, die: number, card: number, slot: number): Effect | null {
  if (placeError(r, die, card, slot)) return null;
  const c = cloneRun(r);
  // Previews never consume the real reroll sequence; the clone's copy is discarded anyway.
  return applyPlace(c, die, card, slot);
}

// ---------------------------------------------------------------- enemy turn

function enemyTurn(r: Run): void {
  const f = r.fight!;
  const e = f.enemy;
  e.block = 0;
  if (e.poison > 0) {
    const lost = Math.min(e.hp, e.poison);
    e.hp -= lost;
    r.stats.dealt += lost;
    e.poison--;
    if (e.hp <= 0) return winFight(r);
  }
  const it = intentOf(e);
  const name = enemyDef(e.id).name;
  if (e.stunned) e.stunned = false;
  else {
    if (it.atk) {
      const hit = hitOf(e, it);
      for (let k = 0; k < (it.hits ?? 1); k++) {
        const soak = Math.min(r.block, hit);
        r.block -= soak;
        r.stats.blocked += soak;
        hurtPlayer(r, hit - soak, name);
        if (r.phase === 'over') return;
      }
    }
    if (it.block) e.block += it.block;
    if (it.hex) f.hexNext += it.hex;
    if (it.wither) f.witherNext += it.wither;
    if (it.poison) r.poison += it.poison;
    if (it.heal) e.hp = Math.min(e.max, e.hp + it.heal);
    if (it.buff) e.str += it.buff;
  }
  e.step = (e.step + 1) % enemyDef(e.id).pattern.length;
  startTurn(r);
}

function winFight(r: Run): void {
  const f = r.fight!;
  r.hist = [];
  r.score += f.enemy.max * (f.elite ? 2 : 1) + (f.boss ? 500 : 0);
  r.floor++;
  r.block = 0;
  r.poison = 0;
  if (f.boss) {
    r.won = true;
    r.phase = 'over';
    r.score += WIN_BONUS + r.hp * 10;
    return;
  }
  r.fight = null;
  openChoice(r, 'reward', f.elite ? 1 : 0, 0);
}

// ---------------------------------------------------------------- rewards, rests, shrines

const RARITY_W = [0, 6, 3, 1];

function pickGear(rng: Rng, r: Run, n: number, rare: boolean): GearId[] {
  const out: GearId[] = [];
  const owned = new Set(r.gear.map((g) => g.id));
  for (let k = 0; k < n; k++) {
    const pool = GEAR.filter((g) => !out.includes(g.id) && !(owned.has(g.id) && g.rarity > 1));
    const w = pool.map((g) => (rare ? [0, 3, 4, 3][g.rarity] : RARITY_W[g.rarity]) * (owned.has(g.id) ? 0.4 : 1));
    let x = rng.next() * w.reduce((a, b) => a + b, 0);
    let i = 0;
    while (i < pool.length - 1 && (x -= w[i]) > 0) i++;
    out.push(pool[i].id);
  }
  return out;
}

const upgradable = (r: Run) => r.gear.map((g, i) => (g.up ? -1 : i)).filter((i) => i >= 0);
const NEW_DICE: DieKind[] = ['d6', 'd8', 'loaded', 'even', 'pebble', 'chance'];
/** The die that gains most from honing: lowest face sum. */
export const weakestDie = (r: Run) => r.dice.reduce((b, d, i) => (d.faces.reduce((a, x) => a + x, 0) < r.dice[b].faces.reduce((a, x) => a + x, 0) ? i : b), 0);

function openChoice(r: Run, kind: Choice['kind'], more: number, pick: number): void {
  const rng = new Rng(mixSeed(r.seed, mixSeed(0x63686f + r.floor, pick)));
  const options: Option[] = [];
  const one = (g: Gift): Option => ({ cost: 0, gifts: [g] });
  const ups = rng.shuffle(upgradable(r));
  if (kind === 'reward') {
    const elite = more > 0 || pick > 0;
    const [g1, g2] = pickGear(rng, r, 2, elite);
    options.push(one({ t: 'gear', id: g1 }));
    // Second option: an upgrade or a die.
    const dieOk = r.dice.length < MAX_DICE;
    if (ups.length && (!dieOk || rng.next() < 0.5)) options.push(one({ t: 'up', card: ups[0] }));
    else if (dieOk) options.push(one({ t: 'die', kind: rng.pick(r.dice.length < 4 ? ['d6', 'loaded', 'even', 'd8'] : NEW_DICE) }));
    else options.push(one({ t: 'hone', die: weakestDie(r) }));
    // Third: heal when hurt, else another gear card or a hone.
    const hurt = r.hp < r.maxHp * 0.7;
    if (hurt || rng.next() < 0.3) options.push(one({ t: 'heal', n: TUNE.heal }));
    else if (rng.next() < 0.5) options.push(one({ t: 'gear', id: g2 }));
    else options.push(one({ t: 'hone', die: weakestDie(r) }));
  } else if (kind === 'rest') {
    options.push(one({ t: 'heal', n: Math.round(r.maxHp * TUNE.rest) }));
    for (const c of ups.slice(0, 2)) options.push(one({ t: 'up', card: c }));
    if (options.length < 3) options.push(one({ t: 'hone', die: weakestDie(r) }));
  } else {
    // Shrines: a price in blood for something good, a gift, or walk on.
    const deals: Option[] = [];
    if (ups.length >= 2) deals.push({ cost: 8, gifts: [{ t: 'up', card: ups[0] }, { t: 'up', card: ups[1] }], label: 'Blood forge' });
    if (r.dice.length < MAX_DICE) deals.push({ cost: 6, gifts: [{ t: 'die', kind: rng.pick(['d8', 'loaded', 'chance'] as DieKind[]) }], label: 'Dice altar' });
    deals.push({ cost: 0, gifts: [{ t: 'maxhp', n: 6 }], label: 'Old spring' });
    deals.push({ cost: 5, gifts: [{ t: 'gear', id: pickGear(rng, r, 1, true)[0] }], label: 'Wayside cache' });
    deals.push({ cost: 0, gifts: [{ t: 'hone', die: weakestDie(r) }], label: 'Grindstone' });
    rng.shuffle(deals);
    options.push(...deals.slice(0, 2));
    options.push({ cost: 0, gifts: [{ t: 'heal', n: 8 }], label: 'Rest a while' });
  }
  r.choice = { kind, options, more, pick };
  r.phase = 'choice';
}

function giveGift(r: Run, g: Gift, replace: number): void {
  switch (g.t) {
    case 'gear':
      if (r.gear.length < MAX_GEAR) r.gear.push({ id: g.id, up: false });
      else r.gear[replace] = { id: g.id, up: false };
      break;
    case 'up':
      r.gear[g.card] = { ...r.gear[g.card], up: true };
      break;
    case 'die':
      r.dice.push({ kind: g.kind, faces: dieDef(g.kind).faces.slice() });
      break;
    case 'hone': {
      // The lowest face goes up by 3 (ties: the first).
      const d = r.dice[g.die];
      const lo = d.faces.indexOf(Math.min(...d.faces));
      d.faces = d.faces.slice();
      d.faces[lo] += 3;
      d.faces.sort((a, b) => a - b);
      break;
    }
    case 'heal':
      r.hp = Math.min(r.maxHp, r.hp + g.n);
      break;
    case 'maxhp':
      r.maxHp += g.n;
      r.hp += g.n;
      break;
  }
}

/** True if taking this option needs a gear card to replace. */
export const needsReplace = (r: Run, o: Option): boolean => r.gear.length >= MAX_GEAR && o.gifts.some((g) => g.t === 'gear');

function afterChoice(r: Run): void {
  const c = r.choice!;
  if (c.more > 0) return openChoice(r, c.kind, c.more - 1, c.pick + 1);
  r.choice = null;
  r.phase = 'map';
}

// ---------------------------------------------------------------- actions

export function cloneRun(r: Run): Run {
  return JSON.parse(JSON.stringify(r)) as Run;
}

const snapshot = (r: Run) => JSON.stringify({ fight: r.fight, hp: r.hp, block: r.block, stats: r.stats, score: r.score });

export interface Outcome {
  kind: 'map' | 'place' | 'undo' | 'end' | 'choice' | 'skip' | 'quit';
  effect?: Effect;
  /** HP lost during the enemy turn (and poison at the start of yours). */
  hurt?: number;
  /** Block that soaked enemy hits this turn. */
  soaked?: number;
  /** The enemy's poison ticked for this much. */
  enemyPoison?: number;
  won?: boolean;
  over?: boolean;
  fightWon?: boolean;
}

/** Applies one action. Returns null (and changes nothing) if it isn't legal. */
/** The phase, read fresh (TypeScript narrows r.phase across calls that change it). */
const phaseOf = (r: Run): Run['phase'] => r.phase;

export function act(r: Run, a: string): Outcome | null {
  if (r.phase === 'over') return null;
  const op = a[0];
  // Strict shapes: M<k>, P<die>.<card>.<slot>, C<k>[.<r>], or a single letter.
  if (!/^(M\d+|P\d+\.\d+\.\d+|C\d+(\.\d+)?|[UESX])$/.test(a)) return null;
  if (op === 'X') {
    r.phase = 'over';
    r.killedBy = 'gave up';
    r.actions.push(a);
    return { kind: 'quit', over: true };
  }
  if (op === 'M') {
    if (r.phase !== 'map') return null;
    const k = Number(a.slice(1));
    const row = r.map[r.floor];
    if (!row || !Number.isInteger(k) || !row[k]) return null;
    r.actions.push(a);
    r.path.push(k);
    const node = row[k];
    if (node.kind === 'rest' || node.kind === 'shrine') {
      // Walking in completes the floor.
      r.floor++;
      openChoice(r, node.kind, 0, 0);
    }
    else startFight(r, node);
    return { kind: 'map', over: phaseOf(r) === 'over' };
  }
  if (op === 'P') {
    const [die, card, slot] = a.slice(1).split('.').map(Number);
    if (placeError(r, die, card, slot)) return null;
    r.hist.push(snapshot(r));
    r.actions.push(a);
    const effect = applyPlace(r, die, card, slot);
    if (effect.killed) {
      winFight(r);
      return { kind: 'place', effect, fightWon: true, won: r.won, over: phaseOf(r) === 'over' };
    }
    return { kind: 'place', effect };
  }
  if (op === 'U') {
    if (r.phase !== 'fight' || !r.hist.length) return null;
    const s = JSON.parse(r.hist.pop()!);
    r.fight = s.fight;
    r.hp = s.hp;
    r.block = s.block;
    r.stats = s.stats;
    r.score = s.score;
    r.actions.push(a);
    return { kind: 'undo' };
  }
  if (op === 'E') {
    if (r.phase !== 'fight') return null;
    r.actions.push(a);
    const hp0 = r.hp;
    const blocked0 = r.stats.blocked;
    const ep0 = r.fight!.enemy.poison;
    const ehp0 = r.fight!.enemy.hp;
    enemyTurn(r);
    const fightWon = phaseOf(r) === 'choice' || r.won;
    return {
      kind: 'end',
      hurt: hp0 - r.hp,
      soaked: r.stats.blocked - blocked0,
      enemyPoison: ep0 > 0 ? Math.min(ep0, ehp0) : 0,
      fightWon,
      won: r.won,
      over: phaseOf(r) === 'over',
    };
  }
  if (op === 'C' || op === 'S') {
    if (r.phase !== 'choice' || !r.choice) return null;
    if (op === 'S') {
      if (r.choice.kind !== 'reward') return null;
      r.actions.push(a);
      afterChoice(r);
      return { kind: 'skip' };
    }
    const [k, rep] = a.slice(1).split('.').map(Number);
    const o = r.choice.options[k];
    if (!o) return null;
    if (o.cost >= r.hp) return null;
    if (needsReplace(r, o) && !(Number.isInteger(rep) && rep >= 0 && rep < r.gear.length)) return null;
    r.actions.push(a);
    r.hp -= o.cost;
    for (const g of o.gifts) giveGift(r, g, rep);
    afterChoice(r);
    return { kind: 'choice' };
  }
  return null;
}

export function replay(seed: number, actions: string[]): Run {
  const r = newRun(seed);
  for (const a of actions) if (!act(r, a)) break;
  return r;
}

/** Highest floor reached (1-based) for display. */
export const floorReached = (r: Run): number => Math.min(FLOORS, r.floor + (r.phase === 'fight' || (r.phase === 'over' && !r.won) ? 1 : 0)) || 1;

/** Every legal placement right now. */
export function legalPlacements(r: Run): { die: number; card: number; slot: number }[] {
  const out: { die: number; card: number; slot: number }[] = [];
  const f = r.fight;
  if (!f || r.phase !== 'fight') return out;
  f.pool.forEach((_, die) =>
    r.gear.forEach((g, card) =>
      slotsOf(g).forEach((_, slot) => {
        if (!placeError(r, die, card, slot)) out.push({ die, card, slot });
      }),
    ),
  );
  return out;
}


