import { describe, expect, it } from 'vitest';
import {
  ADJ,
  ADJ6,
  NEAR2,
  fireZone,
  ALL_IDS,
  N,
  RING,
  apply,
  clone,
  moisture,
  newGame,
  placeReason,
  seasonReport,
  simulate,
  track,
  type GameState,
} from '../../src/rewild/core';

const NEAR2Of = (i: number) => NEAR2[i];

const blank = (seed = 1): GameState => {
  const s = newGame(seed);
  for (const c of s.cells) {
    c.plant = null;
    c.animal = null;
    c.t = 'rock';
    c.fert = 0;
  }
  return s;
};

/** The island's center cell (on a blank all-rock island, far from any water). */
const dryField = (s: GameState) => s.cells.findIndex((_, k) => RING[k] === 0);

/** A lightning summer striking cell i, with full grass on i and its neighbors. */
function meadowOnFire(seed = 3) {
  const s = blank(seed);
  s.season = 5;
  s.weather = 'fire';
  const i = dryField(s);
  for (const k of [i, ...ADJ[i]]) {
    s.cells[k].t = 'soil';
    s.cells[k].fert = 1;
    s.cells[k].plant = { id: 'grass', n: 3, age: 2 };
  }
  s.fireAt = i;
  return { s, i };
}

