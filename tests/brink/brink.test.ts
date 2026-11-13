import { describe, expect, it } from 'vitest';
import {
  CELLS,
  DARK,
  EMPTY,
  HOLE,
  LESSONS,
  LIGHT,
  MIRROR,
  N,
  NB,
  POOL,
  RING,
  TUNE,
  after,
  bestDefence,
  boardText,
  clone,
  loopPenalty,
  stoneKey,
  W,
  cellAt,
  chooseMove,
  crumbleAfter,
  crumbleOrder,
  dailyPuzzle,
  decodeMove,
  decodeRecord,
  encodeMove,
  encodeRecord,
  isLegal,
  legalMoves,
  lessonPuzzles,
  mirrored,
  newGame,
  play,
  recordOf,
  replay,
  search,
  stateOf,
  winningMoves,
  type State,
} from '../../src/brink/core';

/** An empty island with stones by axial coordinates; light to move. */
function position(light: [number, number][], dark: [number, number][], holes: [number, number][] = [], ply = 0): State {
  const s = newGame(1);
  s.cells.fill(EMPTY);
  for (const [q, r] of holes) s.cells[cellAt(q, r)] = HOLE;
  for (const [q, r] of light) s.cells[cellAt(q, r)] = LIGHT;
  for (const [q, r] of dark) s.cells[cellAt(q, r)] = DARK;
  s.ply = ply;
  return s;
}
const mv = (a: [number, number], b: [number, number]) => cellAt(...a) * 64 + cellAt(...b);

describe('island', () => {
  it('37 tiles, symmetric neighbours, a mirror that swaps sides', () => {
    expect(N).toBe(37);
    for (let i = 0; i < N; i++)
      for (let d = 0; d < 6; d++) {
        const j = NB[i * 6 + d];
        if (j >= 0) expect(NB[j * 6 + ((d + 3) % 6)]).toBe(i);
      }
    for (let i = 0; i < N; i++) {
      expect(MIRROR[MIRROR[i]]).toBe(i);
      expect(RING[MIRROR[i]]).toBe(RING[i]);
    }
    expect(CELLS.filter((_, i) => RING[i] === 3).length).toBe(18);
  });

  it('the start is mirror-symmetric with six stones each and no contact', () => {
    const s = newGame(5);
    expect(s.cells.filter((v) => v === LIGHT).length).toBe(6);
    expect(s.cells.filter((v) => v === DARK).length).toBe(6);
    for (let i = 0; i < N; i++) if (s.cells[i] === LIGHT) expect(s.cells[MIRROR[i]]).toBe(DARK);
    for (const m of legalMoves(s)) expect(s.cells[m & 63]).not.toBe(DARK);
  });

  it('crumbles every tile once, rim first, in mirror pairs, deterministic per seed', () => {
    const o = crumbleOrder(42);
    expect([...o]).toEqual([...crumbleOrder(42)]);
    expect(new Set(o).size).toBe(N);
    for (let k = 0; k < 18; k++) expect(RING[o[k]]).toBe(3);
    for (let k = 0; k + 1 < N - 1; k += 2) expect(MIRROR[o[k]]).toBe(o[k + 1]);
    expect([...crumbleOrder(43)]).not.toEqual([...o]);
  });
});

