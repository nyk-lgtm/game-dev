// The evening: who comes, what each guest thinks a dish is worth, what they
// choose, and a minute-by-minute queue at the stall. Pure and deterministic:
// the crowd comes from rngFor(seed, T_CROWD, day) and the state of the run.

import { Rng, mixSeed } from '../../shared/rng';
import { DISHES, LAST_CALL, OPEN_MINUTES, SERVE, SPECIES, TAG_WORD, TUNE, WEATHER, type WeatherId } from './data';

export function rngFor(seed: number, ...parts: number[]): Rng {
  let h = seed >>> 0;
  for (const p of parts) h = mixSeed(h, p >>> 0);
  return new Rng(h);
}
export const T_CROWD = 0x637277, T_WEATHER = 0x776561, T_MARKET = 0x6d6b74, T_FEST = 0x666573, T_PREVIEW = 0x707276;

/** What tonight is like, for worth and purses. */
export interface NightCtx {
  weather: WeatherId;
  festival: boolean;
  payday: boolean;
  /** The stall has a cool box: cold dishes are served properly chilled. */
  cool?: boolean;
}

export interface MenuItem {
  dish: number;
  price: number;
}

export interface Guest {
  id: number;
  sp: number;
  purse: number;
  patience: number;
  /** Minute they arrive. */
  at: number;
  /** Came because a friend was delighted last night. */
  friend: boolean;
}

/** How a dish's worth to a guest is built: base × each factor. */
export interface Worth {
  w: number;
  parts: { label: string; x: number }[];
}

export function worthOf(dish: number, sp: number, ctx: NightCtx): Worth {
  const d = DISHES[dish];
  const s = SPECIES[sp];
  const parts: { label: string; x: number }[] = [];
  if (d.tags.includes(s.loves)) parts.push({ label: `${s.plural.toLowerCase()} love ${TAG_WORD[s.loves]}`, x: TUNE.love });
  if (d.tags.includes(s.dislikes)) parts.push({ label: `${s.plural.toLowerCase()} dislike ${TAG_WORD[s.dislikes]}`, x: TUNE.dislike });
  const wx = WEATHER[ctx.weather];
  for (const t of d.tags) {
    const x = wx.tags[t];
    if (x) parts.push({ label: `${TAG_WORD[t]} on a ${wx.name.toLowerCase()} night`, x });
  }
  if (ctx.festival && d.tags.includes('sweet')) parts.push({ label: 'festival treat', x: TUNE.festSweet });
  if (ctx.cool && d.tags.includes('cold')) parts.push({ label: 'chilled in the cool box', x: TUNE.coolCold });
  let w = d.base;
  for (const p of parts) w *= p.x;
  return { w: Math.round(w), parts };
}

/** A dish with the tag they love, at a price that leaves a quarter of its worth unspent. */
export const delights = (dish: number, sp: number, w: number, price: number): boolean => DISHES[dish].tags.includes(SPECIES[sp].loves) && w - price >= TUNE.delight * w;

export type Why ='pricey' | 'worth' | 'soldout' | 'nolike' | 'slow' | 'closed';
export type Mood = 'delighted' | 'happy' | 'meh';

/** A guest's decision at the counter. */
export interface Choice {
  /** Index into the menu, or -1. */
  pick: number;
  /** What they'd have liked best if everything were in stock (menu index), or -1. */
  wanted: number;
  why?: Why;
}

/**
 * Pick the menu dish with the most worth left over (worth − price) among those in
 * stock, worth at least the price and within the purse. Ties: the higher worth, then
 * menu order. `ws` are the dishes' worths to this guest, `stock(i)` says whether menu
 * item i can still be cooked.
 */
export function chooseFrom(ws: number[], prices: number[], bases: number[], purse: number, stock: (i: number) => boolean): Choice {
  let pick = -1, ps = -1, pw = -1;
  let wanted = -1, wsur = -1, ww = -1;
  let anyWorth = false;
  for (let i = 0; i < ws.length; i++) {
    const w = ws[i];
    const p = prices[i];
    if (p > w) continue;
    anyWorth = true;
    if (p > purse) continue;
    const s = w - p;
    if (s > wsur || (s === wsur && w > ww)) (wanted = i), (wsur = s), (ww = w);
    if (!stock(i)) continue;
    if (s > ps || (s === ps && w > pw)) (pick = i), (ps = s), (pw = w);
  }
  if (pick >= 0) return { pick, wanted };
  if (wanted >= 0) return { pick, wanted, why: 'soldout' };
  if (anyWorth) return { pick, wanted, why: 'pricey' };
  // Nothing on the menu is worth its price to them: was it the price or the menu?
  const liked = ws.some((w, i) => w >= bases[i]);
  return { pick, wanted, why: liked ? 'worth' : 'nolike' };
}

