// Tidings run: the map of stops, the hand dealt at each stop, choices and their
// effects, the legs between stops, and how a journey ends. A run is a seed plus
// actions (`P<hand>.<choice>` face a card, `M<k>` take road k), so
// `replay(seed, a)` rebuilds it exactly.

import { Rng, mixSeed } from '../../shared/rng';
import { CARD, CARDS, CARD_INDEX, recruitOf, type Card, type Choice } from './cards';
import {
  COMP_IDS,
  COMPANIONS,
  ENDING,
  END_NAME,
  KIND_INFO,
  LAST,
  LETHAL,
  PLACE_NAMES,
  REGION_KINDS,
  RES,
  STARS,
  START_NAME,
  TUNE,
  regionOf,
  type CompId,
  type Fx,
  type Kind,
  type Res,
} from './data';

/** Every random stream is keyed by its purpose and position, hashed one part at a time. */
export function rngFor(seed: number, ...parts: number[]): Rng {
  let h = seed >>> 0;
  for (const p of parts) h = mixSeed(h, p >>> 0);
  return new Rng(h);
}
const T_MAP = 0x6d6170, T_DEAL = 0x64656c, T_GAMBLE = 0x67616d, T_VAR = 0x766172;

export interface Node {
  kind: Kind;
  name: string;
}
export interface HandCard {
  id: string;
  /** Which telling (0 = the main text, n = alts[n-1]). */
  v: number;
  done: boolean;
  pick?: number;
  /** For a gamble: whether it came off. */
  won?: boolean;
  /** What it actually changed (after caps). */
  got?: Fx;
  /** For a gamble: the odds it had. */
  p?: number;
}
export interface LogEntry {
  stop: number;
  id: string;
  v: number;
  pick: number;
  won?: boolean;
  got: Fx;
}
export type PromiseState = 'carry' | 'kept' | 'broken';
export interface End {
  ending: string;
  /** The resource that ran out, for a failed journey. */
  cause?: Res;
  score: number;
  stars: number;
  kept: string[];
  /** Endings earned alongside the main one (the wedding, when the ring was kept). */
  also?: string[];
}
export interface Run {
  seed: number;
  map: Node[][];
  stop: number;
  /** The node taken at each row (path[0] = 0, the start). */
  path: number[];
  res: Record<Res, number>;
  band: { id: CompId; at: number }[];
  /** Companions met this run (joined at some point). */
  met: CompId[];
  /** Companions you parted ways with. */
  parted: CompId[];
  /** Flag → the stop it was set at. */
  flags: Record<string, number>;
  promises: Record<string, PromiseState>;
  /** Cards already dealt this run (repeatable ones may come back). */
  used: string[];
  hand: HandCard[];
  faced: number;
  /** The stop provisions were last bought at (-1: never), and every stop they were bought at. */
  bought: number;
  buys: number[];
  phase: 'cards' | 'road' | 'over';
  /** The leg costs paid on arriving at each stop. */
  legs: Fx[];
  log: LogEntry[];
  actions: string[];
  end?: End;
}

const cap = (r: Res): number => ({ f: TUNE.capF, o: TUNE.capO, c: TUNE.capC, h: TUNE.capH, t: TUNE.capT })[r];

// ---------------------------------------------------------------- map

export function makeMap(seed: number): Node[][] {
  const rng = rngFor(seed, T_MAP);
  const left: Record<string, string[]> = {};
  for (const k of Object.keys(PLACE_NAMES)) left[k] = rng.shuffle([...PLACE_NAMES[k as Kind]]);
  const name = (k: Kind) => left[k].pop() ?? PLACE_NAMES[k][0];
  const map: Node[][] = [[{ kind: 'town', name: START_NAME }]];
  let prev: Kind[] = ['town'];
  for (let row = 1; row < LAST; row++) {
    const kinds = REGION_KINDS[regionOf(row)];
    // Two different kinds; the row before's kinds are less likely to repeat.
    const pool = rng.shuffle([...kinds]).sort((a, b) => Number(prev.includes(a)) - Number(prev.includes(b)));
    const two = rng.next() < 0.75 ? pool.slice(0, 2) : rng.shuffle([...kinds]).slice(0, 2);
    map.push(two.map((k) => ({ kind: k, name: name(k) })));
    prev = two;
  }
  map.push([{ kind: 'town', name: END_NAME }]);
  return map;
}

