import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CARD,
  CARDS,
  COMPANIONS,
  COMP_IDS,
  ENDING,
  ENDINGS,
  F,
  KIND_INFO,
  LAST,
  PROMISES,
  REGION_KINDS,
  TUNE,
  act,
  actError,
  blockOf,
  cardBlock,
  eligible,
  legCost,
  makeMap,
  newRun,
  recruitOf,
  regionOf,
  replay,
  scoreOf,
  telling,
  type Run,
} from '../../src/tidings/core';
import { careful, legal, playRun, random, risky, safe } from '../../scripts/tidings/bot';

describe('tidings content', () => {
  it('has plenty of authored cards with unique ids', () => {
    expect(CARDS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(CARDS.map((c) => c.id)).size).toBe(CARDS.length);
  });

  it('keeps every card short: 1-3 sentences, 2-4 choices', () => {
    for (const c of CARDS) {
      for (const t of [c.text, ...(c.alts ?? []).map((a) => a.text)]) {
        const sentences = t.replace(/“[^”]*”/g, 'Q').split(/(?<=[.!?…])\s+/).filter(Boolean).length;
        expect(sentences, `${c.id}: ${t}`).toBeLessThanOrEqual(3);
        expect(t.length, c.id).toBeLessThanOrEqual(200);
      }
      expect(c.choices.length, c.id).toBeGreaterThanOrEqual(2);
      expect(c.choices.length, c.id).toBeLessThanOrEqual(4);
    }
  });

  it('always leaves a choice nobody can be locked out of', () => {
    for (const c of CARDS) {
      const free = c.choices.some((ch) => !ch.need && !ch.join && (ch.fx.c ?? 0) >= 0 && (ch.lose?.fx.c ?? 0) >= 0);
      expect(free, c.id).toBe(true);
    }
  });

  it('refers only to real companions, promises and flags', () => {
    const set = new Set(CARDS.flatMap((c) => c.choices.map((ch) => ch.set).filter(Boolean)));
    for (const c of CARDS) {
      if (c.when?.flag) expect(set.has(c.when.flag), `${c.id} waits for ${c.when.flag}`).toBe(true);
      if (c.when?.comp) expect(COMPANIONS[c.when.comp], c.id).toBeTruthy();
      if (c.when?.promise) expect(PROMISES[c.when.promise], c.id).toBeTruthy();
      for (const ch of c.choices) {
        for (const id of [ch.need, ch.join, ch.boost?.[0]]) if (id) expect(COMPANIONS[id], `${c.id}/${ch.t}`).toBeTruthy();
        for (const p of [ch.promise, ch.breaks]) if (p) expect(PROMISES[p], `${c.id}/${ch.t}`).toBeTruthy();
        if (ch.odds !== undefined) {
          expect(ch.lose, c.id).toBeTruthy();
          expect(ch.odds).toBeGreaterThan(0);
          expect(ch.odds).toBeLessThan(1);
        }
      }
    }
    // Every flag set somewhere is answered by a callback.
    for (const f of set) if (f !== 'debt') expect(CARDS.some((c) => c.when?.flag === f), f).toBe(true);
    expect(CARDS.some((c) => c.when?.flag === 'debt')).toBe(true);
  });

  it('gives every companion a recruit card, a story of their own and special choices', () => {
    for (const id of COMP_IDS) {
      expect(CARDS.filter((c) => recruitOf(c) === id).length, id).toBe(1);
      expect(CARDS.some((c) => c.when?.comp === id), id).toBe(true);
      expect(CARDS.filter((c) => c.choices.some((ch) => ch.need === id)).length, id).toBeGreaterThanOrEqual(3);
    }
  });

  it('places every card somewhere it can be dealt', () => {
    for (const c of CARDS) {
      let ok = false;
      for (let s = c.at[0]; s <= Math.min(c.at[1], LAST - 1); s++) {
        const kinds = s === 0 ? ['town'] : REGION_KINDS[regionOf(s)];
        if (!c.where || c.where.some((k) => kinds.includes(k))) ok = true;
      }
      expect(ok, c.id).toBe(true);
    }
  });

  it('parses effects', () => {
    expect(F('f+2 c-1')).toEqual({ f: 2, c: -1 });
    expect(F('')).toEqual({});
    expect(() => F('x+1')).toThrow();
  });

  it('has endings for every way out', () => {
    for (const id of ['starve', 'dark', 'hurt', 'scatter', 'plain']) expect(ENDING[id]).toBeTruthy();
    expect(ENDINGS.filter((e) => e.kind === 'arrive').length).toBeGreaterThanOrEqual(5);
  });
});

