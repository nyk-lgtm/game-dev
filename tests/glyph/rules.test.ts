import { describe, expect, it } from 'vitest';
import {
  BENCH_SIZE,
  MOD,
  REROLL_COST,
  TIER_MULT,
  buy,
  casterBase,
  compileRow,
  fits,
  income,
  mergeAll,
  move,
  newGame,
  price,
  reroll,
  sell,
  sellValue,
  startBattle,
  toggleFreeze,
  finishBattle,
  type GameState,
  type Rune,
  type RuneId,
} from '../../src/glyph/core';

const R = (id: RuneId, tier: 1 | 2 | 3 = 1): Rune => ({ id, tier });

/** A fresh build-phase state with an empty loom, empty bench and lots of gold. */
function blank(seed = 1): GameState {
  const s = newGame(seed);
  s.loom = [
    [null, null, null, null],
    [null, null, null, null],
    [null, null, null, null],
  ];
  s.bench = new Array(BENCH_SIZE).fill(null);
  s.gold = 100;
  return s;
}

function shopOf(s: GameState, ...runes: Rune[]) {
  s.shop = runes.map((rune) => ({ rune, sold: false }));
}

describe('compileRow', () => {
  it('needs a caster in slot 0', () => {
    expect(compileRow([null, R('fire'), null, null])).toBeNull();
    expect(compileRow([R('fire'), R('heavy'), null, null])).toBeNull();
    expect(compileRow([R('bolt'), null, null, null])).not.toBeNull();
  });

  it('applies tier multipliers to caster damage', () => {
    for (const t of [1, 2, 3] as const) {
      const sp = compileRow([R('beam', t), null, null, null])!;
      expect(sp.dmg).toBeCloseTo(casterBase('beam').dmg * TIER_MULT[t]);
      expect(sp.cooldown).toBe(casterBase('beam').cooldown);
    }
    expect(TIER_MULT[2]).toBeGreaterThan(TIER_MULT[1]);
    expect(TIER_MULT[3]).toBeGreaterThan(TIER_MULT[2]);
  });

  it('applies modifier tiers', () => {
    const h1 = compileRow([R('bolt'), R('heavy', 1), null, null])!;
    const h3 = compileRow([R('bolt'), R('heavy', 3), null, null])!;
    expect(h1.dmg).toBeCloseTo(casterBase('bolt').dmg * MOD.heavyDmg(1));
    expect(h3.dmg).toBeCloseTo(casterBase('bolt').dmg * MOD.heavyDmg(3));
    const s2 = compileRow([R('rain'), R('split', 2), null, null])!;
    expect(s2.count).toBe(casterBase('rain').count + 2);
    const st = compileRow([R('bolt'), R('storm', 2), null, null])!;
    expect(st.chain).toBe(MOD.stormArcs(2));
    expect(st.element).toBe('storm');
    const ha = compileRow([R('bolt'), R('haste', 3), null, null])!;
    expect(ha.cooldown).toBeCloseTo(casterBase('bolt').cooldown * MOD.hasteCd(3));
    const pi = compileRow([R('bolt'), R('pierce', 2), null, null])!;
    expect(pi.pierce).toBe(1 + MOD.pierceThrough(2));
    expect(pi.shred).toBe(MOD.pierceShred(2));
    expect(compileRow([R('bolt'), R('gild', 2), R('leech', 3), null])!).toMatchObject({ gild: MOD.gild(2), leech: MOD.leech(3) });
  });

  it('reads modifiers left to right: fire after heavy burns hotter, last element wins', () => {
    const heavyFire = compileRow([R('bolt'), R('heavy'), R('fire'), null])!;
    const fireHeavy = compileRow([R('bolt'), R('fire'), R('heavy'), null])!;
    // Same hit either way (multiplication commutes)...
    expect(heavyFire.dmg).toBeCloseTo(fireHeavy.dmg);
    // ...but the burn is set from the hit as built when fire is read.
    expect(heavyFire.burn).toBeGreaterThan(fireHeavy.burn);
    expect(heavyFire.burn).toBeCloseTo(casterBase('bolt').dmg * MOD.heavyDmg(1) * MOD.fireDmg * MOD.fireBurn(1));
    expect(compileRow([R('bolt'), R('fire'), R('frost'), null])!.element).toBe('frost');
    expect(compileRow([R('bolt'), R('frost'), R('fire'), null])!.element).toBe('fire');
    // Burns don't stack: a second fire keeps the hotter burn.
    const ff = compileRow([R('bolt'), R('fire'), R('fire'), null])!;
    expect(ff.burn).toBeCloseTo(casterBase('bolt').dmg * MOD.fireDmg * MOD.fireDmg * MOD.fireBurn(1));
  });

  it('echo copies only the spell built to its left', () => {
    const sp = compileRow([R('bolt'), R('heavy'), R('echo'), R('split')])!;
    expect(sp.echoes).toHaveLength(1);
    const e = sp.echoes[0];
    expect(e.dmg).toBeCloseTo(casterBase('bolt').dmg * MOD.heavyDmg(1));
    expect(e.count).toBe(1); // split came after the echo
    expect(sp.count).toBe(2);
    expect(sp.dmg).toBeCloseTo((e.dmg * MOD.splitGain(1)) / 2);
    expect(e.echoes).toEqual([]);
    // Echo first copies the bare caster.
    const early = compileRow([R('bolt'), R('echo'), R('heavy'), null])!;
    expect(early.echoes[0].dmg).toBeCloseTo(casterBase('bolt').dmg);
    // Echo makes the row slower; higher tiers less so.
    const e1 = compileRow([R('bolt'), R('echo', 1), null, null])!;
    const e3 = compileRow([R('bolt'), R('echo', 3), null, null])!;
    expect(e1.cooldown).toBeCloseTo(casterBase('bolt').cooldown * MOD.echoCd(1));
    expect(e3.cooldown).toBeLessThan(e1.cooldown);
    // Two echoes: two copies, never nested.
    const two = compileRow([R('bolt'), R('echo'), R('fire'), R('echo')])!;
    expect(two.echoes).toHaveLength(2);
    expect(two.echoes[0].element).toBe('arcane');
    expect(two.echoes[1].element).toBe('fire');
    expect(two.echoes.every((x) => x.echoes.length === 0)).toBe(true);
  });

  it('ignores casters in modifier slots', () => {
    const sp = compileRow([R('bolt'), R('beam'), null, null])!;
    expect(sp).toEqual(compileRow([R('bolt'), null, null, null]));
  });
});

