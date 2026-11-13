// A Simmer season: twenty nights at a night-market stall. Each morning you buy
// ingredients (they keep a few nights, fish only one), learn recipes or buy
// upgrades, then open with a menu and prices; the evening runs by itself.
// Pure and deterministic: a season is its seed plus the action list. Actions:
//   b<ing>.<n>              buy n units of an ingredient at today's price
//   l<dish>                 learn a recipe
//   u<k>                    buy the next level of upgrade k
//   o[h]<dish>x<price>.…    open the stall with this menu (h: hire a helper tonight)

import {
  DISHES,
  INGS,
  MAX_PRICE,
  SPECIES,
  START_MENU,
  STARS,
  TUNE,
  UP,
  UPGRADES,
  type WeatherId,
} from './data';
import { T_FEST, T_MARKET, T_REQ, T_RIVAL, T_WEATHER, makeCrowd, rngFor, simulate, speciesWeights, streetMean, type MenuItem, type NightCtx, type NightResult, type Why } from './night';

export const RULES_VERSION = 5;

export interface Batch {
  ing: number;
  n: number;
  /** Last night it can be used. */
  until: number;
  /** Price paid per unit (for the waste figure). */
  cost: number;
}

export interface Ledger {
  day: number;
  ctx: NightCtx;
  helper: boolean;
  menu: MenuItem[];
  guests: number;
  friends: number;
  served: number;
  delighted: number;
  revenue: number;
  /** Coins spent this morning on ingredients, recipes and upgrades. */
  bought: number;
  shop: number;
  wage: number;
  /** Units thrown away tonight and what they cost. */
  wasted: number[];
  wasteCost: number;
  rep: number;
  repGain: number;
  repLoss: number;
  /** Guests let down (sold out, gave up, closing). */
  letdowns: number;
  /** ♥ beyond full renown, and the regulars' tips they became. */
  overflow: number;
  tips: number;
  /** Tips (included in revenue) from guests served the dish they asked for. */
  reqTips: number;
  left: Partial<Record<Why, number>>;
  sold: number[];
  coins: number;
  repAfter: number;
}

export interface Run {
  seed: number;
  /** Night index, 0-based; equals the season length once it's over. */
  day: number;
  coins: number;
  rep: number;
  stock: Batch[];
  known: boolean[];
  ups: number[];
  /** Species of last night's delighted guests: each brings a friend tonight. */
  friends: number[];
  weather: WeatherId[];
  festivals: number[];
  /** Today's spending so far. */
  spentFood: number;
  spentShop: number;
  /** The menu last opened with (the morning starts from it). */
  lastMenu: MenuItem[];
  ledgers: Ledger[];
  /** Last evening, for the animation (not saved; replay rebuilds it). */
  night: NightResult | null;
  /** The rival stall's night (-1: none). */
  rival: number;
  /** Species met so far (their tastes show in the guest book). */
  met: boolean[];
  gifts: number;
  /** Night a neighbour's loan arrived for (-1: none). */
  giftFor: number;
  actions: string[];
  over: boolean;
}

export const days = (): number => TUNE.days;
export const isPayday = (d: number): boolean => d % 5 === 4;

/** The season's weather: drifting from warm to chilly, with a 40% chance a night repeats the last. */
export function makeWeather(seed: number): WeatherId[] {
  const rng = rngFor(seed, T_WEATHER);
  const out: WeatherId[] = [];
  for (let d = 0; d < TUNE.days; d++) {
    const p = d / Math.max(1, TUNE.days - 1);
    if (d > 0 && rng.next() < 0.4) {
      out.push(out[d - 1]);
      continue;
    }
    const w: [WeatherId, number][] = [['clear', 3], ['warm', 3.2 * (1 - p)], ['rain', 2], ['fog', 1.2], ['chilly', 3.2 * p]];
    let x = rng.next() * w.reduce((a, [, v]) => a + v, 0);
    let pick: WeatherId = 'clear';
    for (const [k, v] of w) if ((x -= v) < 0) {
      pick = k;
      break;
    }
    out.push(pick);
  }
  return out;
}

/** Lantern festivals: one early, one late, and always the last night. */
export function makeFestivals(seed: number): number[] {
  const rng = rngFor(seed, T_FEST);
  const n = TUNE.days;
  return [rng.int(Math.floor(n * 0.25), Math.floor(n * 0.4)), rng.int(Math.floor(n * 0.6), Math.floor(n * 0.8)), n - 1];
}

