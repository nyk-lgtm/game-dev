import { describe, expect, it } from 'vitest';
import {
  ADJ,
  HAND,
  HEXES,
  N,
  PLAYS,
  SEASONS,
  apply,
  census,
  clone,
  decode,
  encode,
  makeIsland,
  moisture,
  newGame,
  placeError,
  replay,
  seasonReport,
  simulate,
  weatherFor,
  type Action,
  type GameState,
} from '../../src/rewild/core';
import { run } from '../../scripts/rewild/bot';

const blank = (seed = 1): GameState => {
  const s = newGame(seed);
  for (const c of s.cells) {
    c.plant = null;
    c.animal = null;
  }
  return s;
};

describe('island', () => {
  it('is a 61-cell hex disc with symmetric neighbors', () => {
    expect(N).toBe(61);
    expect(HEXES.length).toBe(61);
    for (let i = 0; i < N; i++) for (const j of ADJ[i]) expect(ADJ[j]).toContain(i);
  });

  it('is deterministic and has water, soil and rock', () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const a = makeIsland(seed);
      expect(makeIsland(seed)).toEqual(a);
      const kinds = new Set(a.map((c) => c.t));
      expect(kinds.has('shallows')).toBe(true);
      expect(kinds.has('pond')).toBe(true);
      expect(kinds.has('soil')).toBe(true);
      expect(a.filter((c) => c.t === 'shallows').length).toBeGreaterThanOrEqual(9);
    }
  });
});

describe('moisture', () => {
  it('is 3 on water, and higher next to ponds than inland', () => {
    const s = newGame(5);
    const wet = moisture(s.cells, 'fair');
    s.cells.forEach((c, i) => {
      if (c.t === 'pond' || c.t === 'shallows') expect(wet[i]).toBe(3);
    });
    const pond = s.cells.findIndex((c) => c.t === 'pond');
    for (const j of ADJ[pond]) if (s.cells[j].t === 'rock' || s.cells[j].t === 'sand' || s.cells[j].t === 'soil') expect(wet[j]).toBeGreaterThanOrEqual(2);
  });

  it('drops in a drought and rises in a storm', () => {
    const s = newGame(5);
    const fair = moisture(s.cells, 'fair');
    const dry = moisture(s.cells, 'drought');
    const wet = moisture(s.cells, 'storm');
    s.cells.forEach((c, i) => {
      if (c.t === 'rock' || c.t === 'soil' || c.t === 'sand') {
        expect(dry[i]).toBe(Math.max(0, fair[i] - 1));
        expect(wet[i]).toBe(Math.min(3, fair[i] + 1));
      }
    });
  });
});

describe('turns', () => {
  it('deals a hand with lichen first, two plays a season', () => {
    const s = newGame(7);
    expect(s.hand.length).toBe(HAND);
    expect(s.hand).toContain('lichen');
    expect(new Set(s.hand).size).toBe(HAND);
    const rock = s.cells.findIndex((c) => c.t === 'rock');
    const card = s.hand.indexOf('lichen');
    expect(apply(s, { type: 'place', card, cell: rock })).not.toBeNull();
    expect(s.plays).toBe(PLAYS - 1);
    expect(s.hand.length).toBe(HAND - 1);
    expect(s.cells[rock].plant?.id).toBe('lichen');
  });

  it('rejects illegal placements', () => {
    const s = newGame(7);
    const card = s.hand.indexOf('lichen');
    const shallows = s.cells.findIndex((c) => c.t === 'shallows');
    expect(placeError(s, card, shallows)).not.toBeNull();
    expect(apply(s, { type: 'place', card, cell: shallows })).toBeNull();
  });

  it('only rerolls before playing, and costs a reroll', () => {
    const s = newGame(8);
    const before = [...s.hand];
    const r = s.rerolls;
    expect(apply(s, { type: 'reroll' })).not.toBeNull();
    expect(s.rerolls).toBe(r - 1);
    expect(s.hand).not.toEqual(before);
    const i = s.cells.findIndex((_, k) => s.hand.some((_, c) => placeError(s, c, k) === null));
    const c = s.hand.findIndex((_, c) => placeError(s, c, i) === null);
    apply(s, { type: 'place', card: c, cell: i });
    expect(apply(s, { type: 'reroll' })).toBeNull();
  });

  it('ends after twenty seasons', () => {
    const s = newGame(9);
    for (let k = 0; k < SEASONS; k++) expect(apply(s, { type: 'end' })).not.toBeNull();
    expect(s.over).toBe(true);
    expect(s.log.length).toBe(SEASONS);
    expect(apply(s, { type: 'end' })).toBeNull();
  });

  it('weather is fixed by the seed and calm at the start', () => {
    expect(weatherFor(3, 0).weather).toBe('fair');
    expect(weatherFor(3, 1).weather).toBe('fair');
    for (let k = 0; k < SEASONS; k++) expect(weatherFor(3, k)).toEqual(weatherFor(3, k));
    const kinds = new Set<string>();
    for (let seed = 0; seed < 40; seed++) for (let k = 0; k < SEASONS; k++) kinds.add(weatherFor(seed, k).weather);
    expect([...kinds].sort()).toEqual(['drought', 'fair', 'fire', 'harsh', 'storm']);
  });
});