export const nodeOf = (r: Run): Node => r.map[r.stop][r.path[r.stop]];

// ---------------------------------------------------------------- dealing

export const inBand = (r: Run, id: CompId): boolean => r.band.some((b) => b.id === id);

/** Can this card be dealt at the current stop? */
export function eligible(r: Run, c: Card): boolean {
  const s = r.stop;
  if (s < c.at[0] || s > c.at[1]) return false;
  if (!c.repeat && r.used.includes(c.id)) return false;
  if (c.where && !c.where.includes(nodeOf(r).kind)) return false;
  const rec = recruitOf(c);
  if (rec && r.met.includes(rec)) return false;
  const w = c.when;
  if (w) {
    const gap = w.gap ?? 2;
    if (w.flag !== undefined && !(r.flags[w.flag] !== undefined && s >= r.flags[w.flag] + gap)) return false;
    if (w.noFlag !== undefined && r.flags[w.noFlag] !== undefined) return false;
    if (w.comp) {
      const b = r.band.find((x) => x.id === w.comp);
      if (!b || s < b.at + gap) return false;
    }
    if (w.promise) {
      if (r.promises[w.promise] !== 'carry') return false;
      const at = r.flags[`p:${w.promise}`] ?? 0;
      if (s < at + gap) return false;
    }
  }
  return true;
}

function deal(r: Run): void {
  const rng = rngFor(r.seed, T_DEAL, r.stop);
  const ok = CARDS.filter((c) => eligible(r, c));
  const hand: Card[] = [];
  let musts = 0;
  const take = (c: Card) => {
    hand.push(c);
    if (c.must) musts++;
  };
  // Callbacks first (at most two; at most one card you can't pass by per hand).
  for (const c of rng.shuffle(ok.filter((c) => c.cb))) {
    if (hand.length >= 2) break;
    if (c.must && musts) continue;
    take(c);
  }
  const rest = ok.filter((c) => !c.cb);
  // Recruits go anywhere but weigh less, so each is offered about as often as the others. A card whose ✦ choices
  // could no longer be remembered (too late in the road) comes up less.
  const late = (c: Card) => c.choices.some((ch) => ch.set) && c.choices.every((ch) => !ch.set || !recallable(r, ch.set));
  const weight = (c: Card) =>
    (c.repeat ? 1 : recruitOf(c) ? TUNE.recruitW : c.where ? 4 : 2) * (c.must ? 0.7 : 1) * (c.w ?? 1) * (late(c) ? TUNE.lateSetW : 1);
  while (hand.length < TUNE.hand) {
    const pool = rest.filter((c) => !hand.includes(c) && !(c.must && musts));
    if (!pool.length) break;
    const tot = pool.reduce((a, c) => a + weight(c), 0);
    let x = rng.next() * tot;
    let pick = pool[pool.length - 1];
    for (const c of pool) {
      x -= weight(c);
      if (x < 0) {
        pick = c;
        break;
      }
    }
    take(pick);
  }
  // Callbacks lead; the rest keep their dealt order.
  r.hand = hand.map((c) => {
    const n = c.alts?.length ?? 0;
    const v = n ? rngFor(r.seed, T_VAR, CARD_INDEX[c.id], c.repeat ? r.stop : 0).int(0, n) : 0;
    return { id: c.id, v, done: false };
  });
  for (const c of hand) if (!r.used.includes(c.id)) r.used.push(c.id);
  r.faced = 0;
  r.phase = r.hand.length ? 'cards' : 'road';
}

/** The telling of a dealt card this run uses. */
export function telling(hc: { id: string; v: number }): { title: string; text: string; art: string } {
  const c = CARD[hc.id];
  const a = hc.v > 0 ? c.alts?.[hc.v - 1] : undefined;
  return { title: a?.title ?? c.title, text: a?.text ?? c.text, art: a?.art ?? c.art };
}

// ---------------------------------------------------------------- choices

export const oddsOf = (r: Run, ch: Choice): number => {
  if (ch.odds === undefined) return 1;
  const b = ch.boost && inBand(r, ch.boost[0]) ? ch.boost[1] : 0;
  return Math.min(0.95, Math.round((ch.odds + b) * 100) / 100);
};