export function choose(sp: number, purse: number, menu: MenuItem[], ctx: NightCtx, stock: (i: number) => boolean): Choice {
  return chooseFrom(
    menu.map((m) => worthOf(m.dish, sp, ctx).w),
    menu.map((m) => m.price),
    menu.map((m) => DISHES[m.dish].base),
    purse,
    stock,
  );
}

/** Worth of each menu item to each species tonight. */
export const worthTable = (menu: MenuItem[], ctx: NightCtx): number[][] => SPECIES.map((_, sp) => menu.map((m) => worthOf(m.dish, sp, ctx).w));

// ---------------------------------------------------------------- crowd

export interface CrowdParams {
  seed: number;
  day: number;
  rep: number;
  ctx: NightCtx;
  lanterns: boolean;
  bench: boolean;
  /** Species of last night's delighted guests (each brings a friend). */
  friends: number[];
}

/** Species that visit at this reputation. */
export const unlocked = (rep: number): number[] => SPECIES.map((s, i) => (rep >= s.rep ? i : -1)).filter((i) => i >= 0);

/** Each species' share of tonight's street crowd. */
export function speciesWeights(rep: number, weather: WeatherId): number[] {
  return SPECIES.map((s) => (rep >= s.rep ? s.weight * (s.likes[weather] ?? 1) : 0));
}

/** Expected street guests before the ±15% night-to-night noise. */
export function streetMean(rep: number, ctx: NightCtx, lanterns: boolean): number {
  return (TUNE.street0 + TUNE.streetK * rep) * WEATHER[ctx.weather].crowd * (ctx.festival ? TUNE.festival : 1) * (lanterns ? TUNE.lanterns : 1);
}

export const purseMult = (ctx: NightCtx): number => (ctx.payday ? TUNE.payday : 1) * (ctx.festival ? TUNE.festPurse : 1);
export const purseRange = (sp: number, ctx: NightCtx): [number, number] => {
  const m = purseMult(ctx);
  const [lo, hi] = SPECIES[sp].purse;
  return [Math.round(lo * m), Math.round(hi * m)];
};
export const patienceOf = (sp: number, bench: boolean): number => Math.round(SPECIES[sp].patience * (bench ? 1.5 : 1));

export function makeCrowd(p: CrowdParams, rng = rngFor(p.seed, T_CROWD, p.day)): Guest[] {
  const mean = streetMean(p.rep, p.ctx, p.lanterns);
  const n = Math.max(1, Math.round(mean * (0.85 + 0.3 * rng.next())));
  const wts = speciesWeights(p.rep, p.ctx.weather);
  const total = wts.reduce((a, b) => a + b, 0);
  const pickSp = (): number => {
    let x = rng.next() * total;
    for (let i = 0; i < wts.length; i++) if ((x -= wts[i]) < 0 && wts[i] > 0) return i;
    return 0;
  };
  const out: Guest[] = [];
  const add = (sp: number, friend: boolean) => {
    const s = SPECIES[sp];
    const [lo, hi] = purseRange(sp, p.ctx);
    out.push({ id: 0, sp, purse: rng.int(lo, hi), patience: patienceOf(sp, p.bench), at: rng.int(s.window[0], Math.min(s.window[1], LAST_CALL - 1)), friend });
  };
  for (let i = 0; i < n; i++) {
    const sp = pickSp();
    add(sp, false);
    // Mice come in little groups, arriving together.
    if (sp === 0 && rng.next() < 0.35 && i + 1 < n) {
      const lead = out[out.length - 1];
      add(0, false);
      out[out.length - 1].at = Math.min(LAST_CALL - 1, lead.at + rng.int(0, 2));
      i++;
    }
  }
  for (const sp of p.friends.slice(0, TUNE.friendCap)) add(sp, true);
  out.sort((a, b) => a.at - b.at);
  out.forEach((g, i) => (g.id = i));
  return out;
}

// ---------------------------------------------------------------- the evening

export interface Visit {
  g: Guest;
  /** Minute they reached the counter (or gave up). */
  t: number;
  /** Menu index of the first dish, or -1 if they left without buying. */
  pick: number;
  /** A second dish (badgers), menu index or -1. */
  pick2: number;
  wanted: number;
  why?: Why;
  mood?: Mood;
  /** Minutes in the queue. */
  waited: number;
  slow: boolean;
  /** Paid, both dishes. */
  paid: number;
  rep: number;
  /** Stove they cooked on, and when their food was ready. */
  stove: number;
  ready: number;
}

export interface NightResult {
  guests: Guest[];
  visits: Visit[];
  /** Portions sold per menu item. */
  sold: number[];
  revenue: number;
  rep: number;
  /** Species of delighted guests: they bring a friend tomorrow. */
  friends: number[];
  /** Menu item → minute it sold out (or -1). */
  soldOutAt: number[];
}

