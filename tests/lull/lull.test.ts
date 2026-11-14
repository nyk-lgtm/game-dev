import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Rng } from '../../src/shared/rng';
import {
  BAR, BEE, DAY, FLY, FLOURISH, MAX_PER_STEP, MAX_PLANTS, PENT, ROWS, SPECIES, START, XS, apply, colOf, critterCount, crittersAt,
  dayTime, decode, decodeActions, eligible, encode, groundAt, growth, newGarden, notesAt, plantError, replay, rootOf, sameGarden, target,
  weatherAt, wishesMet, GARDEN_WISHES, fillWishes, gardenWish, gardenWishAt, grantWishes, newWishState, tooEasy, WISHES, dailyWishId, onlyPlants, type Action, type Garden,
} from '../../src/lull/core';

describe('garden wishes', () => {
  it('every garden draws three valid, not-yet-true wishes in a seeded order', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const g = fullGarden(seed);
      const ws = fillWishes(g, newWishState());
      expect(ws.a.length).toBe(GARDEN_WISHES);
      for (const id of ws.a) {
        const w = gardenWish(id);
        expect(w, id).not.toBeNull();
        expect(w!.test(g)).toBe(false);
      }
      expect(JSON.stringify(fillWishes(g, newWishState()))).toBe(JSON.stringify(ws));
    }
    for (let n = 0; n < 300; n++) expect(gardenWish(gardenWishAt(7, n)), String(n)).not.toBeNull();
  });

  it('the first wish is an echo (one note on beats 1 and 3); it needs half-grown plants, then a new one is drawn', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = newGarden(seed);
      const ws = fillWishes(g, newWishState());
      const first = gardenWishAt(seed, 0);
      expect(first).toMatch(/^twin\.\d$/);
      expect(ws.a[0]).toBe(first);
      const col = Number(first.split('.')[1]);
      // Glowcaps on beat 1 (rows 0-4) and beat 3 (rows 18-22) in that column.
      const put = (rows: number[]) => {
        for (const sp of [4, 3, 2]) for (const y of rows) for (let x = col * 100; x < col * 100 + 100; x += 7) if (apply(g, { t: g.now, k: 'P', sp, x, y })) return true;
        return false;
      };
      expect(put([0, 1, 2, 3, 4]) && put([18, 19, 20, 21, 22]), `seed ${seed}`).toBe(true);
      // Freshly planted: not yet.
      expect(grantWishes(g, ws)).toEqual([]);
      g.now += 200;
      expect(grantWishes(g, ws)).toContain(first);
      expect(ws.done).toContain(first);
      expect(ws.a.length).toBe(GARDEN_WISHES);
      expect(ws.a).not.toContain(first);
    }
  });

  it('never draws a wish that is true now or would come true by waiting', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = fullGarden(seed);
      const ws = fillWishes(g, newWishState());
      for (const id of ws.a) expect(tooEasy(g, gardenWish(id)!), `${seed} ${id}`).toBe(false);
      // Grow up and turn the clock over a day: nothing drawn is granted without a change.
      for (let k = 0; k <= 12; k++) expect(grantWishes({ ...g, now: g.now + 300 + k * 112 }, { ...ws, a: [...ws.a], done: [] }), `${seed} ${k}`).toEqual([]);
    }
  });

  it('mostly asks for compositions and moments, rarely a single plant on a note', () => {
    const kinds: Record<string, number> = {};
    for (let n = 1; n < 2001; n++) {
      const k = gardenWishAt(99, n).split('.')[0];
      kinds[k] = (kinds[k] ?? 0) + 1;
    }
    expect(kinds.sing ?? 0).toBeLessThan(150);
    expect((kinds.chord ?? 0) + (kinds.minor ?? 0) + (kinds.rise ?? 0) + (kinds.groove ?? 0)).toBeGreaterThan(500);
  });

  it('dawn starts dark and brightens; the label and the sky agree', () => {
    expect(dayTime(Math.round(DAY * 0.95)).phase).toBe('night');
    const d0 = dayTime(Math.round(DAY * 0.971));
    expect(d0.phase).toBe('dawn');
    expect(d0.light).toBeLessThan(0.05);
    expect(dayTime(DAY + 10).light).toBeGreaterThan(0.3);
  });
});