/** Why a choice can't be taken right now, or null. */
export function blockOf(r: Run, ch: Choice): string | null {
  if (ch.need && !inBand(r, ch.need)) return `Needs ${COMPANIONS[ch.need].name} (${COMPANIONS[ch.need].trait.toLowerCase()})`;
  if (ch.join && r.band.length >= TUNE.bandMax) return 'Your band is full';
  const coin = Math.min(ch.fx.c ?? 0, ch.lose?.fx.c ?? 0);
  if (coin < 0 && r.res.c + coin < 0) return `Needs ${-coin} coin`;
  return null;
}

/** The hand card that must still be faced at this stop, if the choice is down to it. */
function mustLeft(r: Run): number {
  if (r.faced < TUNE.face - 1) return -1;
  return r.hand.findIndex((hc) => !hc.done && CARD[hc.id].must);
}

/** Why hand card h can't be faced now (another card can't be passed by), or null. */
export function cardBlock(r: Run, h: number): string | null {
  const hc = r.hand[h];
  if (!hc || hc.done) return 'Already faced';
  const m = mustLeft(r);
  if (m >= 0 && m !== h) return `${telling(r.hand[m]).title} can’t be passed by`;
  return null;
}

/** Effects as they would land, after caps: the change per resource. */
export function landed(r: Run, fx: Fx): Fx {
  const got: Fx = {};
  for (const k of RES) {
    const d = fx[k];
    if (!d) continue;
    const to = Math.max(0, Math.min(cap(k), r.res[k] + d));
    if (to !== r.res[k]) got[k] = to - r.res[k];
  }
  return got;
}

/** The lethal resources an outcome would empty. */
export function emptied(r: Run, fx: Fx): Res[] {
  return LETHAL.filter((k) => (fx[k] ?? 0) < 0 && r.res[k] + (fx[k] ?? 0) <= 0);
}

function apply(r: Run, fx: Fx): Fx {
  const got = landed(r, fx);
  for (const k of RES) r.res[k] += got[k] ?? 0;
  return got;
}

function checkDead(r: Run): boolean {
  const k = LETHAL.find((x) => r.res[x] <= 0);
  if (!k) return false;
  const id = { f: 'starve', o: 'dark', h: 'hurt', t: 'scatter', c: 'starve' }[k];
  r.phase = 'over';
  r.end = { ending: id, cause: k, score: 0, stars: 0, kept: [] };
  return true;
}

// ---------------------------------------------------------------- legs

/** Extra food a leg for a band of n companions (the third one tips it). */
export const bandFood = (n: number): number => TUNE.bandFood * Math.floor(n / TUNE.bandAt);

/** The least each lethal resource the rest of the road costs after taking road k (the leg included), band as it is. */
export function routeNeed(r: Run, k: number): Record<'f' | 'o' | 'h' | 't', number> {
  const need = { f: 0, o: 0, h: 0, t: 0 };
  const leg = legCost(r, k);
  for (const x of ['f', 'o', 'h', 't'] as const) need[x] = -(leg[x] ?? 0);
  // Cheapest per resource along any path from node k onward.
  for (const x of ['f', 'o', 'h', 't'] as const) {
    // Every row is reachable from every node of the row before, so the cheapest is per row.
    for (let row = r.stop + 2; row <= LAST; row++) need[x] += Math.min(...r.map[row].map((_, i) => -(legCost(r, i, row)[x] ?? 0)));
  }
  return need;
}

/** How much more of each lethal resource you must find to reach Hollin after taking road k, on the cheapest
 *  roads (0 ends the journey, so you must arrive with at least 1): need − have + 1 where that is positive. */
export function shortBy(r: Run, k: number): Partial<Record<'f' | 'o' | 'h' | 't', number>> {
  const out: Partial<Record<'f' | 'o' | 'h' | 't', number>> = {};
  if (r.stop + 1 >= LAST) return out;
  const need = routeNeed(r, k);
  for (const x of ['f', 'o', 'h', 't'] as const) if (need[x] > 0 && need[x] >= r.res[x]) out[x] = need[x] - r.res[x] + 1;
  return out;
}
export const shortOf = (r: Run, k: number): ('f' | 'o' | 'h' | 't')[] => Object.keys(shortBy(r, k)) as ('f' | 'o' | 'h' | 't')[];

