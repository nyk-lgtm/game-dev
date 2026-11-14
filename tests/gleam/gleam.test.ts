import { archiveDays, streakOf } from '../../src/gleam/streak';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CRYSTAL, Ctx, LAMP, SIZES, SOCKET, WALL, blankBoard, cycleCode, deduce, generate, nextHint, piecesLeft, replay, setCode, reasonText, setToken, solveAll, status, trace, trapped, idlePieces, sizeDef, HINT_MAX,
  type Puzzle, type Size,
} from '../../src/gleam/core';

/** A hand-made 4×4: red lamp at the left of row 1 shining right; a socket at (1,2); a red crystal at (3,2);
 *  a dark crystal at (1,3) straight ahead; one mirror in the tray. */
function tiny(): Puzzle {
  const n = 4;
  const kind = new Array(16).fill(0);
  const target = new Array(16).fill(-1);
  kind[4] = LAMP;
  kind[6] = SOCKET;
  kind[14] = CRYSTAL;
  target[14] = 1;
  kind[7] = CRYSTAL;
  target[7] = 0;
  kind[0] = WALL;
  return { seed: 0, size: 'small', n, kind, target, lamps: [{ cell: 4, dir: 1, mask: 1 }], sockets: [6], given: [-1], stock: [1, 0, 0, 0, 0], solution: [2] };
}

describe('gleam light', () => {
  it('stays pure: no Math.random, Date or DOM in core/', () => {
    const dir = 'src/gleam/core';
    for (const f of readdirSync(dir)) {
      const src = readFileSync(join(dir, f), 'utf8');
      expect(src, f).not.toMatch(/Math\.random|Date\.|new Date|document\.|window\./);
    }
  });

  it('mirrors turn, crystals swallow, dark crystals must stay dark', () => {
    const p = tiny();
    // Empty: the beam hits the dark crystal.
    let s = status(p, [0]);
    expect(s.wrong).toEqual([7]);
    expect(s.solved).toBe(false);
    // ⟋ sends it up and off the board.
    s = status(p, [1]);
    expect(s.light.escapes.length).toBe(1);
    expect(s.solved).toBe(false);
    // ⟍ sends it down into the red crystal.
    s = status(p, [2]);
    expect(s.light.got[14]).toBe(1);
    expect(s.solved).toBe(true);
    expect(solveAll(p, 3)).toEqual([[2]]);
    expect(deduce(p, 1).solved).toBe(true);
  });

  it('splitters pass and turn; filters keep one colour; colours add at crystals', () => {
    const p = tiny();
    p.lamps[0].mask = 7;
    p.stock = [0, 1, 1, 0, 0];
    const split = trace(p, [4]);
    expect(split.got[14]).toBe(7);
    expect(split.got[7]).toBe(7);
    const red = trace(p, [5]);
    expect(red.got[7]).toBe(1);
    expect(red.got[14]).toBe(0);
  });
});

describe('gleam puzzles', () => {
  for (const size of Object.keys(SIZES) as Size[])
    it(`${size}: deterministic, unique, deducible within its depth, answer lights everything`, () => {
      for (let seed = 1; seed <= 8; seed++) {
        const p = generate(seed, size);
        expect(generate(seed, size)).toEqual(p);
        expect(p.n).toBe(SIZES[size].n);
        expect(status(p, p.solution).solved).toBe(true);
        expect(solveAll(p, 2)).toEqual([p.solution]);
        const d = deduce(p, SIZES[size].maxDepth);
        expect(d.solved).toBe(true);
        expect(Array.from(d.dom)).toEqual(p.solution.map((c) => 1 << c));
        if (SIZES[size].deep) expect(d.depth).toBe(2);
        // Small always takes a detour off the most direct route; Medium always hands out a filter.
        if (SIZES[size].trap) expect(trapped(p)).toBe(true);
        // v3: every piece matters, and Large needs several look-aheads.
        expect(idlePieces(p)).toEqual([]);
        const need = sizeDef(size).deepSteps ?? 0;
        expect(d.log.filter((e) => e.depth >= 2).length).toBeGreaterThanOrEqual(need);
        if (SIZES[size].filter) expect(p.stock[2] + p.stock[3] + p.stock[4]).toBeGreaterThan(0);
        p.given.forEach((g, i) => g >= 0 && expect(g).toBe(p.solution[i]));
        // Pieces only on sockets; the tray is the answer's pieces.
        expect(piecesLeft(p, p.solution).every((x) => x === 0)).toBe(true);
      }
    });

  it('different seeds give different puzzles', () => {
    const keys = new Set([...Array(20).keys()].map((k) => JSON.stringify(generate(100 + k, 'medium').kind)));
    expect(keys.size).toBe(20);
  });

  it('the exact solver agrees with brute force on small boards', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const p = generate(seed, 'small');
      // Every assignment of codes to sockets that uses the tray exactly.
      const found: number[][] = [];
      const codes = [0, 1, 2, 3, 4];
      const rec = (i: number, b: number[]) => {
        if (i === p.sockets.length) {
          if (status(p, b).solved) found.push([...b]);
          return;
        }
        for (const c of p.given[i] >= 0 ? [p.given[i]] : codes) {
          b[i] = c;
          rec(i + 1, b);
        }
      };
      rec(0, []);
      expect(found).toEqual([p.solution]);
    }
  });

  it('deductions never rule out the answer (checks are sound)', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const p = generate(seed, 'large');
      const d = deduce(p, 2);
      for (const e of d.log) expect(e.code).not.toBe(p.solution[e.socket]);
      const ctx = new Ctx(p);
      const dom = Uint8Array.from(p.solution, (c) => 1 << c);
      expect(ctx.check(dom)).toBeNull();
      expect(ctx.complete()).toBe(true);
    }
  });
});