describe('mergeAll', () => {
  it('merges three identical runes across loom and bench into the first slot', () => {
    const s = blank();
    s.loom[0][0] = R('bolt');
    s.bench[2] = R('bolt');
    s.bench[4] = R('bolt');
    s.bench[5] = R('beam');
    expect(mergeAll(s)).toEqual([R('bolt', 2)]);
    expect(s.loom[0][0]).toEqual(R('bolt', 2));
    expect(s.bench).toEqual([null, null, null, null, null, R('beam')]);
  });

  it('needs the same tier and leaves a fourth copy alone', () => {
    const s = blank();
    s.bench = [R('fire'), R('fire', 2), R('fire'), null, null, null];
    expect(mergeAll(s)).toEqual([]);
    s.bench[3] = R('fire');
    s.bench[4] = R('fire');
    // Four fire1 → fire2 (in the first one's slot) + a leftover fire1.
    expect(mergeAll(s)).toEqual([R('fire', 2)]);
    expect(s.bench).toEqual([R('fire', 2), R('fire', 2), null, null, R('fire'), null]);
  });

  it('cascades up to tier 3 but never past it', () => {
    const s = blank();
    s.loom[1][0] = R('orb', 2);
    s.bench = [R('orb', 2), R('orb'), R('orb'), null, null, null];
    shopOf(s, R('orb'));
    // The bought orb auto-places into the empty row 0, the first slot scanned,
    // so both merges land there.
    const made = buy(s, 0)!;
    expect(made).toEqual([R('orb', 2), R('orb', 3)]);
    expect(s.loom[0][0]).toEqual(R('orb', 3));
    expect(s.loom[1][0]).toBeNull();
    expect([...s.loom.flat(), ...s.bench].filter(Boolean)).toEqual([R('orb', 3)]);
    s.bench = [R('orb', 3), R('orb', 3), null, null, null, null];
    expect(mergeAll(s)).toEqual([]);
  });
});