/** Could a choice that sets this flag still be remembered before Hollin (some callback can still come)? */
export const recallable = (r: Run, flag: string): boolean =>
  CARDS.some((c) => c.when?.flag === flag && r.stop + (c.when.gap ?? 2) <= c.at[1]);

/** What provisions cost now: dearer each time you buy in this region (word gets round), fresh prices in the next. */
export const buyPrice = (r: Run): number => TUNE.buyCost + TUNE.buyRise * r.buys.filter((s) => regionOf(s) === regionOf(r.stop)).length;

/** Provisions on sale here (a village or inn, once a stop). */
export const canBuy = (r: Run): boolean =>
  r.phase !== 'over' && r.stop > 0 && r.stop < LAST && r.bought !== r.stop && (nodeOf(r).kind === 'town' || nodeOf(r).kind === 'inn');

/** What the road to row stop+1, node k, costs. */
export function legCost(r: Run, k: number, row = r.stop + 1): Fx {
  const node = r.map[row]?.[k];
  // The last mile is downhill, and Hollin sends a sledge.
  if (!node || row >= LAST) return {};
  const fx: Fx = {};
  fx.f = -([TUNE.legFood, TUNE.legFoodHills, TUNE.legFoodPass][regionOf(row)] + bandFood(r.band.length));
  const oil = KIND_INFO[node.kind].oil + (regionOf(row) === 2 && row < LAST ? TUNE.passOil : 0);
  if (oil) fx.o = -oil;
  if (node.kind === 'heights' && TUNE.cold) fx.h = -TUNE.cold;
  if (node.kind === 'river' && TUNE.wet) fx.h = -TUNE.wet;
  if (node.kind === 'wild' && TUNE.woods) fx.t = -TUNE.woods;
  return fx;
}

// ---------------------------------------------------------------- the end

export function scoreOf(r: Run): number {
  const kept = Object.values(r.promises).filter((p) => p === 'carry' || p === 'kept').length;
  return r.res.f + r.res.o + r.res.h + r.res.t + Math.floor(r.res.c / 2) + TUNE.compPts * r.band.length + TUNE.promisePts * kept;
}
export const starsOf = (score: number): number => (score >= STARS[2] ? 3 : score >= STARS[1] ? 2 : 1);

function arrive(r: Run): void {
  const kept: string[] = [];
  for (const [p, st] of Object.entries(r.promises)) {
    if (st === 'carry') {
      r.promises[p] = 'kept';
      kept.push(p);
    }
  }
  const score = scoreOf(r);
  const low = Math.min(...LETHAL.map((k) => r.res[k]));
  // The ring's wedding comes as well as whatever else the journey earned, never instead of it.
  const ending = low <= 1
      ? 'thin'
      : r.band.length >= TUNE.bandMax
        ? 'full'
        : r.res.t >= 9
          ? 'beloved'
          : r.res.c >= 14
            ? 'rich'
            : r.band.length === 0
              ? 'alone'
              : 'plain';
  r.phase = 'over';
  r.end = { ending, score, stars: starsOf(score), kept, also: kept.includes('ring') ? ['wedding'] : [] };
}

export const arrived = (r: Run): boolean => r.phase === 'over' && ENDING[r.end!.ending].kind === 'arrive';

// ---------------------------------------------------------------- runs

export function newRun(seed: number): Run {
  const r: Run = {
    seed: seed >>> 0,
    map: makeMap(seed >>> 0),
    stop: 0,
    path: [0],
    res: { f: TUNE.startF, o: TUNE.startO, c: TUNE.startC, h: TUNE.startH, t: TUNE.startT },
    band: [],
    met: [],
    parted: [],
    flags: {},
    promises: {},
    used: [],
    hand: [],
    faced: 0,
    bought: -1,
    buys: [],
    phase: 'cards',
    legs: [{}],
    log: [],
    actions: [],
  };
  deal(r);
  return r;
}