export function ctxOf(r: Run, d = r.day): NightCtx {
  const ctx: NightCtx = { weather: r.weather[Math.min(d, r.weather.length - 1)], festival: r.festivals.includes(d), payday: isPayday(d), cool: r.ups[UP.cool] > 0 };
  if (d === r.rival) ctx.rival = true;
  if (d === r.day) ctx.req = requestOf(r, ctx);
  return ctx;
}

/**
 * Tonight's request (from night `TUNE.reqFrom` on): a kind expected tonight, picked by its
 * share of the crowd, asks for one of the dishes it loves (known or not). Seeded per night.
 */
/** The guests who come for tonight's asked-for dish. */
export const askersOf = (ctx: NightCtx): { sp: number; n: number } | undefined => (ctx.req ? { sp: ctx.req.sp, n: TUNE.reqGuests } : undefined);

/** The night a rival stall opens across the lane: one late night that isn't a festival. */
export function makeRival(seed: number, festivals: number[]): number {
  const rng = rngFor(seed, T_RIVAL);
  const n = TUNE.days;
  const options: number[] = [];
  for (let d = Math.floor(n * 0.6); d < n - 2; d++) if (!festivals.includes(d)) options.push(d);
  return options.length ? rng.pick(options) : -1;
}

export function requestOf(r: Run, ctx: NightCtx): { sp: number; dish: number } | undefined {
  if (r.day < TUNE.reqFrom) return undefined;
  const rng = rngFor(r.seed, T_REQ, r.day);
  const wts = speciesWeights(r.rep, ctx.weather);
  let x = rng.next() * wts.reduce((a, b) => a + b, 0);
  let sp = 0;
  for (let i = 0; i < wts.length; i++) if ((x -= wts[i]) < 0 && wts[i] > 0) {
    sp = i;
    break;
  }
  const loved = DISHES.map((d, i) => (d.tags.includes(SPECIES[sp].loves) ? i : -1)).filter((i) => i >= 0);
  return { sp, dish: rng.pick(loved) };
}

export type PriceMood = 'cheap' | 'usual' | 'dear';
/** Today's market price for an ingredient. */
export function marketPrice(seed: number, d: number, ing: number): { price: number; mood: PriceMood } {
  const x = rngFor(seed, T_MARKET, d, ing).next();
  const def = INGS[ing];
  if (x < 0.18) return { price: Math.max(1, def.cost - def.swing), mood: 'cheap' };
  if (x > 0.8) return { price: def.cost + def.swing, mood: 'dear' };
  return { price: def.cost, mood: 'usual' };
}

export const keepsOf = (r: Run, ing: number): number => INGS[ing].keeps + (r.ups[UP.cool] ? 1 : 0);
export const menuSize = (r: Run): number => START_MENU + r.ups[UP.board];
export const stovesOf = (r: Run, helper = false): number => 1 + r.ups[UP.stove] + (helper ? 1 : 0);

/** Units of each ingredient on hand. */
export function onHand(r: Run): number[] {
  const out = INGS.map(() => 0);
  for (const b of r.stock) out[b.ing] += b.n;
  return out;
}
/** Units that go off after tonight. */
export function expiring(r: Run): number[] {
  const out = INGS.map(() => 0);
  for (const b of r.stock) if (b.until <= r.day) out[b.ing] += b.n;
  return out;
}

/** Portions of a dish the given units allow. */
export function portions(dish: number, have: number[]): number {
  const need: number[] = INGS.map(() => 0);
  for (const u of DISHES[dish].uses) need[u]++;
  let n = Infinity;
  need.forEach((k, u) => k && (n = Math.min(n, Math.floor(have[u] / k))));
  return n === Infinity ? 0 : n;
}

export function newRun(seed: number): Run {
  return {
    seed: seed >>> 0,
    day: 0,
    coins: TUNE.startCoins,
    rep: 0,
    stock: [],
    known: DISHES.map((d) => d.learn === 0),
    ups: UPGRADES.map(() => 0),
    friends: [],
    weather: makeWeather(seed >>> 0),
    festivals: makeFestivals(seed >>> 0),
    rival: makeRival(seed >>> 0, makeFestivals(seed >>> 0)),
    spentFood: 0,
    spentShop: 0,
    lastMenu: DISHES.map((d, i) => ({ dish: i, price: d.base })).filter((m) => DISHES[m.dish].learn === 0).slice(0, START_MENU),
    ledgers: [],
    night: null,
    met: [true, true, true, false, false, false, false, false],
    gifts: 0,
    giftFor: -1,
    actions: [],
    over: false,
  };
}