describe('wildfire', () => {
  it('comes at the end of summer and names fire as the cause for plants', () => {
    const { s, i } = meadowOnFire();
    const ev = simulate(s);
    expect(ev.find((e) => e.type === 'strike')).toEqual({ type: 'strike', cell: i });
    const burnt = ev.filter((e) => e.type === 'burn').map((e) => (e as { cell: number }).cell);
    expect(burnt.length).toBe(7);
    for (const k of burnt) {
      expect(s.cells[k].plant).toBeNull();
      expect(ev).toContainEqual({ type: 'die', cell: k, id: 'grass', why: 'burnt' });
    }
    // Burning is the last thing that happens in the season.
    const strike = ev.findIndex((e) => e.type === 'strike');
    expect(ev.slice(strike).every((e) => e.type === 'strike' || e.type === 'burn' || ((e.type === 'die' || e.type === 'shrink') && e.why === 'burnt'))).toBe(true);
  });

  it('damp cells, bare cells, water and oaks are firebreaks', () => {
    const { s, i } = meadowOnFire();
    const [, b, c, d] = ADJ[i];
    s.cells[b].plant = null; // bare
    s.cells[c].plant = { id: 'tree', n: 3, age: 4 }; // oaks never burn
    s.cells[d].t = 'pond'; // water
    s.cells[d].plant = null;
    const t = clone(s);
    const ev = simulate(t);
    const burnt = new Set(ev.filter((e) => e.type === 'burn').map((e) => (e as { cell: number }).cell));
    expect(burnt.has(b)).toBe(false);
    expect(burnt.has(c)).toBe(false);
    expect(burnt.has(d)).toBe(false);
    expect(t.cells[c].plant?.id).toBe('tree');
    // Cells next to the new pond are damp (moisture 1 under lightning) and don't burn either.
    const wet = moisture(t.cells, 'fire');
    for (const k of ADJ[d]) if (wet[k] >= 1) expect(burnt.has(k)).toBe(false);
  });

  it('grazers placed by a tall meadow crop it short before the fire comes', () => {
    const { s, i } = meadowOnFire(4);
    const before = simulate(clone(s)).filter((e) => e.type === 'burn').length;
    s.cells[i].animal = { id: 'deer', n: 3, age: 1 };
    const ev = simulate(s);
    const after = ev.filter((e) => e.type === 'burn').length;
    expect(after).toBeLessThan(before);
  });

  it('no strike when nothing within 3 cells is burnable', () => {
    const s = blank(5);
    s.season = 5;
    s.weather = 'fire';
    s.fireAt = dryField(s);
    const ev = simulate(s);
    expect(ev.some((e) => e.type === 'strike' || e.type === 'burn')).toBe(false);
  });

  it('catches the nearest burnable plant up to 3 cells from the strike, not 4', () => {
    for (const d of [3, 4]) {
      const s = blank(11);
      s.season = 5;
      s.weather = 'fire';
      s.fireAt = dryField(s);
      const k = s.cells.findIndex((_, j) => RING[j] === d);
      s.cells[k].t = 'soil';
      s.cells[k].fert = 1;
      s.cells[k].plant = { id: 'grass', n: 3, age: 2 };
      const ev = simulate(s);
      expect(ev.some((e) => e.type === 'strike' && e.cell === k)).toBe(d === 3);
    }
  });

  it('half-grown plants burn, seedlings do not (wildflowers wither on bone-dry ground first)', () => {
    const { s, i } = meadowOnFire(12);
    // Full wildflowers wither to half size in a lightning summer: they still burn (rules v5 they never could).
    for (const k of [i, ...ADJ[i]]) s.cells[k].plant = { id: 'flowers', n: 3, age: 2 };
    expect(simulate(clone(s)).filter((e) => e.type === 'burn').length).toBe(7);
    // Half-grown ones wither to seedlings and don't.
    for (const k of [i, ...ADJ[i]]) s.cells[k].plant = { id: 'flowers', n: 2, age: 2 };
    expect(simulate(clone(s)).filter((e) => e.type === 'burn').length).toBe(0);
  });

  it('a plant grazed this summer does not burn, even when it is still half grown', () => {
    const { s, i } = meadowOnFire(13);
    const ev0 = simulate(clone(s));
    expect(ev0.filter((e) => e.type === 'burn').length).toBe(7);
    // Rabbits crop one unit: a full grass on their cell or beside it drops to 2, and it is spared.
    s.cells[i].animal = { id: 'rabbit', n: 2, age: 1 };
    const t = clone(s);
    const ev = simulate(t);
    const cropped = ev.filter((e) => e.type === 'eat').map((e) => (e as { prey: number }).prey);
    expect(cropped.length).toBeGreaterThan(0);
    const burnt = new Set(ev.filter((e) => e.type === 'burn').map((e) => (e as { cell: number }).cell));
    for (const k of cropped) {
      expect(burnt.has(k)).toBe(false);
      expect(t.cells[k].plant?.n).toBeGreaterThanOrEqual(2);
    }
  });

  it('sparks jump a one-cell gap but not a two-cell gap', () => {
    for (const gap of [1, 2]) {
      const s = blank(14);
      s.season = 5;
      s.weather = 'fire';
      const i = dryField(s);
      s.fireAt = i;
      // A straight line of cells through the center: grass at the strike, then `gap` bare cells, then grass.
      const line = [i];
      const dir = ADJ6[i].findIndex((j) => j >= 0);
      while (line.length < 1 + gap + 1) line.push(ADJ6[line[line.length - 1]][dir]);
      for (const k of [line[0], line[line.length - 1]]) {
        s.cells[k].t = 'soil';
        s.cells[k].fert = 1;
        s.cells[k].plant = { id: 'grass', n: 3, age: 2 };
      }
      const far = line[line.length - 1];
      const ev = simulate(s);
      expect(ev.some((e) => e.type === 'burn' && e.cell === far)).toBe(gap === 1);
    }
  });

  it('animals caught in the fire die; bees and songbirds fly off', () => {
    const { s, i } = meadowOnFire(15);
    const [a, b, c] = ADJ[i];
    s.cells[a].animal = { id: 'fox', n: 3, age: 1 };
    s.cells[b].animal = { id: 'bees', n: 2, age: 1 };
    s.cells[c].animal = { id: 'songbird', n: 2, age: 1 };
    const ev = simulate(s);
    expect(ev).toContainEqual({ type: 'die', cell: a, id: 'fox', why: 'burnt' });
    expect(s.cells[a].animal).toBeNull();
    expect(s.cells[b].animal?.id).toBe('bees');
    expect(s.cells[c].animal?.id).toBe('songbird');
  });

  it('animals never move or send young into the fire\'s reach', () => {
    const { s, i } = meadowOnFire(16);
    // A hungry fox on bare rock two cells out; the only food (rabbits) sits in the burning meadow.
    const far = NEAR2Of(i).find((k) => !ADJ[i].includes(k) && k !== i)!;
    s.cells[far].animal = { id: 'fox', n: 2, age: 1 };
    s.cells[ADJ[i][0]].animal = { id: 'rabbit', n: 3, age: 1 };
    const t = clone(s);
    const zone = (() => {
      const p = clone(s);
      simulate(p, true);
      return fireZone(p.cells, 'fire', p.fireAt);
    })();
    const ev = simulate(t);
    for (const e of ev) if (e.type === 'move' || (e.type === 'spread' && !['grass', 'flowers', 'shrub', 'lichen', 'reeds', 'tree', 'fungi'].includes(e.id))) expect(zone.has(e.to)).toBe(false);
    // The burn never leaves the zone.
    for (const e of ev) if (e.type === 'burn') expect(zone.has(e.cell)).toBe(true);
  });

  it('the season report gives a species that died out one cause: what finished it', () => {
    const { s, i } = meadowOnFire(17);
    // Two fox families: one starves on bare rock far away, the other burns in the meadow.
    const rock = s.cells.findIndex((_, k) => RING[k] === 4);
    s.cells[rock].animal = { id: 'fox', n: 1, age: 1 };
    s.cells[i].animal = { id: 'fox', n: 3, age: 1 };
    s.cells[ADJ[i][1]].animal = { id: 'rabbit', n: 3, age: 1 };
    const before = clone(s);
    const ev = apply(s, { type: 'end' })!;
    const r = seasonReport(before, ev, s);
    const fox = r.lost.filter((t) => t.id === 'fox');
    if (fox.length) {
      expect(fox.length).toBe(1);
      const last = [...ev].reverse().find((e) => e.type === 'die' && e.id === 'fox') as { why: string };
      expect(fox[0].why).toBe(last.why);
    }
  });

  it('the season report counts burnt plants as burnt in the wildfire', () => {
    const { s } = meadowOnFire();
    const before = clone(s);
    const ev = apply(s, { type: 'end' })!;
    const r = seasonReport(before, ev, s);
    expect(r.lost).toContainEqual(expect.objectContaining({ id: 'grass', why: 'burnt' }));
  });
});