export function actError(r: Run, a: string): string | null {
  if (r.phase === 'over') return 'The journey is over';
  let m = /^P(\d)\.(\d)$/.exec(a);
  if (m) {
    if (r.phase !== 'cards') return 'Choose the road';
    const h = Number(m[1]);
    const cb = cardBlock(r, h);
    if (cb) return cb;
    const ch = CARD[r.hand[h].id].choices[Number(m[2])];
    if (!ch) return 'No such choice';
    return blockOf(r, ch);
  }
  if (a === 'B') {
    if (!canBuy(r)) return 'No provisions for sale here';
    if (r.res.c < buyPrice(r)) return `Needs ${buyPrice(r)} coin`;
    return null;
  }
  m = /^L(\d)$/.exec(a);
  if (m) {
    const id = COMP_IDS[Number(m[1])];
    if (!id || !inBand(r, id)) return 'Not in your band';
    return null;
  }
  m = /^M(\d)$/.exec(a);
  if (m) {
    if (r.phase !== 'road') return 'Finish this stop first';
    if (!r.map[r.stop + 1]?.[Number(m[1])]) return 'No such road';
    return null;
  }
  return 'Unknown action';
}

/** Applies an action; false (and no change) if it isn't legal. `force` decides a gamble (bots planning, tests). */
export function act(r: Run, a: string, force?: boolean): boolean {
  if (actError(r, a)) return false;
  r.actions.push(a);
  if (a[0] === 'P') {
    const h = Number(a[1]);
    const k = Number(a[3]);
    const hc = r.hand[h];
    const card = CARD[hc.id];
    const ch = card.choices[k];
    let fx = ch.fx;
    let won: boolean | undefined;
    if (ch.odds !== undefined) {
      hc.p = oddsOf(r, ch);
      won = force ?? rngFor(r.seed, T_GAMBLE, r.stop, CARD_INDEX[card.id]).next() < hc.p;
      if (!won) fx = ch.lose!.fx;
    }
    const got = apply(r, fx);
    if (ch.set) r.flags[ch.set] = r.stop;
    if (ch.clear) delete r.flags[ch.clear];
    if (ch.join && !inBand(r, ch.join)) {
      r.band.push({ id: ch.join, at: r.stop });
      if (!r.met.includes(ch.join)) r.met.push(ch.join);
    }
    if (ch.promise) {
      r.promises[ch.promise] = 'carry';
      r.flags[`p:${ch.promise}`] = r.stop;
    }
    // A gamble breaks its promise only when it's lost.
    if (ch.breaks && (won === undefined || !won) && r.promises[ch.breaks] === 'carry') r.promises[ch.breaks] = 'broken';
    hc.done = true;
    hc.pick = k;
    hc.won = won;
    hc.got = got;
    r.faced++;
    r.log.push({ stop: r.stop, id: hc.id, v: hc.v, pick: k, won, got });
    if (checkDead(r)) return true;
    if (r.faced >= TUNE.face || r.hand.every((x) => x.done)) r.phase = 'road';
    return true;
  }
  if (a === 'B') {
    apply(r, { c: -buyPrice(r), f: TUNE.buyFood });
    r.bought = r.stop;
    r.buys.push(r.stop);
    return true;
  }
  if (a[0] === 'L') {
    const id = COMP_IDS[Number(a[1])];
    r.band = r.band.filter((b) => b.id !== id);
    r.parted.push(id);
    apply(r, { t: -TUNE.partTrust });
    checkDead(r);
    return true;
  }
  // M<k>: walk the leg to the next stop.
  const k = Number(a[1]);
  const fx = legCost(r, k);
  r.stop++;
  r.path.push(k);
  r.legs.push(apply(r, fx));
  r.hand = [];
  if (checkDead(r)) return true;
  if (r.stop >= LAST) {
    arrive(r);
    return true;
  }
  deal(r);
  return true;
}

export function replay(seed: number, actions: string[]): Run {
  const r = newRun(seed);
  for (const a of actions) if (!act(r, a)) break;
  return r;
}

export const cloneRun = (r: Run): Run => JSON.parse(JSON.stringify(r)) as Run;

/** The choice outcome text a faced hand card produced. */
export function outcomeText(hc: HandCard): string {
  const ch = CARD[hc.id].choices[hc.pick!];
  return hc.won === false ? ch.lose!.out : ch.out;
}


