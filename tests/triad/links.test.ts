import { describe, expect, it } from 'vitest';
import {
  SAME, SIZES, beatsCount, bit, brokenClues, deducible, generate, initialDomains, isLink, linkCells, linksAt, makeBoard, nextHint, propagate, propagateDeep, solved,
  type Level, type Puzzle, type Trial,
} from '../../src/triad/core';

const LEVELS: Level[] = ['easy', 'normal', 'hard'];
const fnv = (s: string, h = 0x811c9dc5) => {
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h;
};

/** Independent check: count answers (up to 2) by plain backtracking, no deductions. */
function countAnswers(p: Puzzle, limit = 2): number {
  const b = makeBoard(p.radius);
  const N = b.cells.length;
  const vals = p.given.slice();
  const okNumber = (c: number) => {
    if (p.clue[c] < 0 || vals[c] < 0) return true;
    let beat = 0, open = 0;
    for (const j of b.adj[c]) if (vals[j] < 0) open++; else if (vals[j] === (vals[c] + 2) % 3) beat++;
    return beat <= p.clue[c] && beat + open >= p.clue[c];
  };
  const ok = (i: number) =>
    [i, ...b.adj[i]].every(okNumber) && linksAt(b, p.clue, i).every((id) => linkCells(b, id).every((k) => vals[k] < 0 || vals[k] === vals[i]));
  let found = 0;
  const go = (i: number): void => {
    if (found >= limit) return;
    if (i === N) return void found++;
    if (p.given[i] >= 0) return go(i + 1);
    for (let v = 0; v < 3; v++) {
      vals[i] = v;
      if (ok(i)) go(i + 1);
    }
    vals[i] = -1;
  };
  go(0);
  return found;
}

describe('numbers mode is unchanged', () => {
  it('same puzzles as before links existed (fingerprint), and "numbers" is the default', () => {
    let h = 0x811c9dc5;
    for (const level of LEVELS)
      for (const r of [2, 3, 4])
        for (let s = 1; s <= 4; s++) {
          const p = generate(s, r, level);
          expect(generate(s, r, level, 'numbers')).toEqual(p);
          expect(p.clue.length).toBe(makeBoard(r).cells.length);
          expect(p.links).toBeUndefined();
          h = fnv(JSON.stringify(p), h);
        }
    expect(h.toString(16)).toBe('a4ca621e');
  });
});

describe('links mode', () => {
  it('boards list every neighbor pair once', () => {
    for (const r of [1, 2, 3, 4]) {
      const b = makeBoard(r);
      expect(b.edges.length).toBe(b.adj.reduce((a, ns) => a + ns.length, 0) / 2);
      for (const [x, y] of b.edges) expect(x < y && b.adj[x].includes(y)).toBe(true);
    }
  });

  for (const level of LEVELS)
    for (const [name, { radius }] of Object.entries(SIZES))
      it(`${level} ${name}: consistent, deterministic, guess-free and unique`, () => {
        const b = makeBoard(radius);
        const N = b.cells.length;
        const cap = 2 + 2 * radius;
        for (let seed = 1; seed <= 20; seed++) {
          const p = generate(seed, radius, level, 'links');
          expect(generate(seed, radius, level, 'links')).toEqual(p);
          expect(p.links).toBe(true);
          expect(p.clue.length).toBe(N + b.edges.length);
          p.clue.forEach((n, i) => {
            if (n < 0) return;
            if (isLink(b, i)) {
              expect(n).toBe(SAME);
              const [x, y] = linkCells(b, i);
              expect(p.solution[x]).toBe(p.solution[y]);
            } else expect(beatsCount(b, p.solution, i)).toBe(n);
          });
          p.given.forEach((g, i) => g >= 0 && expect(g).toBe(p.solution[i]));
          expect(p.clue.slice(N).some((c) => c >= 0)).toBe(true);
          // Deductions finish it and never cut the answer, so the answer is unique.
          const dom = initialDomains(p);
          if (level === 'hard') {
            expect(deducible(b, p.clue, p.given)).toBe(false);
            const trials: Trial[] = [];
            expect(propagateDeep(b, p.clue, dom, trials)).toBe(true);
            expect(trials.length).toBeLessThanOrEqual(cap);
          } else {
            expect(deducible(b, p.clue, p.given)).toBe(true);
            propagate(b, p.clue, dom);
          }
          dom.forEach((d, i) => expect(d).toBe(bit(p.solution[i])));
          if (radius === 2) expect(countAnswers(p)).toBe(1);
        }
      }, 60_000);

  it('easy keeps more clues than normal, hard fewer', () => {
    const count = (l: Level) => [...Array(10).keys()].reduce((a, s) => a + generate(s + 1, 3, l, 'links').clue.filter((c) => c >= 0).length, 0);
    expect(count('easy')).toBeGreaterThan(count('normal'));
    expect(count('hard')).toBeLessThan(count('normal'));
  });

  for (const level of LEVELS)
    it(`${level}: following hints alone solves links puzzles, and links get explained`, () => {
      let linkHints = 0;
      for (const radius of [2, 3, 4])
        for (let seed = 1; seed <= 4; seed++) {
          const p = generate(seed, radius, level, 'links');
          const b = makeBoard(radius);
          const vals = p.given.map(() => -1);
          const notes = p.given.map(() => 0);
          for (let k = 0; k < 400 && !solved(p, vals); k++) {
            const h = nextHint(p, vals, notes);
            if (h.kind === 'step') {
              expect(h.value).toBe(p.solution[h.cell]);
              vals[h.cell] = h.value;
              if (h.clues?.every((c) => isLink(b, c))) {
                linkHints++;
                expect(h.text).toMatch(/match, so this is/);
              }
            } else if (h.kind === 'not') {
              expect(h.not).not.toBe(p.solution[h.cell]);
              notes[h.cell] = (notes[h.cell] || 7) & ~(1 << h.not);
            } else throw new Error(h.kind);
          }
          expect(solved(p, vals)).toBe(true);
        }
      expect(linkHints).toBeGreaterThan(0);
    });

  it('flags a link whose two hexes differ', () => {
    const p = generate(7, 3, 'normal', 'links');
    const b = makeBoard(3);
    expect(brokenClues(p, p.solution.slice())).toEqual([]);
    const id = p.clue.findIndex((c, i) => i >= b.cells.length && c >= 0);
    const [x, y] = linkCells(b, id);
    const vals = p.given.map(() => -1);
    vals[x] = p.solution[x];
    expect(brokenClues(p, vals)).not.toContain(id);
    vals[y] = (p.solution[x] + 1) % 3;
    expect(brokenClues(p, vals)).toContain(id);
  });
});