describe('gleam rule versions', () => {
  const fnv = (x: string) => {
    let h = 2166136261;
    for (let i = 0; i < x.length; i++) h = Math.imul(h ^ x.charCodeAt(i), 16777619);
    return h >>> 0;
  };
  it('v2 puzzles (old saves, dailies up to 2026-11-14) are still built exactly', () => {
    const got = (['small', 'medium', 'large'] as const).map((size) => [1, 2, 3].map((k) => fnv(JSON.stringify(generate(k, size, 2)))));
    expect(got).toEqual([
      [2398916682, 3639362409, 443326550],
      [1129677738, 3970143487, 1846672514],
      [1457852260, 1856517157, 4156411139],
    ]);
  });
  it('an idle piece is spotted: a splitter whose turned beam goes nowhere', () => {
    const q = tiny();
    q.stock = [0, 1, 0, 0, 0];
    q.solution = [4];
    q.target[7] = 1;
    // The ⟍ splitter sends red down into the red crystal and on into the (now red) crystal ahead: both matter.
    expect(idlePieces(q)).toEqual([]);
    // Without the crystal below, its turned half lights nothing: the splitter is idle.
    q.kind[14] = 0;
    q.target[14] = -1;
    expect(idlePieces(q)).toEqual([0]);
  });
});

describe('gleam daily bookkeeping', () => {
  it('streaks count days solved on the day, up to today or yesterday', () => {
    const r = (onDay = true) => ({ ms: 1000, hints: 0, onDay });
    expect(streakOf({}, '2026-11-14')).toBe(0);
    expect(streakOf({ '2026-11-14': r(), '2026-11-13': r(), '2026-11-11': r() }, '2026-11-14')).toBe(2);
    expect(streakOf({ '2026-11-13': r(), '2026-11-12': r() }, '2026-11-14')).toBe(2);
    expect(streakOf({ '2026-11-13': r(), '2026-11-12': r(false) }, '2026-11-14')).toBe(1);
    expect(archiveDays('2026-11-01')).toEqual(['2026-11-01', '2026-10-31', '2026-10-30', '2026-10-29', '2026-10-28', '2026-10-27', '2026-10-26', '2026-10-25']);
  });
});

describe('gleam deduction from part-filled boards', () => {
  it('never rules out the answer, and hints always name an answer piece', () => {
    let k = 0;
    for (const size of Object.keys(SIZES) as Size[])
      for (let seed = 1; seed <= 25; seed++) {
        const p = generate(seed + 500, size);
        // A seeded subset of the answer's pieces already placed.
        const board = p.solution.map((c, i) => (p.given[i] >= 0 || ((seed * 7 + i * 13 + k++) % 3 === 0 && c > 0) ? c : 0));
        const ctx = new Ctx(p);
        const dom0 = ctx.initial();
        board.forEach((c, i) => c > 0 && (dom0[i] = 1 << c));
        const d = deduce(p, 2, dom0, ctx);
        for (const e of d.log) expect(e.code, `${size} ${seed}`).not.toBe(p.solution[e.socket]);
        // Follow hints to the end.
        let b = board;
        for (let s = 0; s < 20 && !status(p, b).solved; s++) {
          const h = nextHint(p, b);
          expect(h.kind, `${size} ${seed}`).toBe('place');
          if (h.kind !== 'place') break;
          expect(h.code).toBe(p.solution[h.socket]);
          expect(h.text.replace(/<[^>]+>/g, '').length).toBeLessThanOrEqual(HINT_MAX);
          b = setCode(p, b, h.socket, h.code)!;
          expect(b).not.toBeNull();
        }
        expect(status(p, b).solved, `${size} ${seed}`).toBe(true);
      }
  });
});