describe('ecology', () => {
  it('full lichen spreads and turns rock into soil', () => {
    const s = blank(11);
    s.weather = 'fair';
    s.season = 0;
    const rock = s.cells.findIndex((c, i) => c.t === 'rock' && ADJ[i].filter((j) => s.cells[j].t === 'rock').length >= 2);
    s.cells[rock].plant = { id: 'lichen', n: 3, age: 2 };
    const ev = simulate(s);
    expect(s.cells[rock].t).toBe('soil');
    expect(s.cells[rock].fert).toBeGreaterThanOrEqual(1);
    expect(s.cells[rock].plant).toBeNull();
    expect(ev.filter((e) => e.type === 'spread').length).toBe(2);
    expect(s.stats.soilMade).toBe(1);
  });

  it('reeds silt shallows into marsh', () => {
    const s = blank(12);
    s.weather = 'fair';
    const sh = s.cells.findIndex((c) => c.t === 'shallows');
    s.cells[sh].plant = { id: 'reeds', n: 3, age: 2 };
    simulate(s);
    expect(s.cells[sh].t).toBe('marsh');
  });

  it('starving animals shrink and die; fed ones breed', () => {
    const s = blank(13);
    s.weather = 'fair';
    s.season = 0;
    const soil = s.cells.findIndex((c) => c.t === 'soil');
    s.cells[soil].animal = { id: 'rabbit', n: 1, age: 0 };
    // Nothing to eat anywhere: the rabbits can't stay.
    simulate(s);
    expect(census(s.cells).count.get('rabbit') ?? 0).toBe(0);

    const t = blank(13);
    t.weather = 'fair';
    t.season = 0;
    t.cells[soil].animal = { id: 'rabbit', n: 1, age: 0 };
    t.cells[soil].plant = { id: 'grass', n: 3, age: 0 };
    simulate(t);
    expect(t.cells[soil].animal?.n).toBe(2);
  });

  it('wildfire burns connected dry meadow and leaves fertile ash', () => {
    const s = blank(14);
    s.season = 5;
    s.weather = 'fire';
    // A dry interior strip of grassy soil.
    const dry = moisture(s.cells, 'fire');
    const start = s.cells.findIndex((c, i) => dry[i] === 0 && c.t !== 'pond');
    const strip = [start, ...ADJ[start].filter((j) => dry[j] === 0)];
    for (const i of strip) {
      s.cells[i].t = 'soil';
      s.cells[i].fert = 1;
      s.cells[i].plant = { id: 'grass', n: 3, age: 1 };
    }
    s.fireAt = start;
    const ev = simulate(s);
    const burnt = ev.filter((e) => e.type === 'burn').length;
    expect(burnt).toBeGreaterThan(0);
    for (const e of ev) if (e.type === 'burn') expect(s.cells[e.cell].fert).toBeGreaterThanOrEqual(2);
  });

  it('beavers dam ponds in autumn', () => {
    const s = blank(15);
    s.weather = 'fair';
    s.season = 2;
    const sh = s.cells.findIndex((c, i) => c.t === 'shallows' && ADJ[i].some((j) => s.cells[j].t === 'sand' || s.cells[j].t === 'soil'));
    s.cells[sh].animal = { id: 'beaver', n: 2, age: 0 };
    s.cells[sh].plant = { id: 'reeds', n: 3, age: 0 };
    for (const j of ADJ[sh]) if (s.cells[j].t === 'shallows') s.cells[j].plant = { id: 'reeds', n: 3, age: 0 };
    simulate(s);
    expect(s.stats.pondsMade).toBe(1);
  });
});

