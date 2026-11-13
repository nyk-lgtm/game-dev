// Simmer bots: each plans a morning from what the page shows (forecast, market,
// tastes and purses), never from tonight's real crowd. A Strat says how it picks
// the menu and prices, how much it stocks and what it buys in the shop.
//   naive   the starting menu at the listed prices, six portions of each, nothing else
//   decent  menu by expected orders, prices a coin over the list, stocks to the forecast,
//           learns two recipes and the first menu board, a helper on festivals
//   clever  prices tuned to the forecast purses, stocks to cover, buys long-keeping
//           ingredients on cheap days, values reputation, times recipes and upgrades by payback

import {
  DISHES,
  INGS,
  SPECIES,
  TUNE,
  UP,
  UPGRADES,
  act,
  demand,
  expiring,
  forecast,
  marketPrice,
  menuSize,
  onHand,
  openAction,
  stovesOf,
  upCost,
  type Demand,
  type Forecast,
  type MenuItem,
  type Run,
  REP_MAX,
  STOVE_WARN,
  fillNeed,
  upgradePayback,
} from '../../src/simmer/core';

export interface Strat {
  name: string;
  /** fixed: the starting three; greedy: built from expected profit. */
  menu: 'fixed' | 'greedy';
  /** base: listed price ×mul +add; opt: searched against the forecast. */
  price: 'base' | 'opt';
  mul: number;
  add: number;
  /** flat: top up to `flat` portions a dish; forecast: expected orders × cover + pad. */
  stock: 'flat' | 'forecast' | 'fill';
  flat: number;
  cover: number;
  pad: number;
  /** Buy rice/flour ahead on cheap days. */
  bulk: boolean;
  /** Recipes: none, a fixed order (up to `learnMax`), or by payback. */
  learn: 'none' | 'order' | 'value';
  learnMax: number;
  order: number[];
  /** Upgrades: bought by rule (keys in order, `upMinDaysLeft`), or by the page's payback estimate. */
  ups: number[];
  upMode: 'rule' | 'payback';
  upMinDaysLeft: number;
  reserve: number;
  helper: 'never' | 'festival' | 'busy' | 'warn';
  /** Coins a point of reputation is worth when planning (plus `repPerDay` per night left). */
  repValue: number;
  repPerDay: number;
  /** Keep every menu line filled (a person rarely leaves one empty). */
  fillMenu?: boolean;
  /** Only these dishes may go on the menu (single-minded strategies). */
  only?: number[];
}

const BASE: Strat = {
  name: 'clever',
  menu: 'greedy',
  price: 'opt',
  mul: 1,
  add: 0,
  stock: 'forecast',
  flat: 6,
  cover: Number(process.env.COVER ?? 1.15),
  pad: Number(process.env.PAD ?? 1),
  bulk: true,
  learn: 'value',
  learnMax: 10,
  order: [3, 4, 6, 7, 9, 5, 8],
  ups: [UP.board, UP.board, UP.lantern, UP.stove, UP.bench],
  upMode: 'payback',
  upMinDaysLeft: 8,
  reserve: 30,
  helper: 'busy',
  repValue: Number(process.env.RV ?? 10),
  repPerDay: Number(process.env.RD ?? 1),
};