describe('buy', () => {
  it('spends the price and marks the offer sold', () => {
    const s = blank();
    s.gold = 10;
    shopOf(s, R('bolt'), R('fire', 2), R('nova', 3));
    expect(price(R('bolt'))).toBe(3);
    expect(price(R('fire'))).toBe(2);
    expect(price(R('fire', 2))).toBe(6);
    expect(price(R('nova', 3))).toBe(24);
    expect(buy(s, 0)).not.toBeNull();
    expect(s.gold).toBe(7);
    expect(s.shop[0].sold).toBe(true);
    expect(buy(s, 0)).toBeNull(); // already sold
    expect(buy(s, 2)).toBeNull(); // too poor
    expect(s.gold).toBe(7);
    expect(buy(s, 1)).not.toBeNull();
    expect(s.gold).toBe(1);
  });

  it('auto-places casters in the first empty row and modifiers after a caster', () => {
    const s = blank();
    shopOf(s, R('fire'), R('beam'), R('frost'), R('rain'), R('storm'));
    // A modifier with no caster anywhere goes to the bench.
    buy(s, 0);
    expect(s.bench[0]).toEqual(R('fire'));
    buy(s, 1);
    expect(s.loom[0][0]).toEqual(R('beam'));
    buy(s, 2);
    expect(s.loom[0][1]).toEqual(R('frost'));
    buy(s, 3);
    expect(s.loom[1][0]).toEqual(R('rain'));
    s.loom[0][2] = R('heavy');
    s.loom[0][3] = R('haste');
    buy(s, 4);
    expect(s.loom[1][1]).toEqual(R('storm'));
  });

  it('skips rows without a caster when placing modifiers', () => {
    const s = blank();
    s.loom[0] = [R('bolt'), R('heavy'), R('heavy', 2), R('haste')];
    s.loom[2][0] = R('nova');
    shopOf(s, R('split'));
    buy(s, 0);
    expect(s.loom[1][1]).toBeNull();
    expect(s.loom[2][1]).toEqual(R('split'));
  });

  it('honours an explicit destination only if it is empty and fits', () => {
    const s = blank();
    s.loom[0][0] = R('bolt');
    shopOf(s, R('fire'), R('heavy'), R('orb'));
    buy(s, 0, { area: 'loom', row: 0, col: 3 });
    expect(s.loom[0][3]).toEqual(R('fire'));
    // Occupied: falls back to auto-place.
    buy(s, 1, { area: 'loom', row: 0, col: 3 });
    expect(s.loom[0][1]).toEqual(R('heavy'));
    // A caster can't go in a modifier slot: auto-placed into an empty row.
    buy(s, 2, { area: 'loom', row: 0, col: 2 });
    expect(s.loom[0][2]).toBeNull();
    expect(s.loom[1][0]).toEqual(R('orb'));
  });

  it('falls back to the bench, and with a full bench only allows a completed trio', () => {
    const s = blank();
    s.loom = [0, 1, 2].map(() => [R('bolt', 3), R('heavy', 3), R('heavy', 3), R('heavy', 3)]);
    shopOf(s, R('frost'));
    buy(s, 0);
    expect(s.bench[0]).toEqual(R('frost'));
    s.bench = [R('fire'), R('frost'), R('storm'), R('fire'), R('split'), R('pierce')];
    shopOf(s, R('haste'), R('fire'), R('storm'));
    const gold = s.gold;
    expect(buy(s, 0)).toBeNull(); // no room, no trio
    expect(buy(s, 2)).toBeNull(); // only one storm owned
    expect(s.gold).toBe(gold);
    expect(buy(s, 1)).toEqual([R('fire', 2)]);
    expect(s.gold).toBe(gold - 2);
    expect(s.bench).toHaveLength(BENCH_SIZE);
    expect(s.bench[0]).toEqual(R('fire', 2));
    expect(s.bench[3]).toBeNull();
  });

  it('is build-phase only', () => {
    const s = newGame(3);
    s.gold = 50;
    startBattle(s);
    expect(buy(s, 0)).toBeNull();
    expect(reroll(s)).toBe(false);
    expect(sell(s, { area: 'loom', row: 0, col: 0 })).toBe(false);
    expect(toggleFreeze(s)).toBe(false);
  });
});

