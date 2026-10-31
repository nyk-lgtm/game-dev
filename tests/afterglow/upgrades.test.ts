import { describe, expect, it } from 'vitest';
import {
  BASE_WEAPONS,
  MAX_PASSIVES,
  MAX_WEAPONS,
  PASSIVES,
  WEAPONS,
  banish,
  choiceKey,
  choose,
  createWorld,
  evolvable,
  reroll,
  rollChoices,
  skip,
  takeChest,
  upgradePool,
  type Choice,
  type PassiveId,
  type WeaponId,
  type World,
} from '../../src/afterglow/core';
import { Rng } from '../../src/shared/rng';

const EVOLVED = (Object.keys(WEAPONS) as WeaponId[]).filter((id) => WEAPONS[id].from);

function levelUpWorld(seed = 1): World {
  const w = createWorld(seed);
  w.pendingLevels = 1;
  w.choices = rollChoices(w);
  return w;
}

function assertInvariants(w: World): void {
  expect(w.weapons.length).toBeLessThanOrEqual(MAX_WEAPONS);
  expect(Object.keys(w.passives).length).toBeLessThanOrEqual(MAX_PASSIVES);
  const ids = w.weapons.map((x) => x.id);
  expect(new Set(ids).size).toBe(ids.length);
  for (const ws of w.weapons) {
    expect(ws.level).toBeGreaterThanOrEqual(1);
    expect(ws.level).toBeLessThanOrEqual(WEAPONS[ws.id].maxLevel);
  }
  for (const [id, lvl] of Object.entries(w.passives) as [PassiveId, number][]) {
    expect(lvl).toBeLessThanOrEqual(PASSIVES[id].maxLevel);
  }
}

describe('rollChoices', () => {
  it('returns at most 3 distinct options, all drawn from the pool', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const w = createWorld(seed);
      const keys = new Set(upgradePool(w).map((p) => choiceKey(p.c)));
      const out = rollChoices(w);
      expect(out.length).toBeGreaterThan(0);
      expect(out.length).toBeLessThanOrEqual(3);
      expect(new Set(out.map(choiceKey)).size).toBe(out.length);
      for (const c of out) expect(keys.has(choiceKey(c))).toBe(true);
    }
  });

  it('offers a new weapon while holding fewer than 3 weapons at level <= 6', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const w = createWorld(seed);
      w.player.level = 1 + (seed % 6);
      const out = rollChoices(w);
      expect(out.some((c) => c.kind === 'weapon' && c.level === 1)).toBe(true);
    }
    // Also with two weapons.
    const w = createWorld(9);
    w.weapons.push({ id: 'orbit', level: 1, cd: 0, t: 0, dealt: 0 });
    w.player.level = 6;
    for (let i = 0; i < 30; i++) expect(rollChoices(w).some((c) => c.kind === 'weapon' && c.level === 1)).toBe(true);
  });

  it('never offers new weapons when the weapon slots are full', () => {
    const w = createWorld(3);
    for (const id of BASE_WEAPONS) if (w.weapons.length < MAX_WEAPONS && !w.weapons.some((x) => x.id === id)) w.weapons.push({ id, level: 1, cd: 0, t: 0, dealt: 0 });
    expect(w.weapons).toHaveLength(MAX_WEAPONS);
    for (const p of upgradePool(w)) if (p.c.kind === 'weapon') expect(p.c.level).toBeGreaterThan(1);
  });

  it('never offers an unowned passive when passive slots are full', () => {
    const w = createWorld(3);
    const ids = Object.keys(PASSIVES) as PassiveId[];
    for (const id of ids.slice(0, MAX_PASSIVES)) w.passives[id] = 1;
    for (const p of upgradePool(w)) if (p.c.kind === 'passive') expect(w.passives[p.c.id as PassiveId]).toBeGreaterThan(0);
  });

  it('never offers a maxed weapon or passive', () => {
    const w = createWorld(3);
    w.weapons[0].level = WEAPONS[w.weapons[0].id].maxLevel;
    w.passives.might = PASSIVES.might.maxLevel;
    for (const p of upgradePool(w)) {
      expect(choiceKey(p.c)).not.toBe(`weapon:${w.weapons[0].id}`);
      expect(choiceKey(p.c)).not.toBe('passive:might');
    }
  });

  it('falls back to a gold choice when nothing is left', () => {
    const w = createWorld(3);
    for (const id of Object.keys(PASSIVES) as PassiveId[]) w.banished.push(`passive:${id}`);
    for (const id of Object.keys(WEAPONS) as WeaponId[]) w.banished.push(`weapon:${id}`);
    expect(rollChoices(w)).toEqual([{ kind: 'gold', id: 'gold', level: 1 }]);
  });

  it('evolved weapons are never offered as level-ups or as new weapons', () => {
    for (const evo of EVOLVED) {
      const w = createWorld(4);
      const from = WEAPONS[evo].from!;
      w.weapons = [{ id: evo, level: 1, cd: 0, t: 0, dealt: 0 }];
      const pool = upgradePool(w);
      expect(pool.some((p) => p.c.kind === 'weapon' && p.c.id === evo)).toBe(false);
      // Its base form is replaced, so it should not be offered again either.
      expect(pool.some((p) => p.c.kind === 'weapon' && p.c.id === from)).toBe(false);
    }
    // Fresh worlds offer no evolved weapon at all.
    const pool = upgradePool(createWorld(4));
    for (const p of pool) if (p.c.kind === 'weapon') expect(EVOLVED).not.toContain(p.c.id);
  });
});