export const REP_FOR: Record<Mood | Why, number> = { delighted: 1, happy: 0, meh: 0, pricey: 0, worth: 0, nolike: 0, soldout: -1, slow: -1, closed: -1 };

/**
 * Runs the evening. `have` is the units of each ingredient on hand; it is used up as
 * dishes are cooked (the caller removes the same amounts from its stock).
 */
export function simulate(guests: Guest[], menu: MenuItem[], ctx: NightCtx, stoves: number, have: number[]): NightResult {
  const left = have.slice();
  const canCook = (i: number) => {
    const need: number[] = [];
    for (const u of DISHES[menu[i].dish].uses) need[u] = (need[u] ?? 0) + 1;
    return need.every((n, u) => n === undefined || left[u] >= n);
  };
  const cook = (i: number) => {
    for (const u of DISHES[menu[i].dish].uses) left[u]--;
  };
  const busy = Array(stoves).fill(0);
  const queue: Guest[] = [];
  const visits: Visit[] = [];
  const sold = menu.map(() => 0);
  const soldOutAt = menu.map(() => -1);
  const W = worthTable(menu, ctx);
  const prices = menu.map((m) => m.price);
  const bases = menu.map((m) => DISHES[m.dish].base);
  let gi = 0;
  const markSoldOut = (t: number) => menu.forEach((_, i) => soldOutAt[i] < 0 && !canCook(i) && (soldOutAt[i] = t));
  markSoldOut(0);
  for (let t = 0; t <= OPEN_MINUTES; t++) {
    while (gi < guests.length && guests[gi].at <= t) queue.push(guests[gi++]);
    if (t === OPEN_MINUTES) {
      for (const g of queue) visits.push({ g, t, pick: -1, pick2: -1, wanted: -1, why: 'closed', waited: t - g.at, slow: true, paid: 0, rep: REP_FOR.closed, stove: -1, ready: t });
      queue.length = 0;
      break;
    }
    for (let s = 0; s < stoves && queue.length; s++) {
      if (busy[s] > t) continue;
      // The next guest steps up; one who leaves frees the counter for the next.
      while (queue.length && busy[s] <= t) {
        const g = queue.shift()!;
        const c = chooseFrom(W[g.sp], prices, bases, g.purse, canCook);
        const waited = t - g.at;
        const slow = waited * 2 > g.patience;
        if (c.pick < 0) {
          visits.push({ g, t, pick: -1, pick2: -1, wanted: c.wanted, why: c.why, waited, slow, paid: 0, rep: REP_FOR[c.why!], stove: -1, ready: t });
          continue;
        }
        cook(c.pick);
        let paid = menu[c.pick].price;
        let mins = SERVE + DISHES[menu[c.pick].dish].cook;
        sold[c.pick]++;
        let pick2 = -1;
        if (SPECIES[g.sp].appetite > 1) {
          const c2 = chooseFrom(W[g.sp], prices, bases, g.purse - paid, canCook);
          if (c2.pick >= 0) {
            cook(c2.pick);
            pick2 = c2.pick;
            paid += menu[c2.pick].price;
            mins += DISHES[menu[c2.pick].dish].cook;
            sold[c2.pick]++;
          }
        }
        markSoldOut(t);
        const w = W[g.sp][c.pick];
        let mood: Mood = delights(menu[c.pick].dish, g.sp, w, menu[c.pick].price) ? 'delighted' : 'happy';
        // Settling for a second choice is never delightful; a long wait takes a step off.
        if (c.wanted !== c.pick && mood === 'delighted') mood = 'happy';
        if (slow) mood = mood === 'delighted' ? 'happy' : 'meh';
        busy[s] = t + mins;
        visits.push({ g, t, pick: c.pick, pick2, wanted: c.wanted, mood, waited, slow, paid, rep: REP_FOR[mood], stove: s, ready: t + mins });
      }
    }
    // Anyone who has queued past their patience walks off.
    for (let i = queue.length - 1; i >= 0; i--) {
      const g = queue[i];
      if (t - g.at >= g.patience) {
        queue.splice(i, 1);
        visits.push({ g, t, pick: -1, pick2: -1, wanted: -1, why: 'slow', waited: t - g.at, slow: true, paid: 0, rep: REP_FOR.slow, stove: -1, ready: t });
      }
    }
  }
  visits.sort((a, b) => a.t - b.t || a.g.id - b.g.id);
  const revenue = visits.reduce((a, v) => a + v.paid, 0);
  const rep = visits.reduce((a, v) => a + v.rep, 0);
  const friends = visits.filter((v) => v.mood === 'delighted').map((v) => v.g.sp);
  // What's left of `have` is written back so the caller can take it from its stock.
  for (let u = 0; u < have.length; u++) have[u] = left[u];
  return { guests, visits, sold, revenue, rep, friends, soldOutAt };
}