/** The helper's wage tonight: a base, plus a little per expected guest. */
export function wageOf(r: Run, d = r.day): number {
  const ctx = ctxOf(r, d);
  const guests = streetMean(r.rep, ctx, r.ups[UP.lantern] > 0) + r.friends.length;
  return Math.round(TUNE.wage + TUNE.wagePer * guests);
}

export const upCost = (r: Run, k: number): number | null => {
  const c = UPGRADES[k].cost[r.ups[k]];
  return c === undefined ? null : Math.round(c * TUNE.upMul);
};
/** What learning a recipe costs. */
export const learnCost = (d: number): number => Math.round(DISHES[d].learn * TUNE.learnMul);

/** Why an action can't be taken now, or null. */
export function actError(r: Run, a: string): string | null {
  if (r.over) return 'The season is over';
  const m = /^b(\d+)\.(\d+)$/.exec(a);
  if (m) {
    const ing = Number(m[1]), n = Number(m[2]);
    if (!INGS[ing] || n < 1 || n > 99) return 'No such purchase';
    if (marketPrice(r.seed, r.day, ing).price * n > r.coins) return 'Not enough coins';
    return null;
  }
  if (a[0] === 'l') {
    const d = Number(a.slice(1));
    if (!DISHES[d] || !/^l\d+$/.test(a)) return 'No such recipe';
    if (r.known[d]) return 'Already known';
    if (learnCost(d) > r.coins) return 'Not enough coins';
    return null;
  }
  if (a[0] === 'u') {
    const k = Number(a.slice(1));
    if (!UPGRADES[k] || !/^u\d+$/.test(a)) return 'No such upgrade';
    const c = upCost(r, k);
    if (c === null) return 'Fully upgraded';
    if (c > r.coins) return 'Not enough coins';
    return null;
  }
  if (a[0] === 'o') {
    const p = parseOpen(a);
    if (!p) return 'Bad menu';
    if (p.menu.length > menuSize(r)) return 'Too many dishes';
    if (p.menu.some((x) => !r.known[x.dish])) return 'Unknown recipe';
    if (new Set(p.menu.map((x) => x.dish)).size !== p.menu.length) return 'A dish twice';
    if (p.helper && wageOf(r) > r.coins) return 'Not enough coins for a helper';
    return null;
  }
  return 'Unknown action';
}

export function parseOpen(a: string): { helper: boolean; menu: MenuItem[] } | null {
  const m = /^o(h?)((?:\d+x\d+)(?:\.\d+x\d+)*)?$/.exec(a);
  if (!m) return null;
  const menu = (m[2] ?? '')
    .split('.')
    .filter(Boolean)
    .map((s) => {
      const [d, p] = s.split('x').map(Number);
      return { dish: d, price: p };
    });
  if (menu.some((x) => !DISHES[x.dish] || x.price < 1 || x.price > MAX_PRICE)) return null;
  return { helper: m[1] === 'h', menu };
}
export const openAction = (menu: MenuItem[], helper: boolean): string => `o${helper ? 'h' : ''}${menu.map((m) => `${m.dish}x${m.price}`).join('.')}`;

/** Applies an action; returns false (and changes nothing) if it isn't legal. */
export function act(r: Run, a: string): boolean {
  if (actError(r, a)) return false;
  r.actions.push(a);
  const k = a[0];
  if (k === 'b') {
    const [ing, n] = a.slice(1).split('.').map(Number);
    const { price } = marketPrice(r.seed, r.day, ing);
    r.coins -= price * n;
    r.spentFood += price * n;
    const until = r.day + keepsOf(r, ing) - 1;
    const same = r.stock.find((b) => b.ing === ing && b.until === until && b.cost === price);
    if (same) same.n += n;
    else r.stock.push({ ing, n, until, cost: price });
  } else if (k === 'l') {
    const d = Number(a.slice(1));
    r.known[d] = true;
    r.coins -= learnCost(d);
    r.spentShop += learnCost(d);
  } else if (k === 'u') {
    const u = Number(a.slice(1));
    const c = upCost(r, u)!;
    r.coins -= c;
    r.spentShop += c;
    r.ups[u]++;
    // A cool box keeps what's already in the pantry a night longer too.
    if (u === UP.cool) for (const b of r.stock) b.until++;
  } else openStall(r, parseOpen(a)!);
  return true;
}