describe('gleam play', () => {
  const p = generate(42, 'medium');

  it('following hints alone solves the puzzle', () => {
    let board = blankBoard(p);
    for (let k = 0; k < 30 && !status(p, board).solved; k++) {
      const h = nextHint(p, board);
      expect(h.kind).toBe('place');
      if (h.kind !== 'place') break;
      expect(h.code).toBe(p.solution[h.socket]);
      expect(h.text.length).toBeGreaterThan(10);
      board = setCode(p, board, h.socket, h.code)!;
    }
    expect(status(p, board).solved).toBe(true);
    expect(nextHint(p, board).kind).toBe('done');
  });

  it('reasons name the rule that breaks, in plain words', () => {
    const q = tiny();
    expect(reasonText(q, { k: 'dark', cell: 7, mask: 1 })).toBe('red light would hit a dark crystal');
    expect(reasonText(q, { k: 'unreach', cell: 14, mask: 1 })).toBe('red light could no longer reach the red crystal');
    q.target[14] = 5;
    expect(reasonText(q, { k: 'unreach', cell: 14, mask: 5 })).toBe('red or blue light could no longer reach the magenta crystal');
    expect(reasonText(q, { k: 'wrong', cell: 14, mask: 2 })).toBe('green light would reach the magenta crystal (red + blue only)');
    q.given = [2];
    expect(reasonText(q, { k: 'unlit', cell: 6 })).toMatch(/^the fixed ⟍ mirror would sit in the dark/);
    expect(reasonText(q, { k: 'deep', depth: 2, inner: { k: 'over', t: 0 } })).toBe('a step later, the tray has only 1 mirror');
  });

  it('a hint points at a wrong piece first', () => {
    const i = p.solution.findIndex((c, k) => c === 0 && p.given[k] < 0);
    const board = setCode(p, blankBoard(p), i, cycleCode(p, blankBoard(p), i))!;
    expect(nextHint(p, board)).toEqual({ kind: 'wrong', socket: i });
  });

  it('replays set, hint, undo and reset tokens', () => {
    const order = p.solution.map((c, i) => [i, c]).filter(([i, c]) => c > 0 && p.given[i] < 0);
    const a = order.map(([i, c], k) => setToken(i, c, k === 0)).join('');
    const r = replay(p, a);
    expect(r.board).toEqual(p.solution);
    expect(r.hints).toBe(1);
    expect(replay(p, `${a}U`).board).not.toEqual(p.solution);
    expect(replay(p, `${a}UU${a}`).board).toEqual(p.solution);
    expect(replay(p, `${a}R`).board).toEqual(blankBoard(p));
    expect(replay(p, `${a}RU`).board).toEqual(p.solution);
    // A drag between two rings swaps them, and undoes in one step.
    const [i, c] = order[0];
    const j = p.sockets.findIndex((_, k) => p.given[k] < 0 && p.solution[k] !== c);
    const moved = replay(p, `${a}M${i.toString(36)}${j.toString(36)}`).board;
    expect(moved[j]).toBe(c);
    expect(moved[i]).toBe(p.solution[j]);
    expect(replay(p, `${a}M${i.toString(36)}${j.toString(36)}U`).board).toEqual(p.solution);
  });

  it('the tray limits what a tap or a set can place', () => {
    let board = blankBoard(p);
    const free = p.sockets.map((_, i) => i).filter((i) => p.given[i] < 0);
    // Tap every free socket once: never more pieces than the tray holds.
    for (const i of free) board = setCode(p, board, i, cycleCode(p, board, i)) ?? board;
    expect(piecesLeft(p, board).every((x) => x >= 0)).toBe(true);
    // Cycling one socket comes back to empty.
    const i = free[0];
    let b = blankBoard(p);
    const seen: number[] = [];
    for (let k = 0; k < 10; k++) {
      const c = cycleCode(p, b, i);
      seen.push(c);
      b = setCode(p, b, i, c) ?? b;
      if (c === 0) break;
    }
    expect(seen.at(-1)).toBe(0);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen.length).toBeLessThanOrEqual(3);
    // With a mirror armed: place it, then only turn it.
    let c = cycleCode(p, blankBoard(p), i, 0);
    expect(c).toBe(1);
    b = setCode(p, blankBoard(p), i, c)!;
    c = cycleCode(p, b, i, 0);
    expect(c).toBe(2);
    b = setCode(p, b, i, c)!;
    expect(cycleCode(p, b, i, 0)).toBe(1);
  });
});