export const STRATS: Record<string, Strat> = {
  naive: { ...BASE, name: 'naive', menu: 'fixed', price: 'base', stock: 'flat', flat: 6, bulk: false, learn: 'none', ups: [], helper: 'never' },
  // The tester's lazy play: starting menu at listed prices, Fill to forecast, never shops.
  lazy: { ...BASE, name: 'lazy', menu: 'fixed', price: 'base', stock: 'fill', bulk: false, learn: 'none', ups: [], helper: 'never' },
  // ...plus a helper whenever the page warns the stoves are short.
  lazyhelp: { ...BASE, name: 'lazyhelp', menu: 'fixed', price: 'base', stock: 'fill', bulk: false, learn: 'none', ups: [], helper: 'warn' },
  // A careful player using the page: dishes by their "~N orders", listed prices, Fill to forecast,
  // a helper when warned, recipes and upgrades whose payback lines look good.
  decent: { ...BASE, name: 'decent', price: 'base', stock: 'fill', bulk: false, helper: 'warn', repValue: 0, repPerDay: 0, fillMenu: true },
  // The old decent bot: a fixed two recipes and the menu board, stock with a margin.
  steady: {
    ...BASE,
    name: 'steady',
    price: 'base',
    cover: 1.1,
    pad: 1,
    bulk: false,
    learn: 'order',
    learnMax: 2,
    ups: [UP.board],
    upMode: 'rule',
    upMinDaysLeft: 6,
    reserve: 50,
    helper: 'festival',
    repValue: 0,
    repPerDay: 0,
  },
  clever: BASE,
  // Single-minded strategies, to check none of them dominates.
  cheap: { ...BASE, name: 'cheap', price: 'base', mul: 0.8, add: 0 },
  premium: { ...BASE, name: 'premium', price: 'base', mul: 1.35, add: 0 },
  greedy: { ...BASE, name: 'greedy', repValue: 0, repPerDay: 0 },
  fame: { ...BASE, name: 'fame', repValue: 25, repPerDay: 2 },
  hoard: { ...BASE, name: 'hoard', learn: 'none', ups: [], helper: 'never' },
  builder: { ...BASE, name: 'builder', ups: [UP.board, UP.board, UP.lantern, UP.stove, UP.bench, UP.cool], upMode: 'rule', upMinDaysLeft: 0, reserve: 0, learn: 'order', learnMax: 10 },
  sweets: { ...BASE, name: 'sweets', only: [2, 4, 5, 9] },
  fishy: { ...BASE, name: 'fishy', only: [0, 3, 6, 8] },
  overstock: { ...BASE, name: 'overstock', cover: 1.6, pad: 2 },
  understock: { ...BASE, name: 'understock', cover: 0.8, pad: 0 },
};

const daysLeft = (r: Run) => TUNE.days - r.day;
const dishCost = (r: Run, dish: number) => DISHES[dish].uses.reduce((a, u) => a + marketPrice(r.seed, r.day, u).price, 0);

/** Expected profit of a menu tonight, with reputation valued at `lam` coins a point. */
function value(r: Run, _s: Strat, menu: MenuItem[], f: Forecast, stoves: number, lam: number): { v: number; d: Demand } {
  const d = demand(r, menu, f, stoves);
  let profit = 0;
  menu.forEach((m, i) => (profit += d.orders[i] * (m.price - dishCost(r, m.dish))));
  let rep = (d.rep * (REP_MAX - r.rep)) / REP_MAX;
  // A queue longer than the stoves can cook loses guests (and some patience).
  const cap = d.capacity * 0.8;
  if (d.cookMins > cap) {
    const served = cap / d.cookMins;
    profit *= served;
    rep = rep * served - d.buyers * (1 - served);
  }
  return { v: profit + lam * rep, d };
}

function priceFor(s: Strat, dish: number): number {
  return Math.max(1, Math.round(DISHES[dish].base * s.mul + s.add));
}

function optPrices(r: Run, s: Strat, menu: MenuItem[], f: Forecast, stoves: number, lam: number, passes = 2, only = -1): number {
  let best = value(r, s, menu, f, stoves, lam).v;
  if (s.price !== 'opt') return best;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < menu.length; i++) {
      if (only >= 0 && i !== only) continue;
      const base = DISHES[menu[i].dish].base;
      let bp = menu[i].price;
      for (let p = Math.max(1, Math.floor(base * 0.6)); p <= Math.ceil(base * 2.2); p++) {
        if (p === bp) continue;
        menu[i].price = p;
        const v = value(r, s, menu, f, stoves, lam).v;
        if (v > best + 1e-9) (best = v), (bp = p);
      }
      menu[i].price = bp;
    }
  }
  return best;
}

