// What the morning can know about tonight: the weather, roughly how many guests
// and of which kinds, and (from their tastes and purses) what each kind would
// order off a given menu. It never looks at tonight's actual crowd.

import { DISHES, OPEN_MINUTES, SERVE, SPECIES, TUNE, UP } from './data';
import { chooseFrom, delights, purseRange, speciesWeights, streetMean, worthTable, type MenuItem, type NightCtx, type Why } from './night';
import { ctxOf, type Run } from './run';

export interface Forecast {
  ctx: NightCtx;
  /** Expected street guests and the ±15% range. */
  street: number;
  lo: number;
  hi: number;
  /** Friends of last night's delighted guests (exact). */
  friends: number;
  /** Expected guests of each species (street share + friends). */
  mix: number[];
}

export function forecast(r: Run, d = r.day): Forecast {
  const ctx = ctxOf(r, d);
  const mean = streetMean(r.rep, ctx, r.ups[UP.lantern] > 0);
  const wts = speciesWeights(r.rep, ctx.weather);
  const tot = wts.reduce((a, b) => a + b, 0) || 1;
  const fr = d === r.day ? r.friends.slice(0, TUNE.friendCap) : [];
  const mix = wts.map((w) => (mean * w) / tot);
  for (const sp of fr) mix[sp]++;
  return { ctx, street: mean, lo: Math.round(mean * 0.85), hi: Math.round(mean * 1.15), friends: fr.length, mix };
}

/** What one kind of guest does with a menu, averaged over the coins in their purse. */
export interface KindPlan {
  sp: number;
  /** Expected guests. */
  n: number;
  /** Share of them ordering each menu item (a badger's second dish counts too). */
  share: number[];
  /** Their pick with an average purse (menu index, or -1 and why). */
  pick: number;
  why?: Why;
  purse: [number, number];
  /** Share who leave delighted / happy (before any wait or sell-out). */
  delight: number;
  happy: number;
}

export interface Demand {
  kinds: KindPlan[];
  /** Expected orders of each menu item if nothing sells out. */
  orders: number[];
  revenue: number;
  /** Expected reputation from the guests who order (before any wait or sell-out). */
  rep: number;
  guests: number;
  buyers: number;
  /** Stove minutes the orders need, and minutes the stoves have. */
  cookMins: number;
  capacity: number;
}

export function demand(r: Run, menu: MenuItem[], f = forecast(r), stoves = 1 + r.ups[UP.stove]): Demand {
  const all = () => true;
  const W = worthTable(menu, f.ctx);
  const prices = menu.map((m) => m.price);
  const bases = menu.map((m) => DISHES[m.dish].base);
  const kinds: KindPlan[] = [];
  const orders = menu.map(() => 0);
  let revenue = 0, cookMins = 0, rep = 0, guests = 0, buyers = 0;
  f.mix.forEach((n, sp) => {
    if (n <= 0) return;
    guests += n;
    const [lo, hi] = purseRange(sp, f.ctx);
    const share = menu.map(() => 0);
    const k = hi - lo + 1;
    let delight = 0, happy = 0;
    for (let p = lo; p <= hi; p++) {
      const c = chooseFrom(W[sp], prices, bases, p, all);
      if (c.pick < 0) continue;
      share[c.pick] += 1 / k;
      const w = W[sp][c.pick];
      if (delights(menu[c.pick].dish, sp, w, prices[c.pick])) delight += 1 / k;
      else happy += 1 / k;
      if (SPECIES[sp].appetite > 1) {
        const c2 = chooseFrom(W[sp], prices, bases, p - prices[c.pick], all);
        if (c2.pick >= 0) share[c2.pick] += 1 / k;
      }
    }
    const mid = chooseFrom(W[sp], prices, bases, Math.round((lo + hi) / 2), all);
    kinds.push({ sp, n, share, pick: mid.pick, why: mid.why, purse: [lo, hi], delight, happy });
    rep += n * delight;
    cookMins += n * (delight + happy) * SERVE;
    buyers += n * (delight + happy);
    share.forEach((s, i) => {
      orders[i] += s * n;
      revenue += s * n * prices[i];
      cookMins += s * n * DISHES[menu[i].dish].cook;
    });
  });
  return { kinds, orders, revenue, rep, guests, buyers, cookMins, capacity: stoves * OPEN_MINUTES };
}