describe('tracking a population through the season', () => {
  it('deer flee the wolves; the readout food is what they find after fleeing', () => {
    const s = blank(6);
    s.season = 0;
    s.weather = 'fair';
    const i = dryField(s);
    for (let k = 0; k < N; k++) {
      s.cells[k].t = 'soil';
      s.cells[k].fert = 2;
      s.cells[k].plant = { id: 'grass', n: 3, age: 2 };
    }
    s.cells[i].animal = { id: 'deer', n: 2, age: 1 };
    s.cells[ADJ[i][0]].animal = { id: 'wolf', n: 1, age: 1 };
    const t = clone(s);
    const ev = apply(t, { type: 'end' })!;
    const f = track(ev, i, 'deer', t.cells);
    expect(f.fled).toBe(true);
    expect(f.at).not.toBe(i);
    expect(f.feeds.length).toBeGreaterThan(0);
    expect(f.feeds[0].cell).toBe(f.at);
    // Fed after fleeing: no hunger, and it's alive where the tracker says.
    expect(f.feeds[0].food).toBeGreaterThanOrEqual(f.feeds[0].need);
    expect(f.hits.some((h) => h.why === 'hungry' || h.why === 'starved')).toBe(false);
    expect(t.cells[f.at].animal?.id).toBe('deer');
  });

  it('every feed shortfall shows up as a move, a shrink or a death', () => {
    for (const seed of [7, 8, 9]) {
      const s = newGame(seed);
      for (let k = 0; k < 14 && !s.over; k++) {
        // Scatter some animals around, then check each one's story is consistent.
        const ids = s.cells.map((c, j) => (c.animal ? j : -1)).filter((j) => j >= 0);
        const t = clone(s);
        const ev = apply(t, { type: 'end' })!;
        for (const j of ids) {
          const f = track(ev, j, s.cells[j].animal!.id, t.cells);
          const short = f.feeds.some((x) => x.food < x.need);
          if (short) expect(f.wandered || f.hits.length > 0).toBe(true);
          if (f.alive) expect(t.cells[f.at].animal?.id).toBe(f.id);
        }
        // Play something, so there are animals to follow.
        const wet = moisture(s.cells, s.weather);
        for (let c = 0; c < s.hand.length && s.plays > 0; c++) {
          const cell = s.cells.findIndex((_, x) => placeReason(s, s.hand[c], x, wet) === null);
          if (cell >= 0) apply(s, { type: 'place', card: c, cell });
        }
        apply(s, { type: 'end' });
      }
    }
  });
});

describe('dealing', () => {
  it('rarely deals cards that have nowhere to go', () => {
    let dead = 0;
    let all = 0;
    for (let seed = 0; seed < 30; seed++) {
      const s = newGame(seed);
      for (let k = 0; k < 8; k++) {
        const wet = moisture(s.cells, s.weather);
        for (const id of s.hand) {
          all++;
          if (!s.cells.some((_, i) => placeReason(s, id, i, wet) === null)) dead++;
        }
        apply(s, { type: 'end' });
      }
    }
    expect(dead / all).toBeLessThan(0.08);
  });

  it('names the real blocker', () => {
    const s = blank(10);
    const i = dryField(s);
    s.cells[i].t = 'soil';
    s.cells[i].fert = 2;
    s.weather = 'fair';
    expect(placeReason(s, 'shrub', i)?.kind).toBe('dry');
    expect(placeReason(s, 'tree', ADJ[i][0])?.kind).toBe('terrain');
    s.cells[i].fert = 0;
    expect(placeReason(s, 'grass', i)?.kind).toBe('poor');
    expect(ALL_IDS.length).toBe(15);
  });
});