describe('choose', () => {
  it('a new weapon is added at level 1', () => {
    const w = levelUpWorld();
    w.choices = [{ kind: 'weapon', id: 'orbit', level: 1 }];
    choose(w, 0);
    const ws = w.weapons.find((x) => x.id === 'orbit');
    expect(ws?.level).toBe(1);
    expect(w.weapons).toHaveLength(2);
    expect(w.pendingLevels).toBe(0);
    expect(w.choices).toHaveLength(0);
  });

  it('an owned weapon gains a level', () => {
    const w = levelUpWorld();
    const id = w.weapons[0].id;
    w.choices = [{ kind: 'weapon', id, level: 2 }];
    choose(w, 0);
    expect(w.weapons[0].level).toBe(2);
    expect(w.weapons).toHaveLength(1);
  });

  it('a new passive starts at level 1 and levels up on repeat', () => {
    const w = levelUpWorld();
    w.pendingLevels = 2;
    w.choices = [{ kind: 'passive', id: 'might', level: 1 }];
    choose(w, 0);
    expect(w.passives.might).toBe(1);
    expect(w.stats.might).toBeGreaterThan(w.base.might);
    const m1 = w.stats.might;
    w.choices = [{ kind: 'passive', id: 'might', level: 2 }];
    choose(w, 0);
    expect(w.passives.might).toBe(2);
    expect(w.stats.might).toBeGreaterThan(m1);
  });

  it('vitality raises maxHp and heals by the same amount', () => {
    const w = levelUpWorld();
    w.player.hp = w.stats.maxHp - 10;
    const maxBefore = w.stats.maxHp;
    const hpBefore = w.player.hp;
    w.choices = [{ kind: 'passive', id: 'vitality', level: 1 }];
    choose(w, 0);
    const gain = w.stats.maxHp - maxBefore;
    expect(gain).toBeGreaterThan(0);
    expect(w.player.hp).toBeCloseTo(hpBefore + gain, 6);
    expect(w.player.hp).toBeLessThanOrEqual(w.stats.maxHp);
  });

  it('other passives move their stats in the right direction', () => {
    const cases: [PassiveId, keyof World['stats'], 1 | -1][] = [
      ['haste', 'haste', -1],
      ['reach', 'area', 1],
      ['velocity', 'velocity', 1],
      ['multicast', 'amount', 1],
      ['duration', 'duration', 1],
      ['swift', 'speed', 1],
      ['regen', 'regen', 1],
      ['magnet', 'magnet', 1],
    ];
    for (const [id, stat, dir] of cases) {
      const w = levelUpWorld();
      w.choices = [{ kind: 'passive', id, level: 1 }];
      const before = w.stats[stat];
      choose(w, 0);
      expect((w.stats[stat] - before) * dir).toBeGreaterThan(0);
    }
  });

  it('gold heals a little and grants shards', () => {
    const w = levelUpWorld();
    w.player.hp = 1;
    w.choices = [{ kind: 'gold', id: 'gold', level: 1 }];
    choose(w, 0);
    expect(w.player.hp).toBeGreaterThan(1);
    expect(w.shards).toBeGreaterThan(0);
  });

  it('rolls fresh choices while more level-ups are pending', () => {
    const w = levelUpWorld();
    w.pendingLevels = 2;
    choose(w, 0);
    expect(w.pendingLevels).toBe(1);
    expect(w.choices.length).toBeGreaterThan(0);
  });

  it('throws when there is nothing to choose', () => {
    const w = createWorld(1);
    expect(() => choose(w, 0)).toThrow();
    const w2 = levelUpWorld();
    expect(() => choose(w2, 99)).toThrow();
  });
});