/** Builds tonight's menu and prices. */
export function planMenu(r: Run, s: Strat, f = forecast(r), stoves = stovesOf(r), lam = lamOf(r, s), known = r.known): { menu: MenuItem[]; v: number } {
  if (s.menu === 'fixed') {
    const menu = [0, 1, 2].map((d) => ({ dish: d, price: priceFor(s, d) }));
    return { menu, v: value(r, s, menu, f, stoves, lam).v };
  }
  const pool = DISHES.map((_, i) => i).filter((i) => known[i] && (!s.only || s.only.includes(i)));
  const menu: MenuItem[] = [];
  let cur = -Infinity;
  const size = Math.min(menuSize(r), pool.length);
  while (menu.length < size) {
    let bestD = -1, bestV = -Infinity, bestP = 0;
    for (const d of pool) {
      if (menu.some((m) => m.dish === d)) continue;
      const trial = [...menu, { dish: d, price: priceFor(s, d) }];
      const v = optPrices(r, s, trial, f, stoves, lam, 1, trial.length - 1);
      if (v > bestV) (bestV = v), (bestD = d), (bestP = trial[trial.length - 1].price);
    }
    if (bestD < 0 || (menu.length > 0 && !s.fillMenu && bestV <= cur + 0.5)) break;
    menu.push({ dish: bestD, price: bestP });
    cur = bestV;
  }
  const v = optPrices(r, s, menu, f, stoves, lam, 2);
  return { menu, v };
}

const lamOf = (r: Run, s: Strat) => s.repValue + s.repPerDay * daysLeft(r);

/** Units of each ingredient tonight's menu calls for. */
function needFor(r: Run, s: Strat, menu: MenuItem[], f: Forecast, helper: boolean): number[] {
  const need = INGS.map(() => 0);
  if (s.stock === 'flat') for (const m of menu) for (const u of DISHES[m.dish].uses) need[u] += s.flat;
  else if (s.stock === 'fill') return fillNeed(r, menu, stovesOf(r, helper));
  else {
    const d = demand(r, menu, f, stovesOf(r, helper));
    const capShare = Math.min(1, (d.capacity * 0.85) / Math.max(1, d.cookMins));
    menu.forEach((m, i) => {
      const n = Math.ceil(d.orders[i] * capShare * s.cover + s.pad - 0.25);
      for (const u of DISHES[m.dish].uses) need[u] += n;
    });
  }
  return need;
}

/** Coins the missing units cost at today's prices. */
function costOf(r: Run, need: number[]): number {
  const have = onHand(r);
  return need.reduce((a, n, u) => a + Math.max(0, n - have[u]) * marketPrice(r.seed, r.day, u).price, 0);
}

