// What the morning can know about tonight: the weather, roughly how many guests
// and of which kinds, and (from their tastes and purses) what each kind would
// order off a given menu. It never looks at tonight's actual crowd.

import { DISHES, INGS, OPEN_MINUTES, SERVE, SPECIES, TUNE, UP, UPGRADES } from './data';
import { chooseFrom, delights, purseRange, speciesWeights, streetMean, worthTable, type MenuItem, type NightCtx, type Why } from './night';
import { ctxOf, marketPrice, menuSize, stovesOf, wageOf, type Run } from './run';
import { T_PREVIEW, makeCrowd, rngFor, simulate } from './night';

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

export function forecast(r: Run, d = r.day, lanterns = r.ups[UP.lantern] > 0): Forecast {
  const ctx = ctxOf(r, d);
  const mean = streetMean(r.rep, ctx, lanterns);
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

// ---------------------------------------------------------------- payback

/** Coins a portion of a dish costs at today's market. */
export const dishCost = (r: Run, dish: number): number => DISHES[dish].uses.reduce((a, u) => a + marketPrice(r.seed, r.day, u).price, 0);

/**
 * Expected profit of a menu tonight (takings − ingredients at today's prices), with
 * orders the stoves can't cook in time (beyond 85% of their minutes) taken off.
 */
export function profitOf(r: Run, menu: MenuItem[], f = forecast(r), stoves = stovesOf(r)): number {
  const d = demand(r, menu, f, stoves);
  let p = 0;
  menu.forEach((m, i) => (p += d.orders[i] * (m.price - dishCost(r, m.dish))));
  const cap = d.capacity * 0.85;
  return d.cookMins > cap ? (p * cap) / d.cookMins : p;
}

/** A recipe tried on tonight's menu: orders at its listed price, who loves it, what it would replace. */
export function recipePreview(r: Run, dish: number, menu: MenuItem[]): { orders: number; lovers: number[]; replaces: number } {
  const lovers = SPECIES.map((s, i) => (DISHES[dish].tags.includes(s.loves) ? i : -1)).filter((i) => i >= 0);
  const item = { dish, price: DISHES[dish].base };
  const f = forecast(r);
  let trial = [...menu, item];
  let replaces = -1;
  if (menu.length >= menuSize(r) && menu.length) {
    // The menu is full: it would take the place of the dish whose loss hurts least.
    let best = -Infinity;
    menu.forEach((_, i) => {
      const t = menu.map((m, k) => (k === i ? item : m));
      const v = profitOf(r, t, f);
      if (v > best) (best = v), (replaces = i), (trial = t);
    });
  }
  const d = demand(r, trial, f);
  return { orders: d.orders[replaces >= 0 ? replaces : trial.length - 1], lovers, replaces };
}

/** Rough coins a night an upgrade would add tonight, and a line saying why. */
export function upgradePayback(r: Run, k: number, menu: MenuItem[]): { perNight: number; text: string } {
  const f = forecast(r);
  const now = profitOf(r, menu, f);
  const key = UPGRADES[k].key;
  if (key === 'board') {
    let best = 0, name = '';
    for (let d = 0; d < DISHES.length; d++) {
      if (!r.known[d] || menu.some((m) => m.dish === d)) continue;
      const v = profitOf(r, [...menu, { dish: d, price: DISHES[d].base }], f) - now;
      if (v > best) (best = v), (name = DISHES[d].name);
    }
    return { perNight: best, text: best > 0 ? `${name} on the extra line would add ~${Math.round(best)}¢ tonight` : 'Learn another recipe first to fill the extra line' };
  }
  if (key === 'stove') {
    const h = helperPayback(r, menu);
    const per = h.saved * h.perGuest + (h.before >= QUEUE_WARN && h.saved * h.perGuest > h.wage ? h.wage : 0);
    return {
      perNight: h.saved * h.perGuest,
      text: h.before >= 0.5 ? `Tonight’s queue lets down ~${Math.round(h.before)} in a typical evening; with a second stove ~${Math.round(h.after)} (~${Math.round(per)}¢ tonight, no helper needed)` : 'One stove keeps up tonight',
    };
  }
  if (key === 'lantern') {
    const v = profitOf(r, menu, forecast(r, r.day, true)) - now;
    const g = forecast(r, r.day, true).street - f.street;
    return { perNight: v, text: `~${g.toFixed(1)} more guests tonight, ~${Math.round(v)}¢ more profit` };
  }
  if (key === 'bench') {
    const last = r.ledgers[r.ledgers.length - 1];
    const gave = last ? (last.left.slow ?? 0) : 0;
    const per = r.ledgers.length ? r.ledgers.reduce((a, l) => a + l.revenue, 0) / Math.max(1, r.ledgers.reduce((a, l) => a + l.served, 0)) : 8;
    return { perNight: gave * per * 0.5, text: gave ? `${gave} gave up waiting last night; about half would have stayed` : 'Nobody gave up waiting last night' };
  }
  // Cool box: cold dishes chilled tonight (more takers, more delights), plus what has been
  // thrown out so far (most would have kept).
  const cold = menu.filter((m) => DISHES[m.dish].tags.includes('cold'));
  const fc = { ...f, ctx: { ...f.ctx, cool: true } };
  const chill = profitOf(r, menu, fc) - now;
  const joy = demand(r, menu, fc).rep - demand(r, menu, f).rep;
  const waste = r.ledgers.reduce((a, l) => a + l.wasteCost, 0);
  const per = r.ledgers.length ? (waste / r.ledgers.length) * 0.6 : 0;
  const bits = [
    cold.length
      ? `${cold.map((m) => DISHES[m.dish].icon).join('')} worth ×${TUNE.coolCold} to every guest: ${
          chill >= 0.5 || joy >= 0.5
            ? `~${Math.round(Math.max(0, chill))}¢${joy >= 0.5 ? `, ~${Math.round(joy)} more delighted` : ''} tonight`
            : 'no extra takers at tonight’s prices, but room to charge more'
        }`
      : 'no cold dish on tonight’s menu',
    per >= 0.5 ? `~${Math.round(per)}¢ a night less thrown out` : 'little thrown out so far',
  ];
  return { perNight: Math.max(0, chill) + per + joy * 3, text: bits.join(' · ') };
}

/** The page warns about the queue when typical evenings let down at least this many guests. */
export const QUEUE_WARN = 1;

/** Units of each ingredient "Fill to forecast" aims to have: expected orders × 1.1, rounded up. */
export function fillNeed(r: Run, menu: MenuItem[], stoves = stovesOf(r)): number[] {
  const d = demand(r, menu, forecast(r), stoves);
  const need = INGS.map(() => 0);
  menu.forEach((m, i) => DISHES[m.dish].uses.forEach((u) => (need[u] += d.orders[i] * 1.1)));
  return need.map((n) => Math.ceil(n - 1e-9));
}

/**
 * Tonight's queue in a few typical evenings: crowds drawn from the forecast (their own seed
 * stream, never tonight's real crowd), the menu with unlimited stock, `stoves` cooking.
 * Averages guests who give up waiting or are still queueing at closing.
 */
export function queuePreview(r: Run, menu: MenuItem[], stoves: number, samples = 4): { slow: number; closed: number; letdowns: number } {
  const ctx = ctxOf(r);
  let slow = 0, closed = 0;
  for (let k = 0; k < samples; k++) {
    const guests = makeCrowd(
      { seed: r.seed, day: r.day, rep: r.rep, ctx, lanterns: r.ups[UP.lantern] > 0, bench: r.ups[UP.bench] > 0, friends: r.friends },
      rngFor(r.seed, T_PREVIEW, r.day, k),
    );
    const night = simulate(guests, menu, ctx, stoves, INGS.map(() => 999));
    for (const v of night.visits) {
      if (v.why === 'slow') slow++;
      else if (v.why === 'closed') closed++;
    }
  }
  return { slow: slow / samples, closed: closed / samples, letdowns: (slow + closed) / samples };
}

/**
 * What a helper (or a second stove) would do tonight: guests let down by the queue in a
 * typical evening now and with one more cook, and what each saved guest is worth (their
 * profit plus the half ♥ a let-down costs, at `repPts` a point).
 */
export function helperPayback(r: Run, menu: MenuItem[]): { before: number; after: number; saved: number; perGuest: number; value: number; wage: number } {
  const s = stovesOf(r);
  const before = queuePreview(r, menu, s).letdowns;
  const after = before > 0 ? queuePreview(r, menu, s + 1).letdowns : 0;
  const d = demand(r, menu, forecast(r), s);
  let profit = 0;
  menu.forEach((m, i) => (profit += d.orders[i] * (m.price - dishCost(r, m.dish))));
  const perGuest = (d.guests > 0 ? profit / d.guests : 0) + TUNE.repPts * TUNE.lossPer;
  const saved = Math.max(0, before - after);
  return { before, after, saved, perGuest, value: saved * perGuest, wage: wageOf(r) };
}