/** A random session: plants, waterings and digs over a few in-game minutes. */
function randomActs(seed: number, n = 80): Action[] {
  const r = new Rng(seed ^ 0x1d11);
  const g = newGarden(seed);
  const acts: Action[] = [];
  let t = START;
  for (let i = 0; i < n; i++) {
    t += r.int(0, 40);
    const roll = r.next();
    let a: Action;
    if (roll < 0.6) a = { t, k: 'P', sp: r.int(0, SPECIES.length - 1), x: r.int(0, XS - 1), y: r.int(0, ROWS - 1) };
    else if (roll < 0.85) a = { t, k: 'W', x: r.int(0, XS - 1), y: r.int(0, ROWS - 1) };
    else if (g.plants.length) {
      const p = r.pick(g.plants);
      a = { t, k: 'X', x: p.x, y: p.y };
    } else continue;
    if (apply(g, a)) acts.push(a);
  }
  return acts;
}

/** Plants every kind somewhere it can grow, as many as fit. */
function fullGarden(seed: number): Garden {
  const g = newGarden(seed);
  const r = new Rng(seed);
  for (let i = 0; i < 4000 && g.plants.length < MAX_PLANTS; i++) apply(g, { t: g.now, k: 'P', sp: i % SPECIES.length, x: r.int(0, XS - 1), y: r.int(0, ROWS - 1) });
  return g;
}

describe('core', () => {
  it('stays pure: no Math.random, Date or DOM in core/', () => {
    const dir = 'src/lull/core';
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/Math\.random|Date\.|new Date|document\.|window\.|Math\.(sin|cos)/);
    }
  });

  it('replays the same actions to the same garden', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const acts = randomActs(seed);
      const a = replay(seed, acts);
      const b = replay(seed, acts);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.plants.length).toBeGreaterThan(0);
    }
  });

  it('keeps plants in a canonical order and spaced apart', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const g = replay(seed, randomActs(seed, 150));
      for (let i = 1; i < g.plants.length; i++) {
        const a = g.plants[i - 1], b = g.plants[i];
        expect(a.x < b.x || (a.x === b.x && a.y < b.y)).toBe(true);
      }
      expect(g.plants.length).toBeLessThanOrEqual(MAX_PLANTS);
      for (const p of g.plants) {
        const gr = groundAt(g, p.x, p.y);
        const s = SPECIES[p.sp];
        if (s.wet === 'yes') expect(gr).toBe('water');
        if (s.wet === 'no') expect(gr).not.toBe('water');
        if (s.wet === 'edge') expect(gr).not.toBe('soil');
      }
    }
  });

  it('every garden has a pond with room for lilies and reeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const g = newGarden(seed);
      let water = 0, shore = 0;
      for (let x = 0; x < XS; x += 10) for (let y = 0; y < ROWS; y++) {
        const k = groundAt(g, x, y);
        if (k === 'water') water++;
        else if (k === 'shore') shore++;
      }
      expect(water, `seed ${seed}`).toBeGreaterThan(80);
      expect(shore, `seed ${seed}`).toBeGreaterThan(40);
    }
  });

  it('says why a plant cannot go somewhere', () => {
    const g = newGarden(5);
    const e = g.pond[0];
    expect(plantError(g, 3, e.cx, e.cy)).toBeNull();
    expect(plantError(g, 0, e.cx, e.cy)?.err).toBe('dry');
    expect(plantError(g, 3, 0, 0)?.err === 'water' || groundAt(g, 0, 0) === 'water').toBe(true);
    apply(g, { t: g.now, k: 'P', sp: 3, x: e.cx, y: e.cy });
    expect(plantError(g, 3, e.cx + 5, e.cy)).toEqual({ err: 'close', near: 0 });
  });

  it('watering speeds growth and makes grown plants flourish', () => {
    const g = newGarden(9);
    const x = 100, y = 2;
    const sp = groundAt(g, x, y) === 'water' ? 3 : 0;
    apply(g, { t: START, k: 'P', sp, x, y });
    const p = g.plants[0];
    apply(g, { t: START + 10, k: 'W', x, y });
    expect(growth(p, START + 10)).toBeCloseTo((10 + 72) / SPECIES[sp].grow, 5);
    const later = START + 1000;
    expect(growth(p, later)).toBe(1);
    // Flourishing doubles how often it sings.
    const count = (gg: Garden, from: number) => {
      let n = 0;
      for (let s = from; s < from + 16 * BAR; s++) n += notesAt(gg, s).filter((q) => q.i === 0 && q.why === 'song').length;
      return n;
    };
    const day = DAY + 200;
    const plain = count(g, day);
    apply(g, { t: day, k: 'W', x, y });
    expect(p.flourish).toBe(day + FLOURISH);
    expect(count(g, day)).toBeGreaterThan(plain);
  });
});