function openStall(r: Run, plan: { helper: boolean; menu: MenuItem[] }): void {
  const ctx = ctxOf(r);
  const wage = plan.helper ? wageOf(r) : 0;
  r.coins -= wage;
  const guests = makeCrowd({ seed: r.seed, day: r.day, rep: r.rep, ctx, lanterns: r.ups[UP.lantern] > 0, bench: r.ups[UP.bench] > 0, friends: r.friends, askers: askersOf(ctx) });
  const have = onHand(r);
  const night = simulate(guests, plan.menu, ctx, stovesOf(r, plan.helper), have);
  // Take what was cooked from the stock, oldest first.
  const used = onHand(r).map((n, u) => n - have[u]);
  r.stock.sort((a, b) => a.until - b.until || a.ing - b.ing);
  for (const b of r.stock) {
    const k = Math.min(b.n, used[b.ing]);
    b.n -= k;
    used[b.ing] -= k;
  }
  // Whatever can't last another night is thrown out.
  const wasted = INGS.map(() => 0);
  let wasteCost = 0;
  for (const b of r.stock)
    if (b.until <= r.day && b.n > 0) {
      wasted[b.ing] += b.n;
      wasteCost += b.n * b.cost;
      b.n = 0;
    }
  r.stock = r.stock.filter((b) => b.n > 0);
  r.coins += night.revenue;
  const before = r.rep;
  const letdowns = night.visits.filter((v) => v.rep < 0).length;
  const rc = repChange(r.rep, night.friends.length, letdowns);
  r.rep += rc.delta;
  // At full renown, hearts that can't be added come back as regulars' tips.
  const overflow = Math.max(0, before + rc.gain - rc.loss - REP_MAX);
  const tips = overflow * TUNE.fullTip;
  r.coins += tips;
  const left: Partial<Record<Why, number>> = {};
  for (const v of night.visits) if (v.why) left[v.why] = (left[v.why] ?? 0) + 1;
  for (const g of guests) r.met[g.sp] = true;
  r.ledgers.push({
    day: r.day,
    ctx,
    helper: plan.helper,
    menu: plan.menu,
    guests: guests.length,
    friends: guests.filter((g) => g.friend).length,
    served: night.visits.filter((v) => v.pick >= 0).length,
    delighted: night.friends.length,
    revenue: night.revenue,
    bought: r.spentFood,
    shop: r.spentShop,
    wage,
    wasted,
    wasteCost,
    rep: r.rep - before,
    repGain: rc.gain,
    repLoss: rc.loss,
    overflow,
    tips,
    reqTips: night.visits.reduce((a, v) => a + (v.tip ?? 0), 0),
    letdowns,
    left,
    sold: night.sold,
    coins: r.coins,
    repAfter: r.rep,
  });
  r.friends = night.friends.slice(0, TUNE.friendCap);
  r.night = night;
  r.lastMenu = plan.menu;
  r.spentFood = 0;
  r.spentShop = 0;
  r.day++;
  if (r.day >= TUNE.days) r.over = true;
  else if (r.coins < TUNE.safety) {
    // A neighbour tops up a nearly broke stall, so it can always stock up and open again.
    const gift = TUNE.safety - r.coins;
    r.coins += gift;
    r.gifts += gift;
    r.giftFor = r.day;
  }
}

export function replay(seed: number, actions: string[]): Run {
  const r = newRun(seed);
  for (const a of actions) if (!act(r, a)) break;
  return r;
}

export const REP_MAX = 100;
/**
 * Tonight's change in renown: each delighted guest spreads the word, but only to the
 * share of the market that hasn't heard of you yet ((100 − renown)%, never under `TUNE.gainFloor`); guests let down
 * (sold out, waited too long, turned away at closing) grumble: every two (rounded up)
 * cost a point, at most `TUNE.lossCap` a night.
 */
export function repChange(rep: number, delighted: number, letdowns: number): { gain: number; loss: number; delta: number } {
  const gain = Math.round(delighted * Math.max(TUNE.gainFloor, (REP_MAX - rep) / REP_MAX));
  const loss = lossFor(letdowns);
  const after = Math.max(0, Math.min(REP_MAX, rep + gain - loss));
  return { gain, loss, delta: after - rep };
}
export const lossFor = (letdowns: number): number => Math.min(TUNE.lossCap, Math.ceil(letdowns * TUNE.lossPer));

export const scoreOf = (r: Run): number => r.coins + TUNE.repPts * r.rep;
export const starsOf = (score: number): number => STARS.filter((s) => score >= s).length;