describe('move', () => {
  it('keeps casters in slot 0 and modifiers out of it', () => {
    const s = blank();
    s.loom[0] = [R('bolt'), R('fire'), null, null];
    s.bench = [R('beam'), R('heavy'), null, null, null, null];
    expect(fits(R('bolt'), { area: 'loom', row: 1, col: 0 })).toBe(true);
    expect(fits(R('bolt'), { area: 'loom', row: 1, col: 1 })).toBe(false);
    expect(fits(R('fire'), { area: 'loom', row: 1, col: 0 })).toBe(false);
    expect(fits(R('fire'), { area: 'bench', i: 3 })).toBe(true);
    expect(move(s, { area: 'loom', row: 0, col: 0 }, { area: 'loom', row: 0, col: 2 })).toBe(false);
    expect(move(s, { area: 'loom', row: 0, col: 1 }, { area: 'loom', row: 1, col: 0 })).toBe(false);
    // A caster can't swap with a bench modifier (the modifier would land in slot 0).
    expect(move(s, { area: 'loom', row: 0, col: 0 }, { area: 'bench', i: 1 })).toBe(false);
    // But it can with a bench caster.
    expect(move(s, { area: 'loom', row: 0, col: 0 }, { area: 'bench', i: 0 })).toBe(true);
    expect(s.loom[0][0]).toEqual(R('beam'));
    expect(s.bench[0]).toEqual(R('bolt'));
    // Modifiers swap freely between modifier slots and the bench.
    expect(move(s, { area: 'bench', i: 1 }, { area: 'loom', row: 0, col: 1 })).toBe(true);
    expect(s.loom[0][1]).toEqual(R('heavy'));
    expect(s.bench[1]).toEqual(R('fire'));
    expect(move(s, { area: 'loom', row: 0, col: 1 }, { area: 'loom', row: 2, col: 3 })).toBe(true);
    expect(s.loom[2][3]).toEqual(R('heavy'));
    expect(s.loom[0][1]).toBeNull();
    // Nothing to move, or the shop: no.
    expect(move(s, { area: 'bench', i: 5 }, { area: 'bench', i: 4 })).toBe(false);
    expect(move(s, { area: 'shop', i: 0 }, { area: 'bench', i: 4 })).toBe(false);
  });
});

describe('economy', () => {
  it('sells for 1 / 4 / 10 by tier', () => {
    expect([1, 2, 3].map((t) => sellValue(R('fire', t as 1 | 2 | 3)))).toEqual([1, 4, 10]);
    const s = blank();
    s.gold = 0;
    s.bench[1] = R('nova', 2);
    expect(sell(s, { area: 'bench', i: 1 })).toBe(true);
    expect(s.gold).toBe(4);
    expect(s.bench[1]).toBeNull();
    expect(sell(s, { area: 'bench', i: 1 })).toBe(false);
    s.loom[0][0] = R('bolt', 3);
    expect(sell(s, { area: 'loom', row: 0, col: 0 })).toBe(true);
    expect(s.gold).toBe(14);
  });

  it('rerolls for REROLL_COST into a new, seeded shop', () => {
    const a = newGame(7);
    const b = newGame(7);
    a.gold = b.gold = REROLL_COST;
    const before = JSON.stringify(a.shop);
    expect(reroll(a)).toBe(true);
    expect(a.gold).toBe(0);
    expect(a.rerolls).toBe(1);
    expect(JSON.stringify(a.shop)).not.toBe(before);
    expect(reroll(a)).toBe(false);
    reroll(b);
    expect(b.shop).toEqual(a.shop);
  });

  it('pays income with interest (+1 per 5 banked, up to +3) and kill gold', () => {
    const s = newGame(1);
    s.wave = 1;
    s.gold = 4;
    expect(income(s, 0)).toBe(5);
    s.gold = 5;
    expect(income(s, 0)).toBe(6);
    s.gold = 14;
    expect(income(s, 2)).toBe(9);
    s.gold = 40;
    expect(income(s, 0)).toBe(8);
    s.wave = 6;
    expect(income(s, 0)).toBe(10);
    // Paid out at the end of a battle.
    const g = newGame(2);
    g.gold = 10;
    g.loom[0] = [R('bolt', 3), R('haste', 3), R('split', 3), R('echo', 3)];
    startBattle(g);
    finishBattle(g);
    expect(g.phase).toBe('build');
    expect(g.wave).toBe(2);
    expect(g.gold).toBe(10 + 5 + 0 + 2 + g.battle!.goldEarned);
  });

  it('a frozen shop survives the battle (once); otherwise a new one is rolled', () => {
    const s = newGame(5);
    s.loom[0] = [R('bolt', 3), R('haste', 3), R('split', 3), R('echo', 3)];
    s.gold = 20;
    buy(s, 1);
    const shop = JSON.stringify(s.shop);
    expect(toggleFreeze(s)).toBe(true);
    expect(s.frozen).toBe(true);
    startBattle(s);
    finishBattle(s);
    expect(JSON.stringify(s.shop)).toBe(shop);
    expect(s.frozen).toBe(false);
    startBattle(s);
    finishBattle(s);
    expect(JSON.stringify(s.shop)).not.toBe(shop);
    // Toggling twice is a no-op.
    toggleFreeze(s);
    toggleFreeze(s);
    expect(s.frozen).toBe(false);
  });

  it('offers a caster while a row is empty', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = newGame(seed);
      expect(s.shop.some((o) => o.rune.id === 'bolt' || o.rune.id === 'beam' || o.rune.id === 'nova' || o.rune.id === 'rain' || o.rune.id === 'orb')).toBe(true);
    }
  });
});