describe('shoves', () => {
  it('steps, shoves one or two, and three won’t budge', () => {
    const s = position([[0, 1], [-2, 2]], [[0, 0], [0, -1], [-2, 1], [-2, 0], [-2, -1]]);
    // One stone in front plus one behind it: a line of two moves.
    expect(isLegal(s, mv([0, 1], [0, 0]))).toBe(true);
    // Three in a row can't be shoved.
    expect(isLegal(s, mv([-2, 2], [-2, 1]))).toBe(false);
    const t = after(s, mv([0, 1], [0, 0]));
    expect(t.cells[cellAt(0, 0)]).toBe(LIGHT);
    expect(t.cells[cellAt(0, -1)]).toBe(DARK);
    expect(t.cells[cellAt(0, -2)]).toBe(DARK);
    expect(t.cells[cellAt(0, 1)]).toBe(EMPTY);
  });

  it('a stone shoved off the edge or into a hole is lost; you never step off', () => {
    const s = position([[0, -2], [1, 0]], [[0, -3], [1, -1]], [[1, -2]]);
    expect(isLegal(s, mv([0, -2], [0, -3]))).toBe(true);
    const t = after(s, mv([0, -2], [0, -3]));
    expect(t.lost[DARK]).toBe(1);
    expect(t.cells[cellAt(0, -3)]).toBe(LIGHT);
    const u = after(s, mv([1, 0], [1, -1]));
    expect(u.lost[DARK]).toBe(1);
    expect(u.cells[cellAt(1, -2)]).toBe(HOLE);
    // No move from the rim goes off the island or into a hole.
    for (const m of legalMoves(position([[0, -3]], [[3, 0]]))) expect(m & 63).toBeLessThan(N);
    expect(isLegal(s, cellAt(0, -2) * 64 + cellAt(1, -2))).toBe(false);
  });

  it('says whether a stone went over the edge or into a hole', () => {
    const s = position([[0, -2], [1, 0]], [[0, -3], [1, -1]], [[1, -2]]);
    expect(play(clone(s), mv([0, -2], [0, -3])).shovedOff).toMatchObject({ side: DARK, intoHole: false });
    expect(play(clone(s), mv([1, 0], [1, -1])).shovedOff).toMatchObject({ side: DARK, intoHole: true });
  });

  it('your own stones count in the line, and can go over too', () => {
    const s = position([[0, -1], [0, -2]], [[0, -3], [2, 0]]);
    const t = after(s, mv([0, -1], [0, -2]));
    expect(t.lost[DARK]).toBe(1);
    const u = position([[0, -2], [0, -3], [1, -1]], [[0, -1], [3, 0]]);
    u.turn = DARK;
    const v = after(u, mv([0, -1], [0, -2]));
    expect(v.lost[LIGHT]).toBe(1);
  });

  it('tiles fall after every move from the crumble start, taking stones with them', () => {
    const s = newGame(9);
    for (let k = 0; k < TUNE.crumbleStart; k++) {
      expect(crumbleAfter(s, s.ply)).toBe(k >= TUNE.crumbleStart ? s.order[0] : -1);
      play(s, legalMoves(s)[0]);
    }
    expect(s.cells.filter((v) => v === HOLE).length).toBe(0);
    const doomed = crumbleAfter(s, s.ply);
    expect(doomed).toBe(s.order[0]);
    // Put a dark stone on the falling tile; after light's move it is gone.
    s.cells[doomed] = DARK;
    const lost = s.lost[DARK];
    const m = legalMoves(s).find((x) => (x & 63) !== doomed && (x >> 6) !== doomed && !after(s, x).lost[DARK])!;
    const ev = play(s, m);
    expect(ev.crumbled).toBe(doomed);
    expect(ev.crumbleTook).toBe(DARK);
    expect(s.lost[DARK]).toBe(lost + 1);
    expect(s.cells[doomed]).toBe(HOLE);
  });

  it('pushing the target number off wins', () => {
    const s = position([[0, -2]], [[0, -3], [2, 0]]);
    s.lost[DARK] = TUNE.target - 1;
    const t = after(s, mv([0, -2], [0, -3]));
    expect(t.winner).toBe(LIGHT);
    expect(legalMoves(t)).toEqual([]);
  });
});

describe('records', () => {
  it('moves encode and decode; replay is deterministic and stops at an illegal move', () => {
    const s = newGame(77);
    const moves: number[] = [];
    while (!s.winner && moves.length < 30) {
      const ms = legalMoves(s);
      const m = ms[(moves.length * 7) % ms.length];
      moves.push(m);
      play(s, m);
    }
    const a = moves.map(encodeMove);
    expect(a.map(decodeMove)).toEqual(moves);
    expect(boardText(replay(77, a))).toBe(boardText(s));
    expect(replay(77, [...a.slice(0, 3), '0.0', ...a.slice(3)]).ply).toBe(3);
    expect(boardText(replay(77, a, DARK))).not.toBe(boardText(s));
  });

  it('a mirrored position plays the same game from the other side', () => {
    const s = newGame(3);
    for (let k = 0; k < 9; k++) play(s, legalMoves(s)[k % 3]);
    const t = mirrored(s);
    expect(t.turn).toBe(3 - s.turn);
    expect(legalMoves(t).length).toBe(legalMoves(s).length);
    const rec = decodeRecord(encodeRecord(recordOf(s.turn === LIGHT ? s : t, 2, s.turn !== LIGHT, s.first)));
    expect(boardText(stateOf(rec))).toBe(boardText(s.turn === LIGHT ? s : t));
    expect([...stateOf(rec).order]).toEqual([...(s.turn === LIGHT ? s : t).order]);
  });
});