describe('succession and grazing', () => {
  /** An inland soil cell with soil neighbors, and moisture 1 under fair skies. */
  const meadow = (s: GameState, fert: number) => {
    const i = s.cells.findIndex((c, k) => c.t !== 'pond' && ADJ[k].length === 6 && ADJ[k].every((j) => s.cells[j].t !== 'pond'));
    for (const k of [i, ...ADJ[i]]) {
      s.cells[k].t = 'soil';
      s.cells[k].fert = fert;
    }
    return i;
  };

  it('grazers crop plants but never kill them', () => {
    const s = blank(51);
    s.weather = 'fair';
    s.season = 3; // winter: nothing grows back
    const i = meadow(s, 1);
    s.cells[i].plant = { id: 'grass', n: 2, age: 1 };
    s.cells[i].animal = { id: 'deer', n: 3, age: 1 };
    for (let k = 0; k < 3; k++) simulate(s);
    expect(s.cells[i].plant?.n).toBe(1);
  });

  it('grass spreads once half grown', () => {
    const s = blank(52);
    s.weather = 'fair';
    s.season = 0;
    const i = meadow(s, 1);
    s.cells[i].plant = { id: 'grass', n: 2, age: 1 };
    const ev = simulate(s);
    expect(ev.filter((e) => e.type === 'spread' && e.id === 'grass').length).toBe(1);
  });

  it('shrubs and oaks can be planted into grass, but not onto other plants', () => {
    const s = newGame(53);
    const i = meadow(s, 2);
    s.cells[i].plant = { id: 'grass', n: 3, age: 1 };
    s.cells[i].animal = null;
    s.weather = 'storm'; // wet enough everywhere
    s.hand = ['shrub', 'tree', 'flowers', 'lichen'];
    expect(placeError(s, 0, i)).toBeNull();
    expect(placeError(s, 1, i)).toBeNull();
    expect(placeError(s, 2, i)).toMatch(/growing here/);
    expect(apply(s, { type: 'place', card: 1, cell: i })).not.toBeNull();
    expect(s.cells[i].plant).toEqual({ id: 'tree', n: 1, age: 0 });
  });

  it('songbirds seed oaks into nearby grass', () => {
    const s = blank(54);
    s.weather = 'fair';
    s.season = 0;
    const i = meadow(s, 2);
    s.cells[i].plant = { id: 'tree', n: 3, age: 4 };
    s.cells[i].animal = { id: 'songbird', n: 2, age: 1 };
    for (const j of ADJ[i]) s.cells[j].plant = { id: 'grass', n: 3, age: 1 };
    const ev = simulate(s);
    const seeded = ev.filter((e) => e.type === 'spread' && e.id === 'tree');
    expect(seeded.length).toBe(1);
  });

  it('simulating plants only leaves the animals alone', () => {
    const s = newGame(55);
    apply(s, { type: 'place', card: 0, cell: s.cells.findIndex((c) => c.t === 'rock') });
    const t = clone(s);
    simulate(t, true);
    expect(t.cells.map((c) => c.animal)).toEqual(s.cells.map((c) => c.animal));
  });
});

describe('season report', () => {
  it('tallies growth, losses and land changes with their causes', () => {
    const s = blank(61);
    s.weather = 'fair';
    s.season = 0;
    const rock = s.cells.findIndex((c, i) => c.t === 'rock' && ADJ[i].filter((j) => s.cells[j].t === 'rock').length >= 2);
    s.cells[rock].plant = { id: 'lichen', n: 3, age: 2 };
    const soil = s.cells.findIndex((c, i) => i !== rock && c.t === 'soil' && !ADJ[i].includes(rock));
    s.cells[soil].animal = { id: 'rabbit', n: 1, age: 0 };
    const before = clone(s);
    const ev = apply(s, { type: 'end' })!;
    const r = seasonReport(before, ev, s);
    expect(r.spread).toContainEqual({ id: 'lichen', n: 2, why: undefined, by: undefined });
    expect(r.land.soil).toBe(1);
    // The lone rabbits had nothing to eat anywhere.
    expect(r.lost.map((t) => t.id)).toContain('rabbit');
    expect(r.points).toBe(s.log[0].points);
  });

  it('names the hunter', () => {
    const s = blank(62);
    s.weather = 'fair';
    s.season = 1;
    const i = s.cells.findIndex((c, k) => c.t !== 'pond' && ADJ[k].length === 6);
    const j = ADJ[i][0];
    for (const k of [i, j]) s.cells[k].t = 'soil';
    s.cells[i].animal = { id: 'fox', n: 1, age: 1 };
    s.cells[j].animal = { id: 'rabbit', n: 1, age: 1 };
    const before = clone(s);
    const r = seasonReport(before, apply(s, { type: 'end' })!, s);
    expect(r.lost).toContainEqual({ id: 'rabbit', n: 1, why: 'hunted', by: 'fox' });
  });
});

describe('replay', () => {
  it('encodes and decodes actions', () => {
    const as: Action[] = [{ type: 'place', card: 2, cell: 47 }, { type: 'reroll' }, { type: 'end' }];
    for (const a of as) expect(decode(encode(a))).toEqual(a);
    expect(decode('Q1')).toBeNull();
  });

  it('rebuilds a bot run exactly', () => {
    for (const seed of [21, 22]) {
      const r = run(seed, 'random');
      const s = replay(seed, r.actions);
      expect(s.score).toBe(r.s.score);
      expect(s.cells).toEqual(r.s.cells);
      expect(s.over).toBe(true);
    }
  });

  it('simulating a clone leaves the original untouched', () => {
    const s = newGame(31);
    const snap = JSON.stringify(s);
    const t = clone(s);
    apply(t, { type: 'end' });
    expect(JSON.stringify(s)).toBe(snap);
  });

  it('throws on an illegal action', () => {
    expect(() => replay(1, 'P0.0,P0.0,P0.0')).toThrow();
  });
});

describe('balance', () => {
  it('the greedy bot clearly beats random play', () => {
    let g = 0;
    let r = 0;
    for (const seed of [41, 42, 43]) {
      g += run(seed, 'greedy', 1).s.score;
      r += run(seed, 'random').s.score;
    }
    expect(g).toBeGreaterThan(r * 1.4);
  });
});