describe('codes', () => {
  it('round-trips gardens exactly', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = replay(seed * 7919, randomActs(seed, 120), START, START + 4000);
      const code = encode(g);
      const back = decode(code);
      expect(back, code).not.toBeNull();
      expect(sameGarden(g, back!)).toBe(true);
      expect(encode(back!)).toBe(code);
      // And it keeps growing the same way.
      for (const dt of [0, 50, 300, 2000]) {
        const a = { ...g, now: g.now + dt }, b = { ...back!, now: back!.now + dt };
        expect(sameGarden(a, b)).toBe(true);
      }
    }
  });

  it('is short: six characters a plant', () => {
    const g = fullGarden(42);
    const code = encode(g);
    expect(code.length).toBeLessThan(20 + 6 * g.plants.length);
    expect(code).toMatch(/^[0-9a-z.]+$/);
  });

  it('is a list of planting actions', () => {
    const g = fullGarden(77);
    const d = decodeActions(encode(g))!;
    expect(d.acts.every((a) => a.k === 'P')).toBe(true);
    const r = replay(d.seed, d.acts, Math.min(...d.acts.map((a) => a.t)), d.now);
    expect(sameGarden(g, r)).toBe(true);
  });

  it('rejects junk', () => {
    for (const s of ['', 'hello', '1.zz', '2.abc.10.', '1.abc.10.a00', '1.abc.10.z00000', '1.abc.10.a0000']) expect(decode(s), s).toBeNull();
    // Two plants on one spot can't both grow.
    expect(decode('1.abc.10.a1010aa1010a')).toBeNull();
  });
});

describe('music', () => {
  it('plays only notes of the garden’s pentatonic scale, a few at a time', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const g = fullGarden(seed);
      const root = rootOf(seed) % 12;
      const allowed = new Set(PENT.map((p) => (root + p) % 12));
      let total = 0;
      for (let s = START; s < START + DAY; s++) {
        const ns = notesAt(g, s);
        expect(ns.length).toBeLessThanOrEqual(MAX_PER_STEP);
        for (const n of ns) {
          expect(allowed.has(((n.midi % 12) + 12) % 12)).toBe(true);
          expect(n.midi).toBeGreaterThanOrEqual(30);
          expect(n.midi).toBeLessThanOrEqual(100);
          expect(n.vel).toBeGreaterThan(0);
          expect(n.vel).toBeLessThanOrEqual(1);
        }
        total += ns.length;
      }
      // A full garden sings, but not wall to wall: ~1-4 notes a step on average.
      expect(total / DAY).toBeGreaterThan(0.6);
      expect(total / DAY).toBeLessThan(4.5);
    }
  });

  it('sings each plant on its own lane and column', () => {
    const g = newGarden(3);
    const x = 950, y = 0;
    if (groundAt(g, x, y) === 'water') return;
    apply(g, { t: START, k: 'P', sp: 4, x, y });
    g.plants[0].born -= 1000;
    const steps: number[] = [];
    for (let s = START; s < START + 4 * BAR; s++) for (const n of notesAt(g, s)) if (n.why === 'song') steps.push(s % BAR);
    // A glowcap sings every bar, on its lane's step (back row: the downbeat).
    expect(steps).toEqual([0, 0, 0, 0]);
    expect(colOf(x)).toBe(9);
  });

  it('chimebells sleep at night and the day turns', () => {
    expect(dayTime(START).phase).toBe('dawn');
    expect(dayTime(DAY * 0.3).phase).toBe('day');
    expect(dayTime(DAY * 0.55).phase).toBe('dusk');
    expect(dayTime(DAY * 0.8).phase).toBe('night');
    const g = fullGarden(4);
    const night = DAY + Math.round(DAY * 0.8);
    for (let s = night; s < night + 8 * BAR; s++) for (const n of notesAt(g, s)) if (n.i >= 0) expect(g.plants[n.i].sp === 0 && n.why === 'song').toBe(false);
  });

  it('weather comes in spells, first morning clear', () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(weatherAt(seed, START).kind).toBe('clear');
      const kinds = new Set<string>();
      for (let d = 0; d < 20; d++) kinds.add(weatherAt(seed, d * DAY + 300).kind);
      expect(kinds.size).toBeGreaterThan(1);
    }
  });

  it('creatures land on plants they like, and only then sing them', () => {
    const g = fullGarden(11);
    const noon = DAY + Math.round(DAY * 0.3);
    const midnight = DAY + Math.round(DAY * 0.8);
    expect(critterCount(g, BEE, noon)).toBeGreaterThan(0);
    expect(critterCount(g, BEE, midnight)).toBe(0);
    expect(critterCount(g, FLY, midnight)).toBeGreaterThan(0);
    for (let h = 0; h < 40; h++) {
      const i = target(g, BEE, 0, h);
      if (i >= 0) expect(SPECIES[g.plants[i].sp].bees).toBe(true);
    }
    for (const s of [noon, midnight]) {
      for (const c of crittersAt(g, s + 0.5)) {
        expect(c.to).toBeGreaterThanOrEqual(0);
        expect(c.f).toBeGreaterThanOrEqual(0);
        expect(c.f).toBeLessThanOrEqual(1);
      }
    }
    expect(eligible(g, FLY, midnight).length).toBeGreaterThan(0);
  });

  it('is the same for the same garden and step (the page schedules ahead)', () => {
    const g = fullGarden(21);
    for (let s = START; s < START + 400; s++) expect(JSON.stringify(notesAt(g, s))).toBe(JSON.stringify(notesAt(g, s)));
  });
});

