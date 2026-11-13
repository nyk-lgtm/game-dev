import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DISHES,
  INGS,
  LAST_CALL,
  OPEN_MINUTES,
  SPECIES,
  STARS,
  TUNE,
  UP,
  act,
  actError,
  choose,
  delights,
  demand,
  forecast,
  makeCrowd,
  makeFestivals,
  makeWeather,
  marketPrice,
  newRun,
  onHand,
  openAction,
  parseOpen,
  repChange,
  replay,
  scoreOf,
  simulate,
  starsOf,
  worthOf,
  UPGRADES,
  fillNeed,
  lossFor,
  recipePreview,
  upgradePayback,
  allocateStock,
  ctxOf,
  queuePreview,
  helperPayback,
  wageOf,
  type Guest,
  type NightCtx,
} from '../../src/simmer/core';
import { STRATS, playSeason } from '../../scripts/simmer/bot';

const CLEAR: NightCtx = { weather: 'clear', festival: false, payday: false };
const guest = (sp: number, purse: number, at = 0, patience = 30, id = 0): Guest => ({ id, sp, purse, patience, at, friend: false });

describe('simmer core', () => {
  it('stays pure: no Math.random, Date or DOM in core/', () => {
    const dir = 'src/simmer/core';
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/Math\.random|Date\.|new Date|document\.|window\./);
    }
  });

  it('worth = base × love/dislike × weather × festival, rounded', () => {
    // Fox loves savoury: a fish skewer (savoury, warm) on a rainy night.
    const w = worthOf(3, 1, { weather: 'rain', festival: false, payday: false });
    expect(w.w).toBe(Math.round(12 * TUNE.love * 1.2));
    expect(w.parts.map((p) => p.x)).toEqual([TUNE.love, 1.2]);
    // Mouse dislikes fish.
    expect(worthOf(3, 0, CLEAR).w).toBe(Math.round(12 * TUNE.dislike));
    // Festival sweets.
    expect(worthOf(2, 1, { weather: 'clear', festival: true, payday: false }).w).toBe(Math.round(9 * TUNE.dislike * TUNE.festSweet));
  });

  it('a guest picks the most worth left over, within purse and in stock, and says why not', () => {
    const menu = [
      { dish: 0, price: 7 }, // rice ball: fox worth 10
      { dish: 1, price: 10 }, // bun: fox worth 14
    ];
    expect(choose(1, 12, menu, CLEAR, () => true)).toMatchObject({ pick: 1, wanted: 1 });
    expect(choose(1, 9, menu, CLEAR, () => true)).toMatchObject({ pick: 0 });
    expect(choose(1, 12, menu, CLEAR, (i) => i !== 1)).toMatchObject({ pick: 0, wanted: 1 });
    expect(choose(1, 12, menu, CLEAR, () => false)).toMatchObject({ pick: -1, why: 'soldout' });
    expect(choose(1, 6, menu, CLEAR, () => true)).toMatchObject({ pick: -1, why: 'pricey' });
    expect(choose(1, 99, [{ dish: 0, price: 30 }], CLEAR, () => true)).toMatchObject({ pick: -1, why: 'worth' });
    // A mouse offered only fish dishes it dislikes, priced at the list.
    expect(choose(0, 99, [{ dish: 3, price: 12 }], CLEAR, () => true)).toMatchObject({ pick: -1, why: 'nolike' });
  });

  it('delight needs a dish they love and a quarter of its worth left over', () => {
    expect(delights(1, 1, 14, 10)).toBe(true); // fox, bun (savoury) at the list price
    expect(delights(1, 1, 14, 11)).toBe(false);
    expect(delights(2, 1, 5, 1)).toBe(false); // fox, dango: not loved however cheap
  });

  it('the queue: stoves, patience, closing time, stock used', () => {
    const menu = [{ dish: 0, price: 7 }];
    const have = INGS.map(() => 0);
    have[0] = have[2] = 2; // two rice balls
    const gs = [guest(1, 12, 0, 30, 0), guest(1, 12, 0, 30, 1), guest(1, 12, 1, 30, 2), guest(1, 12, 1, 3, 3)];
    const n = simulate(gs, menu, CLEAR, 1, have);
    expect(n.sold).toEqual([2]);
    expect(have[0]).toBe(0);
    const by = (id: number) => n.visits.find((v) => v.g.id === id)!;
    expect(by(0)).toMatchObject({ pick: 0, t: 0, ready: 6 });
    expect(by(1)).toMatchObject({ pick: 0, t: 6 });
    expect(by(3)).toMatchObject({ pick: -1, why: 'slow', rep: -1 });
    expect(by(2)).toMatchObject({ pick: -1, why: 'soldout', rep: -1 });
    // Two stoves serve two at once.
    const have2 = INGS.map(() => 9);
    const n2 = simulate([guest(1, 12, 0, 30, 0), guest(1, 12, 0, 30, 1)], menu, CLEAR, 2, have2);
    expect(n2.visits.map((v) => v.t)).toEqual([0, 0]);
    // Late guests still queueing at closing leave.
    const late = Array.from({ length: 40 }, (_, i) => guest(2, 12, 200 + (i % 20), 99, i));
    const n3 = simulate(late, [{ dish: 1, price: 10 }], CLEAR, 1, INGS.map(() => 99));
    expect(n3.visits.some((v) => v.why === 'closed')).toBe(true);
    expect(n3.visits.every((v) => v.t <= OPEN_MINUTES)).toBe(true);
  });

  it('badgers eat two dishes when the purse allows', () => {
    const n = simulate([guest(5, 20)], [{ dish: 1, price: 9 }], CLEAR, 1, INGS.map(() => 9));
    expect(n.visits[0]).toMatchObject({ pick: 0, pick2: 0, paid: 18 });
    expect(n.sold).toEqual([2]);
  });

  it('crowds are seeded, arrive before last call and include friends', () => {
    const p = { seed: 7, day: 3, rep: 40, ctx: CLEAR, lanterns: false, bench: false, friends: [1, 1, 2] };
    const a = makeCrowd(p), b = makeCrowd(p);
    expect(a).toEqual(b);
    expect(a.every((g) => g.at < LAST_CALL && SPECIES[g.sp].rep <= 40)).toBe(true);
    expect(a.filter((g) => g.friend).map((g) => g.sp).sort()).toEqual([1, 1, 2]);
    // Moths never come out in the rain.
    const wet = makeCrowd({ ...p, rep: 100, ctx: { weather: 'rain', festival: false, payday: false }, friends: [] });
    expect(wet.some((g) => g.sp === 4)).toBe(false);
  });

  it('renown spreads only to those who have not heard yet; let-downs cost one each', () => {
    expect(repChange(0, 10, 0)).toEqual({ gain: 10, loss: 0, delta: 10 });
    expect(repChange(50, 10, 3)).toEqual({ gain: 5, loss: 2, delta: 3 });
    expect(repChange(90, 0, 40).loss).toBe(TUNE.lossCap);
    expect(repChange(95, 40, 0).delta).toBe(5); // floor: 40 × 20% = 8, capped at 100
    expect(repChange(99, 400, 0).delta).toBe(1);
    expect(repChange(1, 0, 5).delta).toBe(-1);
  });

  it('a season has weather drifting warm to chilly, three festivals with the last night one', () => {
    const w = makeWeather(42);
    expect(w).toHaveLength(TUNE.days);
    expect(makeFestivals(42)[2]).toBe(TUNE.days - 1);
    let early = 0, late = 0;
    for (let s = 0; s < 200; s++) {
      const ws = makeWeather(s);
      early += ws.slice(0, 5).filter((x) => x === 'chilly').length;
      late += ws.slice(15).filter((x) => x === 'chilly').length;
    }
    expect(late).toBeGreaterThan(early * 2);
  });

  it('actions: buying, learning, upgrades, opening; illegal ones change nothing', () => {
    const r = newRun(5);
    expect(actError(r, 'b4.99')).toBe('Not enough coins');
    const p = marketPrice(5, 0, 0).price;
    expect(act(r, 'b0.3')).toBe(true);
    expect(r.coins).toBe(TUNE.startCoins - 3 * p);
    expect(actError(r, 'l3')).toBe('Not enough coins');
    r.coins += 500;
    expect(act(r, 'l3')).toBe(true);
    expect(r.known[3]).toBe(true);
    expect(act(r, 'l3')).toBe(false);
    expect(act(r, 'o0x7.1x10.2x9.3x12')).toBe(false); // four dishes on a three-dish board
    expect(act(r, 'o9x5')).toBe(false); // unknown recipe
    expect(act(r, 'x')).toBe(false);
    expect(parseOpen(openAction([{ dish: 3, price: 12 }, { dish: 0, price: 7 }], true))).toEqual({ helper: true, menu: [{ dish: 3, price: 12 }, { dish: 0, price: 7 }] });
    const n = r.actions.length;
    expect(act(r, 'o0x7.3x12')).toBe(true);
    expect(r.actions.length).toBe(n + 1);
    expect(r.day).toBe(1);
    expect(r.ledgers[0].bought).toBe(3 * p);
  });

  it('ingredients spoil on their last night; a cool box keeps them one more', () => {
    const r = newRun(9);
    act(r, 'b4.2'); // fish keeps one night
    act(r, 'b0.2'); // rice keeps six
    act(r, 'o2x40'); // dango at 40: nobody buys
    expect(r.ledgers[0].wasted[4]).toBe(2);
    expect(onHand(r)[0]).toBe(2);
    const c = newRun(9);
    c.coins = 500;
    act(c, `u${UP.cool}`);
    act(c, 'b4.2');
    act(c, 'o2x40');
    expect(c.ledgers[0].wasted[4]).toBe(0);
    expect(onHand(c)[4]).toBe(2);
    act(c, 'o2x40');
    expect(c.ledgers[1].wasted[4]).toBe(2);
  });

  it('a broke stall gets a neighbour’s loan so it can always open', () => {
    const r = newRun(3);
    act(r, `b1.${Math.floor(r.coins / marketPrice(3, 0, 1).price)}`);
    expect(r.coins).toBeLessThan(8);
    act(r, 'o2x40');
    expect(r.coins).toBe(TUNE.safety);
    expect(r.gifts).toBeGreaterThan(0);
  });

  it('the forecast adds up and counts friends exactly', () => {
    const r = newRun(11);
    r.friends = [0, 1];
    const f = forecast(r);
    expect(f.mix.reduce((a, b) => a + b, 0)).toBeCloseTo(f.street + 2, 6);
    const d = demand(r, r.lastMenu, f);
    expect(d.orders.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(d.guests + 1e-9);
    expect(d.capacity).toBe(OPEN_MINUTES);
  });

  it('seasons replay exactly from seed + actions', () => {
    for (const seed of [1, 2]) {
      const r = playSeason(newRun(seed), STRATS.decent);
      expect(r.over).toBe(true);
      const again = replay(seed, r.actions);
      expect(again.coins).toBe(r.coins);
      expect(again.rep).toBe(r.rep);
      expect(again.ledgers).toEqual(r.ledgers);
    }
  });

  it('bots: naive lands on 1★, lazy (Fill to forecast) beats it, clever beats lazy', () => {
    let naive = 0, lazy = 0, clever = 0;
    const seeds = [21, 22, 23];
    for (const s of seeds) {
      naive += scoreOf(playSeason(newRun(s), STRATS.naive));
      lazy += scoreOf(playSeason(newRun(s), STRATS.lazy));
      clever += scoreOf(playSeason(newRun(s), STRATS.clever));
    }
    expect(starsOf(naive / 3)).toBe(1);
    expect(lazy).toBeGreaterThan(naive * 1.2);
    expect(clever).toBeGreaterThan(lazy * 1.1);
    expect(STARS).toHaveLength(3);
  });

  it('let-downs: every two cost a ♥, capped each night', () => {
    expect([0, 1, 2, 3, 4].map(lossFor)).toEqual([0, 1, 1, 2, 2]);
    expect(lossFor(100)).toBe(TUNE.lossCap);
  });

  it('the queue preview is deterministic, a helper shortens it, and the wage grows with the crowd', () => {
    const r = newRun(31);
    r.rep = 100;
    r.festivals = [0];
    const one = queuePreview(r, r.lastMenu, 1);
    expect(queuePreview(r, r.lastMenu, 1)).toEqual(one);
    expect(one.letdowns).toBeGreaterThan(1);
    expect(queuePreview(r, r.lastMenu, 2).letdowns).toBeLessThan(one.letdowns);
    const h = helperPayback(r, r.lastMenu);
    expect(h.saved).toBeCloseTo(h.before - h.after, 6);
    expect(wageOf(r)).toBeGreaterThan(wageOf(newRun(31)));
  });

  it('requests: from night reqFrom a kind asks for a loved dish; served it, they are delighted and tip', () => {
    const r = newRun(41);
    expect(ctxOf(r).req).toBeUndefined();
    r.day = TUNE.reqFrom;
    const q = ctxOf(r).req!;
    expect(q).toEqual(ctxOf(r).req);
    expect(DISHES[q.dish].tags).toContain(SPECIES[q.sp].loves);
    const ctx = ctxOf(r);
    const menu = [{ dish: q.dish, price: 1 }];
    const n = simulate([guest(q.sp, 99)], menu, ctx, 1, INGS.map(() => 9));
    expect(n.visits[0]).toMatchObject({ pick: 0, mood: 'delighted', tip: TUNE.reqTip, paid: 1 + TUNE.reqTip });
    expect(worthOf(q.dish, q.sp, ctx).parts.some((p) => p.x === TUNE.reqWorth)).toBe(true);
  });

  it('stock is shared between dishes in proportion to their orders', () => {
    // Rice ball (rice + greens) and dango (rice + berries) share 4 rice.
    const have = INGS.map(() => 9);
    have[0] = 4;
    expect(allocateStock([{ dish: 0, price: 7 }, { dish: 2, price: 9 }], [6, 2], have)).toEqual([3, 1]);
    expect(allocateStock([{ dish: 0, price: 7 }], [3], INGS.map(() => 9))).toEqual([3]);
  });

  it('at full renown, hearts beyond it come back as regulars’ tips', () => {
    const r = newRun(43);
    r.rep = 100;
    for (const a of ['b0.20', 'b2.20', 'b1.20', 'b3.20', 'b5.20', 'o0x5.1x8.2x7']) act(r, a);
    const l = r.ledgers[0];
    expect(r.rep).toBeLessThanOrEqual(100);
    expect(l.tips).toBe(l.overflow * TUNE.fullTip);
    expect(l.coins).toBe(r.coins);
  });

  it('payback estimates: recipes, upgrades, Fill to forecast', () => {
    const r = newRun(31);
    const p = recipePreview(r, 3, r.lastMenu);
    expect(p.lovers.map((sp) => SPECIES[sp].key).sort()).toEqual(['fox', 'heron', 'owl']);
    expect(p.replaces).toBeGreaterThanOrEqual(0); // the three-dish board is full
    for (let k = 0; k < UPGRADES.length; k++) {
      const u = upgradePayback(r, k, r.lastMenu);
      expect(Number.isFinite(u.perNight) && u.text.length > 5, UPGRADES[k].key).toBe(true);
    }
    // No recipe known beyond the menu: the board has nothing to add.
    expect(upgradePayback(r, UP.board, r.lastMenu).perNight).toBe(0);
    const need = fillNeed(r, r.lastMenu);
    const d = demand(r, r.lastMenu);
    expect(need[0]).toBe(Math.ceil((d.orders[0] + d.orders[2]) * 1.1 - 1e-9)); // rice: rice ball + dango
  });

  it('every dish is loved by some kind of guest, and every kind loves some dish', () => {
    for (const d of DISHES) expect(SPECIES.some((s) => d.tags.includes(s.loves)), d.name).toBe(true);
    for (const s of SPECIES) expect(DISHES.some((d) => d.tags.includes(s.loves)), s.name).toBe(true);
  });
});