describe('tidings runs', () => {
  it('builds the same map and hand from the same seed', () => {
    const a = newRun(42), b = newRun(42);
    expect(a.map).toEqual(b.map);
    expect(a.hand).toEqual(b.hand);
    expect(a.map.length).toBe(LAST + 1);
    expect(a.map[0].length).toBe(1);
    expect(a.map[LAST].length).toBe(1);
    for (let row = 1; row < LAST; row++) {
      expect(a.map[row].length).toBe(2);
      expect(a.map[row][0].kind).not.toBe(a.map[row][1].kind);
      for (const n of a.map[row]) expect(REGION_KINDS[regionOf(row)]).toContain(n.kind);
    }
    expect(makeMap(43)).not.toEqual(a.map);
  });

  it('replays a journey exactly from its seed and actions', () => {
    for (const seed of [1, 7, 99]) {
      const r = playRun(newRun(seed), careful());
      const again = replay(seed, r.actions);
      expect(again.res).toEqual(r.res);
      expect(again.end).toEqual(r.end);
      expect(again.log).toEqual(r.log);
    }
  });

  it('deals three cards, lets you face two, then asks for the road', () => {
    const r = newRun(5);
    expect(r.hand.length).toBe(TUNE.hand);
    expect(r.phase).toBe('cards');
    const a = legal(r)[0];
    expect(act(r, a)).toBe(true);
    expect(r.faced).toBe(1);
    // A faced card can't be faced again.
    expect(actError(r, `P${a[1]}.0`)).toBeTruthy();
    expect(act(r, legal(r)[0])).toBe(true);
    expect(r.phase).toBe('road');
    expect(actError(r, 'P0.0')).toBeTruthy();
    expect(act(r, 'M1')).toBe(true);
    expect(r.stop).toBe(1);
    expect(r.path).toEqual([0, 1]);
    expect(r.hand.length).toBe(TUNE.hand);
  });

  it('never deals a non-repeating card twice, and holds at most one card you must face', () => {
    for (let seed = 0; seed < 40; seed++) {
      const r = newRun(seed);
      const seen: string[] = [];
      while (r.phase !== 'over') {
        if (r.phase === 'cards' && r.faced === 0) {
          expect(r.hand.filter((h) => CARD[h.id].must).length).toBeLessThanOrEqual(1);
          for (const h of r.hand) {
            if (!CARD[h.id].repeat) expect(seen).not.toContain(h.id);
            seen.push(h.id);
          }
        }
        act(r, careful()(r, Math.random));
      }
    }
  });

  it('makes you face the ⚑ card before passing by', () => {
    // Find a hand with a must card and face something else first.
    for (let seed = 0; seed < 400; seed++) {
      const r = newRun(seed);
      for (let stop = 0; stop < 6 && r.phase !== 'over'; stop++) {
        const m = r.hand.findIndex((h) => CARD[h.id].must);
        if (m >= 0 && r.phase === 'cards') {
          const other = r.hand.findIndex((h, i) => i !== m && !CARD[h.id].must);
          const k = CARD[r.hand[other].id].choices.findIndex((ch) => !blockOf(r, ch));
          act(r, `P${other}.${k}`);
          if (r.phase !== 'cards') break;
          const third = r.hand.findIndex((_, i) => i !== m && i !== other);
          expect(cardBlock(r, third)).toMatch(/passed by/);
          expect(cardBlock(r, m)).toBeNull();
          return;
        }
        while (r.phase === 'cards') act(r, legal(r)[0]);
        if (r.phase === 'road') act(r, 'M0');
      }
    }
    throw new Error('no hand with a must card found');
  });

  it('gates companion choices and coin, and caps gains', () => {
    const r = newRun(11);
    const fen = CARD.toll.choices.find((ch) => ch.need === 'fen')!;
    expect(blockOf(r, fen)).toMatch(/Fen/);
    r.band.push({ id: 'fen', at: 0 });
    expect(blockOf(r, fen)).toBeNull();
    r.res.c = 1;
    expect(blockOf(r, CARD.toll.choices[0])).toMatch(/coin/);
    r.band.push({ id: 'hob', at: 0 }, { id: 'wren', at: 0 });
    expect(blockOf(r, CARD.goatgirl.choices[0])).toMatch(/full/);
  });

  it('charges legs by place and band, and the last mile is free', () => {
    const r = newRun(3);
    r.stop = 5;
    const row = r.map[6];
    for (let k = 0; k < 2; k++) {
      const fx = legCost(r, k);
      expect(fx.f).toBe(-TUNE.legFoodHills);
      expect(Math.abs(fx.o ?? 0)).toBe(KIND_INFO[row[k].kind].oil);
    }
    r.band = [{ id: 'fen', at: 0 }, { id: 'hob', at: 0 }];
    expect(legCost(r, 0).f).toBe(-TUNE.legFoodHills - TUNE.bandFood);
    r.stop = LAST - 1;
    expect(legCost(r, 0)).toEqual({});
  });

  it('ends the journey when a resource runs out, but not coin', () => {
    const r = newRun(8);
    r.res.f = 1;
    r.res.c = 0;
    // Walk until the food runs out.
    while (r.phase !== 'over') {
      if (r.phase === 'cards') {
        const a = legal(r).find((x) => {
          const ch = CARD[r.hand[Number(x[1])].id].choices[Number(x[3])];
          return !(ch.fx.f ?? 0) && ch.odds === undefined;
        });
        act(r, a ?? legal(r)[0]);
      } else act(r, 'M0');
    }
    expect(['starve', 'dark', 'hurt', 'scatter']).toContain(r.end!.ending);
    expect(r.res[r.end!.cause!]).toBe(0);
  });

  it('scores an arrival from what is left, coin, companions and promises', () => {
    let r: Run | null = null;
    for (let seed = 1000; seed < 1100 && !r; seed++) {
      const x = playRun(newRun(seed), careful());
      if (x.end!.ending !== 'starve' && ENDING[x.end!.ending].kind === 'arrive' && x.end!.kept.length) r = x;
    }
    expect(r).toBeTruthy();
    const e = r!.end!;
    expect(e.score).toBe(r!.res.f + r!.res.o + r!.res.h + r!.res.t + Math.floor(r!.res.c / 2) + TUNE.compPts * r!.band.length + TUNE.promisePts * e.kept.length);
    expect(scoreOf(r!)).toBe(e.score);
    expect(e.stars).toBeGreaterThanOrEqual(1);
  });

  it('rolls gambles from the seed, near their shown odds', () => {
    let won = 0, n = 0;
    for (let seed = 0; seed < 3000 && n < 400; seed++) {
      const r = newRun(seed);
      const h = r.hand.findIndex((x) => x.id === 'well');
      if (h < 0) continue;
      act(r, `P${h}.0`);
      n++;
      if (r.hand[h].won) won++;
      // Same seed, same roll.
      const again = newRun(seed);
      act(again, `P${h}.0`);
      expect(again.hand[h].won).toBe(r.hand[h].won);
    }
    expect(n).toBeGreaterThan(40);
    expect(won / n).toBeGreaterThan(0.3);
    expect(won / n).toBeLessThan(0.7);
  });

  it('remembers kindness: a flag brings its callback later', () => {
    const r = newRun(1);
    r.flags.peddler = 0;
    r.stop = 1;
    expect(eligible(r, CARD.peddler2)).toBe(false);
    r.stop = 2;
    expect(eligible(r, CARD.peddler2)).toBe(true);
    expect(telling({ id: 'peddler2', v: 0 }).title).toBe('The Peddler Again');
  });

  it('balances: careful play arrives about half the time, random and one-track play rarely', () => {
    const rate = (pol: Parameters<typeof playRun>[1], n: number) => {
      let k = 0;
      for (let seed = 2000; seed < 2000 + n; seed++) if (ENDING[playRun(newRun(seed), pol).end!.ending].kind === 'arrive') k++;
      return k / n;
    };
    const c = rate(careful(), 80);
    expect(c).toBeGreaterThan(0.35);
    expect(c).toBeLessThan(0.75);
    expect(rate(random, 200)).toBeLessThan(0.15);
    expect(rate(safe, 100)).toBeLessThan(c);
    expect(rate(risky, 100)).toBeLessThan(c);
  });

  it('keeps the core pure', () => {
    const dir = join(__dirname, '../../src/tidings/core');
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8').replace(/\/\/.*$/gm, '');
      expect(src, f).not.toMatch(/Math\.random|Date\.|new Date|document\.|window\./);
    }
  });
});
