import { describe, expect, it } from 'vitest';
import {
  SIZES, TUTORIAL, TUTORIAL_STEPS, beatsCount, propagateDeep, bit, brokenClues, deducible, generate, initialDomains, makeBoard, nextHint, predator, prey, propagate, solved,
} from '../../src/triad/core';

describe('board and rules', () => {
  it('hexagon sizes and symmetric neighbors', () => {
    expect(makeBoard(2).cells.length).toBe(19);
    expect(makeBoard(3).cells.length).toBe(37);
    expect(makeBoard(4).cells.length).toBe(61);
    const b = makeBoard(3);
    b.adj.forEach((ns, i) => ns.forEach((j) => expect(b.adj[j]).toContain(i)));
  });
  it('fire burns leaf, leaf drinks water, water douses fire', () => {
    expect(prey(0)).toBe(2);
    expect(prey(2)).toBe(1);
    expect(prey(1)).toBe(0);
    for (let e = 0; e < 3; e++) expect(prey(predator(e))).toBe(e);
  });
});

describe('generated puzzles', () => {
  for (const [name, { radius }] of Object.entries(SIZES))
    it(`${name}: deterministic, consistent, deducible, and deductions never cut the answer`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const p = generate(seed, radius);
        expect(generate(seed, radius)).toEqual(p);
        const b = makeBoard(radius);
        p.clue.forEach((n, i) => n >= 0 && expect(beatsCount(b, p.solution, i)).toBe(n));
        p.given.forEach((g, i) => g >= 0 && expect(g).toBe(p.solution[i]));
        expect(deducible(b, p.clue, p.given)).toBe(true);
        const dom = initialDomains(p);
        propagate(b, p.clue, dom);
        dom.forEach((d, i) => expect(d).toBe(bit(p.solution[i])));
        expect(p.given.some((g) => g >= 0)).toBe(true);
      }
    });
});

describe('play', () => {
  const p = generate(42, 3);
  const blank = () => p.given.map(() => -1);

  it('following hints alone solves the puzzle', () => {
    const vals = blank();
    for (let k = 0; k < 100 && !solved(p, vals); k++) {
      const h = nextHint(p, vals);
      expect(h.kind).toBe('step');
      if (h.kind !== 'step') break;
      expect(h.value).toBe(p.solution[h.cell]);
      vals[h.cell] = h.value;
    }
    expect(solved(p, vals)).toBe(true);
    expect(nextHint(p, vals).kind).toBe('done');
  });

  it('points out a wrong entry first', () => {
    const vals = blank();
    const i = p.given.findIndex((g) => g < 0);
    vals[i] = (p.solution[i] + 1) % 3;
    expect(nextHint(p, vals)).toEqual({ kind: 'wrong', cell: i });
  });

  it('flags clues that can no longer add up', () => {
    const full = p.solution.slice();
    expect(brokenClues(p, full)).toEqual([]);
    // Turning every cell into fire breaks some clue (nobody beats anybody).
    const fire = full.map(() => 0);
    expect(brokenClues(p, fire).length).toBeGreaterThan(0);
  });
});

describe('levels', () => {
  it('normal is the default generator; easy keeps more numbers; hard keeps fewer', () => {
    let easy = 0, normal = 0, hard = 0;
    for (let seed = 1; seed <= 10; seed++) {
      expect(generate(seed, 3, 'normal')).toEqual(generate(seed, 3));
      easy += generate(seed, 3, 'easy').clue.filter((c) => c >= 0).length;
      normal += generate(seed, 3).clue.filter((c) => c >= 0).length;
      hard += generate(seed, 3, 'hard').clue.filter((c) => c >= 0).length;
    }
    expect(easy).toBeGreaterThan(normal);
    expect(hard).toBeLessThan(normal);
  });

  for (const radius of [2, 3, 4])
    it(`hard r${radius}: unique, never cuts the answer, and hints (with notes) solve it`, () => {
      for (let seed = 1; seed <= 6; seed++) {
        const p = generate(seed, radius, 'hard');
        expect(generate(seed, radius, 'hard')).toEqual(p);
        const b = makeBoard(radius);
        expect(deducible(b, p.clue, p.given)).toBe(false);
        expect(deducible(b, p.clue, p.given, true)).toBe(true);
        const dom = initialDomains(p);
        expect(propagateDeep(b, p.clue, dom)).toBe(true);
        dom.forEach((d, i) => expect(d).toBe(bit(p.solution[i])));
        const vals = p.given.map(() => -1);
        const notes = p.given.map(() => 0);
        let whatIfs = 0;
        for (let k = 0; k < 300 && !solved(p, vals); k++) {
          const h = nextHint(p, vals, notes);
          if (h.kind === 'step') {
            expect(h.value).toBe(p.solution[h.cell]);
            vals[h.cell] = h.value;
          } else if (h.kind === 'not') {
            expect(h.not).not.toBe(p.solution[h.cell]);
            notes[h.cell] = (notes[h.cell] || 7) & ~(1 << h.not);
            whatIfs++;
          } else throw new Error(h.kind);
        }
        expect(solved(p, vals)).toBe(true);
      }
    });
});

describe('tutorial', () => {
  it('is consistent, unique by single clues, and its steps cover every blank exactly once', () => {
    const p = TUTORIAL;
    const b = makeBoard(1);
    p.clue.forEach((n, i) => n >= 0 && expect(beatsCount(b, p.solution, i)).toBe(n));
    expect(deducible(b, p.clue, p.given)).toBe(true);
    const cells = TUTORIAL_STEPS.flatMap((st) => st.cells).sort();
    expect(cells).toEqual(p.given.map((g, i) => (g < 0 ? i : -1)).filter((i) => i >= 0));
    // Each step's numbered hex really is adjacent to (or is) the hexes it teaches.
    for (const st of TUTORIAL_STEPS) for (const c of st.cells) expect(c === st.focus || b.adj[st.focus].includes(c) || st.focus === 6).toBe(true);
  });
});
