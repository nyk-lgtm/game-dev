import { describe, expect, it } from 'vitest';
import { bit, generate, initialDomains, isLink, makeBoard, nextHint, propagate, single, solved, type ClueMode, type Level, type Puzzle } from '../../src/triad/core';

const only = (p: Puzzle, keep: number[]) => p.clue.map((n, i) => (keep.includes(i) ? n : -1));
const baseDom = (p: Puzzle, vals: number[], notes: number[]) =>
  initialDomains(p).map((d, i) => (vals[i] >= 0 ? bit(vals[i]) : notes[i] && notes[i] & bit(p.solution[i]) ? d & notes[i] : d));

/** Follows hints to the end, calling `check` on each. */
function walk(p: Puzzle, check: (h: ReturnType<typeof nextHint>, vals: number[], notes: number[]) => void) {
  const vals = p.given.map(() => -1);
  const notes = p.given.map(() => 0);
  for (let k = 0; k < 400 && !solved(p, vals); k++) {
    const h = nextHint(p, vals, notes);
    check(h, vals, notes);
    if (h.kind === 'step') vals[h.cell] = h.value;
    else if (h.kind === 'not') notes[h.cell] = (notes[h.cell] || 7) & ~(1 << h.not);
    else throw new Error(h.kind);
  }
  expect(solved(p, vals)).toBe(true);
}

const cases: [Level, ClueMode, number][] = [
  ['normal', 'numbers', 3],
  ['normal', 'links', 3],
  ['hard', 'numbers', 3],
  ['hard', 'links', 4],
];

describe('hints name every clue they use', () => {
  for (const [level, mode, radius] of cases)
    it(`${level} ${mode} r${radius}: a step's clues alone pin the hex, and each one is needed`, () => {
      const b = makeBoard(radius);
      let several = 0;
      for (let seed = 1; seed <= 3; seed++) {
        const p = generate(seed, radius, level, mode);
        walk(p, (h, vals, notes) => {
          if (h.kind !== 'step' || h.trial || !h.clues) return;
          if (h.text.startsWith('The link says it matches') || h.text.startsWith('Links chain')) return;
          const pins = (keep: number[]) => {
            const d = baseDom(p, vals, notes);
            propagate(b, only(p, keep), d);
            return single(d[h.cell]);
          };
          expect(pins(h.clues)).toBe(h.value);
          if (h.clues.length > 1) {
            several++;
            for (const c of h.clues) expect(pins(h.clues.filter((x) => x !== c))).toBe(-1);
            // Every number it leans on is named in the text.
            for (const c of h.clues) if (!isLink(b, c)) expect(h.text).toContain(`<b>${p.clue[c]}</b>`);
          }
        });
      }
      expect(several).toBeGreaterThan(0);
    });
});

describe('"what if" hints lay out their chain', () => {
  for (const [level, mode, radius] of cases.filter((c) => c[0] === 'hard'))
    it(`${mode} r${radius}: the supposition breaks the named clue through the chain`, () => {
      const b = makeBoard(radius);
      let trials = 0;
      for (let seed = 1; seed <= 4; seed++) {
        const p = generate(seed, radius, level, mode);
        walk(p, (h, vals, notes) => {
          if ((h.kind !== 'step' && h.kind !== 'not') || !h.trial) return;
          trials++;
          const t = h.trial;
          expect(t.value).not.toBe(p.solution[t.cell]);
          expect(h.clues).toContain(t.breaks);
          // The named clues alone refute the supposition, and its chain is what they force on the way.
          const d = baseDom(p, vals, notes);
          d[t.cell] = bit(t.value);
          const fail = { clue: -1 };
          expect(propagate(b, only(p, h.clues!), d, [], fail)).toBe(false);
          expect(fail.clue).toBe(t.breaks);
          for (const c of t.chain) {
            expect(c.cell).not.toBe(t.cell);
            expect(c.left).not.toBe(0);
          }
          expect(new Set(t.chain.map((c) => c.cell)).size).toBe(t.chain.length);
        });
      }
      expect(trials).toBeGreaterThan(0);
    });
});