/** The morning's actions: shop, buy ingredients, open. */
export function planDay(r: Run, s: Strat): string[] {
  const out: string[] = [];
  const doAct = (a: string) => {
    if (act(r, a)) out.push(a);
  };
  const f = forecast(r);
  const lam = lamOf(r, s);
  // What tonight's stock will cost: shopping never eats into it.
  const stockBudget = () => costOf(r, needFor(r, s, planMenu(r, s, f, stovesOf(r), lam).menu, f, false)) + s.reserve;
  // Recipes.
  const nKnown = () => r.known.filter(Boolean).length - 3;
  if (s.learn === 'order') {
    for (const d of s.order) {
      if (nKnown() >= s.learnMax) break;
      if (r.known[d]) continue;
      if (r.coins >= DISHES[d].learn + stockBudget() && daysLeft(r) >= 6) doAct(`l${d}`);
      break;
    }
  } else if (s.learn === 'value' && daysLeft(r) >= 4) {
    const now = planMenu(r, s, f, stovesOf(r), lam).v;
    const room = r.coins - stockBudget();
    let best = -1, gain = 0;
    for (let d = 0; d < DISHES.length; d++) {
      if (r.known[d] || (s.only && !s.only.includes(d)) || DISHES[d].learn > room) continue;
      const k = r.known.slice();
      k[d] = true;
      const g = (planMenu(r, s, f, stovesOf(r), lam, k).v - now) * daysLeft(r) * 0.6 - DISHES[d].learn;
      if (g > gain) (gain = g), (best = d);
    }
    if (best >= 0) doAct(`l${best}`);
  }
  // Upgrades: by the page's payback estimate, or in the strategy's order.
  const last = r.ledgers[r.ledgers.length - 1];
  if (s.upMode === 'payback' && s.ups.length) {
    const menu = planMenu(r, s, f, stovesOf(r), lam).menu;
    let best = -1, gain = 0;
    for (let k = 0; k < UPGRADES.length; k++) {
      const c = upCost(r, k);
      if (c === null || r.coins < c + stockBudget()) continue;
      const g = upgradePayback(r, k, menu).perNight * daysLeft(r) * 0.7 - c;
      if (g > gain) (gain = g), (best = k);
    }
    if (best >= 0) doAct(`u${best}`);
  } else
    for (const k of s.ups) {
      const c = upCost(r, k);
      if (c === null) continue;
      if (r.coins < c + stockBudget() || daysLeft(r) < s.upMinDaysLeft) break;
      if (k === UP.stove && s.name !== 'builder') {
        const d = demand(r, planMenu(r, s, f, 1, lam).menu, f, 1);
        const queued = last ? (last.left.slow ?? 0) + (last.left.closed ?? 0) : 0;
        if (d.cookMins < d.capacity * 0.6 && queued < 3) continue;
      }
      if (k === UP.bench && s.name !== 'builder' && last && (last.left.slow ?? 0) < 2) continue;
      doAct(`u${k}`);
      break;
    }
  // Helper tonight?
  let helper = false;
  if (s.helper === 'festival') helper = f.ctx.festival && r.coins >= TUNE.wage + stockBudget();
  else if (s.helper === 'warn') {
    const d = demand(r, planMenu(r, s, f, stovesOf(r), lam).menu, f);
    helper = d.cookMins > d.capacity * STOVE_WARN && r.coins >= TUNE.wage + stockBudget();
  }
  else if (s.helper === 'busy' && r.coins >= TUNE.wage + stockBudget()) {
    const one = planMenu(r, s, f, stovesOf(r), lam).v;
    const two = planMenu(r, s, f, stovesOf(r, true), lam).v;
    helper = two - one > TUNE.wage + 2;
  }
  const { menu } = planMenu(r, s, f, stovesOf(r, helper), lam);
  // Ingredients: tonight's needs (scaled down if coins are short), then (clever) a
  // stock-up of long-keeping ones on a cheap day.
  const need = needFor(r, s, menu, f, helper);
  const have = onHand(r);
  const exp = expiring(r);
  const wage = helper ? TUNE.wage : 0;
  const cost = costOf(r, need);
  const scale = cost > r.coins - wage ? (r.coins - wage) / cost : 1;
  for (let u = 0; u < INGS.length; u++) {
    const mp = marketPrice(r.seed, r.day, u);
    const n = Math.min(Math.floor(Math.max(0, need[u] - have[u]) * scale), Math.floor((r.coins - wage) / mp.price), 99);
    if (n > 0) doAct(`b${u}.${n}`);
  }
  if (s.bulk) {
    const budget = Math.floor((r.coins - wage) * 0.3);
    let spent = 0;
    const now = onHand(r);
    for (let u = 0; u < INGS.length; u++) {
      const mp = marketPrice(r.seed, r.day, u);
      if (mp.mood !== 'cheap' || INGS[u].keeps < 6 || need[u] <= 0) continue;
      const n = Math.min(Math.max(0, need[u] * 3 - (now[u] - exp[u])), Math.floor((budget - spent) / mp.price), 99);
      if (n > 0) doAct(`b${u}.${n}`), (spent += n * mp.price);
    }
  }
  doAct(openAction(menu, helper));
  return out;
}

/** Plays a whole season. */
export function playSeason(r: Run, s: Strat): Run {
  for (let guard = 0; !r.over && guard < 100; guard++) {
    const n = r.actions.length;
    planDay(r, s);
    if (r.actions.length === n || r.actions[r.actions.length - 1][0] !== 'o') throw new Error(`bot ${s.name} could not open on day ${r.day} (seed ${r.seed})`);
  }
  return r;
}

export const speciesName = (sp: number) => SPECIES[sp].name;
export const upName = (k: number) => UPGRADES[k].key;