describe('wishes', () => {
  it('a bare garden meets none, a full one several', () => {
    expect(wishesMet(newGarden(1))).toEqual([]);
    const g = fullGarden(8);
    g.now += 2000;
    const met = wishesMet(g);
    expect(met).toContain('kinds');
    expect(met).toContain('full');
    // Event milestones are never met by the garden alone.
    expect(met).not.toContain('strum');
    expect(met).not.toContain('share');
  });

  it('milestones need a deliberate act: a garden of random plants grown up meets few', () => {
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = newGarden(seed);
      const r = new Rng(seed);
      for (let i = 0; i < 400 && g.plants.length < 10; i++) apply(g, { t: g.now, k: 'P', sp: r.int(0, 5), x: r.int(0, XS - 1), y: r.int(0, ROWS - 1) });
      g.now += 600;
      total += wishesMet(g).length;
    }
    // Ten random plants: on average at most about one milestone (mostly "Pond song" or "One of each").
    expect(total / 20).toBeLessThan(1.5);
  });

  it('every wish says what is missing, and the daily wish is a composition any garden can make', () => {
    const g = fullGarden(3);
    for (let n = 0; n < 200; n++) {
      const w = gardenWish(gardenWishAt(11, n))!;
      expect(typeof w.progress?.(g), w.id).toBe('string');
      expect(typeof w.progress?.(newGarden(3)), w.id).toBe('string');
    }
    for (const w of WISHES) if (!w.event) expect(typeof w.progress?.(g), w.id).toBe('string');
    const kinds = new Set<string>();
    for (let d = 0; d < 300; d++) {
      const id = dailyWishId(d * 7919);
      const w = gardenWish(id)!;
      expect(w, id).not.toBeNull();
      expect(w.test(newGarden(d)), id).toBe(false);
      kinds.add(id.split('.')[0]);
    }
    expect(kinds.size).toBeGreaterThan(6);
    // Counted on plants planted today only.
    const only = onlyPlants(g, (x) => x < 100);
    expect(only.plants.every((p) => p.x < 100)).toBe(true);
  });

  it('chords on a half-beat count for the dusk chord', () => {
    const g = newGarden(4);
    g.now = DAY + Math.round(DAY * 0.55);
    // do, mi, so (columns 0, 2, 3) all on lane 1 (beat 1&: rows 5-8), on soil.
    for (const col of [0, 2, 3]) {
      let ok = false;
      for (const sp of [4, 3, 2]) for (let y = 5; y <= 8 && !ok; y++) for (let x = col * 100; x < col * 100 + 100 && !ok; x += 9) ok = apply(g, { t: g.now, k: 'P', sp, x, y });
      expect(ok).toBe(true);
    }
    for (const p of g.plants) p.born -= 1000;
    expect(WISHES.find((w) => w.id === 'chord')!.test(g)).toBe(true);
  });

  it('the dusk chord needs dusk', () => {
    const g = fullGarden(8);
    g.now = DAY * 2 + Math.round(DAY * 0.3);
    expect(wishesMet(g)).not.toContain('chord');
    g.now = DAY * 2 + Math.round(DAY * 0.55);
    expect(wishesMet(g)).toContain('chord');
  });
});