describe('reroll, banish, skip', () => {
  it('reroll consumes a reroll and produces a valid new set', () => {
    const w = levelUpWorld();
    const before = w.rerolls;
    expect(before).toBeGreaterThan(0);
    reroll(w);
    expect(w.rerolls).toBe(before - 1);
    expect(w.choices.length).toBeGreaterThan(0);
    expect(w.choices.length).toBeLessThanOrEqual(3);
  });

  it('reroll does nothing without rerolls left or without a pending level-up', () => {
    const w = levelUpWorld();
    w.rerolls = 0;
    const c = w.choices;
    reroll(w);
    expect(w.choices).toBe(c);
    expect(w.rerolls).toBe(0);
    const w2 = createWorld(1);
    const n = w2.rerolls;
    reroll(w2);
    expect(w2.rerolls).toBe(n);
  });

  it('banish consumes a banish and the option never appears again', () => {
    const w = levelUpWorld(5);
    const target = w.choices[0];
    const key = choiceKey(target);
    const before = w.banishes;
    banish(w, 0);
    expect(w.banishes).toBe(before - 1);
    expect(w.banished).toContain(key);
    expect(w.choices.map(choiceKey)).not.toContain(key);
    expect(upgradePool(w).map((p) => choiceKey(p.c))).not.toContain(key);
    for (let i = 0; i < 300; i++) expect(rollChoices(w).map(choiceKey)).not.toContain(key);
  });

  it('banish is a no-op with no banishes left, on gold, or on a bad index', () => {
    const w = levelUpWorld();
    w.banishes = 0;
    const c = w.choices;
    banish(w, 0);
    expect(w.banished).toHaveLength(0);
    expect(w.choices).toBe(c);

    const g = levelUpWorld();
    g.choices = [{ kind: 'gold', id: 'gold', level: 1 }];
    banish(g, 0);
    expect(g.banished).toHaveLength(0);
    expect(g.banishes).toBeGreaterThan(0);

    const h = levelUpWorld();
    const n = h.banishes;
    banish(h, 10);
    expect(h.banishes).toBe(n);
  });

  it('skip consumes the level-up without changing the build', () => {
    const w = levelUpWorld();
    w.pendingLevels = 2;
    const weapons = JSON.stringify(w.weapons);
    skip(w);
    expect(w.pendingLevels).toBe(1);
    expect(w.choices.length).toBeGreaterThan(0);
    skip(w);
    expect(w.pendingLevels).toBe(0);
    expect(w.choices).toHaveLength(0);
    expect(JSON.stringify(w.weapons)).toBe(weapons);
    expect(w.passives).toEqual({});
    skip(w); // nothing pending: no-op
    expect(w.pendingLevels).toBe(0);
  });
});