describe('AI', () => {
  it('every level returns a legal move, the same one each time', () => {
    const s = newGame(11);
    for (let k = 0; k < 12; k++) play(s, legalMoves(s)[(k * 5) % legalMoves(s).length]);
    for (const level of ['easy', 'normal'] as const) {
      const a = chooseMove(s, level);
      expect(isLegal(s, a.move)).toBe(true);
      expect(chooseMove(s, level).move).toBe(a.move);
    }
  });

  it('a capped search stays within its node budget and finds a win in one', () => {
    const s = position([[0, -2], [1, 1]], [[0, -3], [2, 0], [-2, 1]]);
    s.lost[DARK] = TUNE.target - 1;
    const ch = search(s, 12, 4000);
    expect(ch.move).toBe(mv([0, -2], [0, -3]));
    expect(ch.nodes).toBeLessThan(4000 * 3);
  });

  it('the AI is discouraged from shoving straight back what was just shoved', () => {
    const s = newGame(2);
    const last = mv([0, -1], [0, 0]);
    // Their stone at (0,-1) shoved ours from (0,0) to (0,1): pushing back is (0,1) -> (0,0).
    expect(loopPenalty([last])(mv([0, 1], [0, 0]))).toBe(W.loop);
    expect(loopPenalty([last])(mv([1, 0], [1, -1]))).toBe(0);
    // Stepping your own last stone straight back costs half.
    expect(loopPenalty([mv([1, 1], [1, 0]), last])(mv([1, 0], [1, 1]))).toBe(W.loop / 2);
    void s;
  });

  it('the AI won’t recreate a stone layout it has just seen (shove-back cycles)', () => {
    // A cycle: whatever the AI would play here, pretend that layout already happened
    // a few plies ago; it must pick something else (in a quiet position the cost outweighs the gain).
    for (const level of ['normal', 'hard'] as const) {
      const s = newGame(2);
      for (let k = 0; k < 4; k++) play(s, chooseMove(s, 'easy').move);
      const m1 = chooseMove(s, level).move;
      const key = stoneKey(after(s, m1));
      const m2 = chooseMove(s, level, [], [key]).move;
      expect(isLegal(s, m2)).toBe(true);
      expect(stoneKey(after(s, m2))).not.toBe(key);
    }
    // The layout key ignores holes, so a cycle still repeats while tiles keep falling.
    const s = newGame(3);
    const k0 = stoneKey(s);
    const t = clone(s);
    t.cells[s.order[0]] = HOLE;
    expect(stoneKey(t)).toBe(k0);
  });

  it('AI games end in a sensible number of moves', () => {
    const s = newGame(21);
    while (!s.winner && s.ply < 200) play(s, chooseMove(s, 'easy').move);
    expect(s.winner).not.toBe(0);
    expect(s.ply).toBeGreaterThan(8);
    expect(s.ply).toBeLessThan(60);
  });
});

describe('puzzles', () => {
  it('each lesson has exactly one winning first move and no faster win', () => {
    for (const p of lessonPuzzles()) {
      const w = winningMoves(p.state, p.n);
      expect(w, p.id).toHaveLength(1);
      if (p.n > 1) expect(winningMoves(p.state, p.n - 1), p.id).toEqual([]);
    }
    expect(LESSONS.length).toBeGreaterThanOrEqual(5);
  });

  it('in a puzzle the defence tries to save the threatened stone (Brace)', () => {
    const p = lessonPuzzles().find((l) => l.id === 'brace')!;
    const s = after(p.state, winningMoves(p.state, 2)![0]);
    const reply = bestDefence(s, 1);
    expect(reply >> 6).toBe(cellAt(3, 0));
  });

  it('daily pool puzzles (a sample) are wins in exactly N with one winning first move', () => {
    expect(POOL.length).toBeGreaterThanOrEqual(365);
    for (let k = 0; k < POOL.length; k += 10) {
      const rec = decodeRecord(POOL[k]);
      const s = stateOf(rec);
      expect(s.turn).toBe(LIGHT);
      expect(winningMoves(s, rec.n), `pool ${k}`).toHaveLength(1);
      expect(winningMoves(s, rec.n - 1), `pool ${k}`).toEqual([]);
    }
  });

  it('the daily walks the pool by date', () => {
    const a = dailyPuzzle('2026-11-13');
    expect(a.id).toBe('daily-2026-11-13');
    expect(boardText(dailyPuzzle('2026-11-13').state)).toBe(boardText(a.state));
    expect(boardText(dailyPuzzle('2026-11-14').state)).not.toBe(boardText(a.state));
  });
});