describe('build limits', () => {
  it('random play never exceeds slot or level caps', () => {
    for (const seed of [1, 2, 3]) {
      const w = createWorld(seed);
      const pick = new Rng(seed * 101);
      w.pendingLevels = 400;
      w.choices = rollChoices(w);
      let i = 0;
      while (w.pendingLevels > 0) {
        const r = pick.next();
        if (r < 0.1) reroll(w);
        else if (r < 0.15) banish(w, Math.floor(pick.next() * w.choices.length));
        else if (r < 0.2) skip(w);
        else choose(w, Math.floor(pick.next() * w.choices.length));
        if (w.pendingLevels > 0) {
          expect(w.choices.length).toBeGreaterThan(0);
          expect(w.choices.length).toBeLessThanOrEqual(3);
        }
        assertInvariants(w);
        if (++i > 5000) throw new Error('runaway');
      }
      expect(w.player.hp).toBeLessThanOrEqual(w.stats.maxHp);
    }
  });

  it('chests only upgrade existing builds and respect the caps', () => {
    const w = createWorld(8);
    for (let i = 0; i < 200; i++) {
      w.chestQueue++;
      const got = takeChest(w);
      expect(got.length).toBeGreaterThan(0);
      assertInvariants(w);
    }
  });

  it('a chest with nothing to evolve never adds a brand-new weapon or passive', () => {
    const w = createWorld(2);
    const before = w.weapons.length;
    for (let i = 0; i < 20; i++) {
      w.chestQueue = 1;
      const got = takeChest(w);
      for (const c of got) expect(c.kind === 'gold' || c.level > 1).toBe(true);
    }
    expect(w.weapons).toHaveLength(before);
    expect(Object.keys(w.passives)).toHaveLength(0);
  });
});

describe('evolutions', () => {
  it('every base weapon defines a consistent evolution', () => {
    for (const id of BASE_WEAPONS) {
      const d = WEAPONS[id];
      expect(d.evolvesInto, id).toBeDefined();
      expect(d.evolvesWith, id).toBeDefined();
      expect(PASSIVES[d.evolvesWith!], id).toBeDefined();
      expect(WEAPONS[d.evolvesInto!].from).toBe(id);
    }
  });

  it('is evolvable only at max level with the matching passive', () => {
    for (const id of BASE_WEAPONS) {
      const d = WEAPONS[id];
      const w = createWorld(1);
      w.weapons = [{ id, level: d.maxLevel, cd: 0, t: 0, dealt: 0 }];
      expect(evolvable(w), `${id} without passive`).toEqual([]);
      w.passives[d.evolvesWith!] = 1;
      expect(evolvable(w), `${id} with passive`).toEqual([id]);
      w.weapons[0].level = d.maxLevel - 1;
      expect(evolvable(w), `${id} below max`).toEqual([]);
    }
  });

  it('a chest turns the evolvable weapon into its evolution at level 1', () => {
    for (const id of BASE_WEAPONS) {
      const d = WEAPONS[id];
      const w = createWorld(11);
      w.weapons = [{ id, level: d.maxLevel, cd: 5, t: 5, dealt: 0 }];
      w.passives[d.evolvesWith!] = 1;
      w.chestQueue = 1;
      const got: Choice[] = takeChest(w);
      expect(got[0]).toMatchObject({ kind: 'weapon', id: d.evolvesInto, level: 1, evolves: id });
      expect(w.weapons.map((x) => x.id)).toEqual([d.evolvesInto]);
      expect(w.weapons[0].level).toBe(1);
      expect(evolvable(w)).toEqual([]);
    }
  });

  it('multiple evolvable weapons evolve one per chest reward', () => {
    const w = createWorld(3);
    w.weapons = BASE_WEAPONS.slice(0, 2).map((id) => ({ id, level: WEAPONS[id].maxLevel, cd: 0, t: 0, dealt: 0 }));
    for (const id of BASE_WEAPONS.slice(0, 2)) w.passives[WEAPONS[id].evolvesWith!] = 1;
    expect(evolvable(w)).toHaveLength(2);
    w.chestQueue = 1;
    takeChest(w);
    const evolvedCount = w.weapons.filter((x) => WEAPONS[x.id].from).length;
    expect(evolvedCount).toBeGreaterThanOrEqual(1);
  });
});
