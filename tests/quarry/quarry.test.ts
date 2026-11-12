import { describe, expect, it } from 'vitest';
import {
  DEPTHS,
  Dict,
  H,
  N,
  NEIGHBORS,
  TARGETS,
  VALUES,
  W,
  act,
  adjacent,
  at,
  evaluate,
  findWords,
  fuseFriendly,
  isScore,
  newRun,
  pickLetter,
  replay,
  settle,
  type Run,
  type Tile,
} from '../../src/quarry/core';
import { PACKED } from '../../src/quarry/core/words';
import { Rng } from '../../src/shared/rng';
import { botAction } from '../../scripts/quarry/bot';

const dict = new Dict(PACKED);

/** A face of Z tiles (nothing to spell) except "tea" down the right edge, so a word always exists. */
function clean(r: Run): void {
  r.board = r.board.map((_, i) => ({ id: 5000 + i, ch: 'z' }));
  r.board[at(5, 4)] = { id: 6000, ch: 't' };
  r.board[at(5, 5)] = { id: 6001, ch: 'e' };
  r.board[at(5, 6)] = { id: 6002, ch: 'a' };
}

function playBot(seed: number, mode: 'best' | 'human' = 'human'): Run {
  const r = newRun(seed, dict);
  for (let guard = 0; r.phase !== 'over' && guard < 400; guard++) expect(act(r, botAction(r, dict, { mode }), dict)).not.toBeNull();
  expect(r.phase).toBe('over');
  return r;
}

describe('dictionary', () => {
  it('has the everyday words and the right size', () => {
    expect(dict.words.size).toBeGreaterThan(25000);
    expect(dict.words.size).toBeLessThan(45000);
    for (const w of ['cat', 'dog', 'stone', 'quarry', 'house', 'running', 'quiet', 'jumped', 'zebra', 'apples', 'colour', 'color', 'water', 'mineral'])
      expect(dict.has(w), w).toBe(true);
    for (const w of ['cat', 'stone', 'house', 'water']) expect(dict.common.has(w), w).toBe(true);
  });

  it('keeps out junk, names, abbreviations and offensive words', () => {
    for (const w of ['qi', 'za', 'aa', 'xu', 'ok', 'zzz', 'mph', 'hmm', 'nth', 'paris', 'london', 'zyzzyva', 'qintar', 'cwm', 'abcdefghi'])
      expect(dict.has(w), w).toBe(false);
    for (const w of ['fuck', 'shit', 'cunt', 'nigger', 'faggot', 'slut', 'whore', 'bitch', 'retard', 'rapist', 'dyke', 'coon', 'spic', 'kike', 'piss', 'twat'])
      expect(dict.has(w), w).toBe(false);
    // Innocent words that share letters with blocked ones stay.
    for (const w of ['spices', 'assess', 'spacing', 'cocktail', 'class', 'button', 'title', 'analysis'])
      expect(dict.has(w), w).toBe(true);
  });

  it('only 3-8 lowercase letters', () => {
    for (const w of dict.words) expect(/^[a-z]{3,8}$/.test(w), w).toBe(true);
    for (const w of dict.common) expect(dict.words.has(w)).toBe(true);
  });
});

describe('board', () => {
  it('neighbors are symmetric hex neighbors (2-6 each)', () => {
    for (let i = 0; i < N; i++) {
      expect(NEIGHBORS[i].length).toBeGreaterThanOrEqual(2);
      expect(NEIGHBORS[i].length).toBeLessThanOrEqual(6);
      for (const n of NEIGHBORS[i]) expect(NEIGHBORS[n]).toContain(i);
    }
    // An inner cell has six.
    expect(NEIGHBORS[at(2, 3)].length).toBe(6);
    // Even column: up-left/up-right are a row higher; odd column: down-left/down-right are a row lower.
    expect(adjacent(at(2, 3), at(1, 2))).toBe(true);
    expect(adjacent(at(3, 3), at(2, 4))).toBe(true);
    expect(adjacent(at(3, 3), at(2, 2))).toBe(false);
  });

  it('gravity drops tiles in their column and fills from the top, lowest gap first', () => {
    const board: (Tile | null)[] = Array.from({ length: N }, (_, i) => ({ id: i + 1, ch: 'a' }));
    // Clear two tiles in column 2 and one in column 4.
    board[at(2, 6)] = null;
    board[at(2, 3)] = null;
    board[at(4, 0)] = null;
    let id = 100;
    const order: number[] = [];
    settle(board, (_b, c) => (order.push(c), { id: id++, ch: 'n' }));
    const b = board as Tile[];
    expect(b.every(Boolean)).toBe(true);
    // Column 2: what was at rows 0-2, 4-5 sits at rows 2-6, in order.
    expect([2, 3, 4, 5, 6].map((r) => b[at(2, r)].id)).toEqual([at(2, 0), at(2, 1), at(2, 2), at(2, 4), at(2, 5)].map((i) => i + 1));
    expect(b[at(2, 1)].id).toBe(100);
    expect(b[at(2, 0)].id).toBe(101);
    expect(b[at(4, 0)].id).toBe(102);
    expect(order).toEqual([2, 2, 4]);
    // Untouched columns keep their tiles.
    expect(b[at(0, 0)].id).toBe(1);
  });

  it('the bag keeps the face playable: vowels, and few rare letters', () => {
    for (let s = 0; s < 40; s++) {
      const r = newRun(s, dict);
      const letters = r.board.filter((t) => !t.rock && t.ch !== '*');
      const vowels = letters.filter((t) => 'aeiou'.includes(t.ch)).length;
      expect(vowels / letters.length).toBeGreaterThan(0.28);
      expect(vowels / letters.length).toBeLessThan(0.56);
      for (const ch of 'jqxz') expect(letters.filter((t) => t.ch === ch).length).toBeLessThanOrEqual(1);
    }
    const g = new Rng(1);
    const empty: (Tile | null)[] = Array(N).fill(null);
    const seen = new Set<string>();
    for (let k = 0; k < 2000; k++) seen.add(pickLetter(empty, () => g.next()));
    expect(seen.size).toBe(26);
  });
});

describe('scoring', () => {
  it('sums letter values times the length bonus; gold doubles; Qu is two letters', () => {
    const r = newRun(1, dict);
    clean(r);
    r.board[at(0, 0)] = { id: 1, ch: 's' };
    r.board[at(0, 1)] = { id: 2, ch: 't' };
    r.board[at(0, 2)] = { id: 3, ch: 'o' };
    r.board[at(0, 3)] = { id: 4, ch: 'n' };
    r.board[at(0, 4)] = { id: 5, ch: 'e' };
    const path = [0, 1, 2, 3, 4].map((y) => at(0, y));
    const e = evaluate(r, path, dict);
    expect(isScore(e) && e.word).toBe('stone');
    expect(isScore(e) && e.points).toBe(5 * 3);
    r.board[at(0, 2)].gold = true;
    const g = evaluate(r, path, dict);
    expect(isScore(g) && g.points).toBe(5 * 3 * 2);
    // Qu: "quit" from three tiles is a 4-letter word.
    r.board[at(1, 0)] = { id: 6, ch: 'q' };
    r.board[at(1, 1)] = { id: 7, ch: 'i' };
    r.board[at(1, 2)] = { id: 8, ch: 't' };
    const q = evaluate(r, [at(1, 0), at(1, 1), at(1, 2)], dict);
    expect(isScore(q) && q.word).toBe('quit');
    expect(isScore(q) && q.points).toBe((VALUES.q + 1 + 1) * 2);
  });

  it('rejects short words, unknown words and broken paths', () => {
    const r = newRun(2, dict);
    clean(r);
    r.board[at(0, 0)] = { id: 1, ch: 'c' };
    r.board[at(0, 1)] = { id: 2, ch: 'a' };
    r.board[at(0, 2)] = { id: 3, ch: 't' };
    expect(evaluate(r, [at(0, 0), at(0, 1)], dict)).toEqual({ error: 'short' });
    expect(evaluate(r, [at(0, 2), at(0, 1), at(0, 0)], dict)).toEqual({ error: 'unknown' }); // "tac"
    expect(evaluate(r, [at(0, 0), at(0, 2), at(0, 1)], dict)).toEqual({ error: 'path' }); // not adjacent
    expect(evaluate(r, [at(0, 0), at(0, 1), at(0, 0)], dict)).toEqual({ error: 'path' }); // reused
    expect(act(r, `W${at(0, 2)}.${at(0, 1)}.${at(0, 0)}`, dict)).toBeNull();
    expect(r.actions).toEqual([]);
  });

  it('a blank takes a letter that makes a word and scores 0', () => {
    const r = newRun(3, dict);
    clean(r);
    r.board[at(0, 0)] = { id: 1, ch: 'c' };
    r.board[at(0, 1)] = { id: 2, ch: '*' };
    r.board[at(0, 2)] = { id: 3, ch: 't' };
    const e = evaluate(r, [at(0, 0), at(0, 1), at(0, 2)], dict);
    expect(isScore(e) && e.word).toBe('cat');
    expect(isScore(e) && e.points).toBe((VALUES.c + 0 + 1) * 1);
  });

  it('playing a word removes its tiles, cracks neighboring rocks, refills and counts down', () => {
    const r = newRun(4, dict);
    clean(r);
    r.board[at(0, 4)] = { id: 1, ch: 'c' };
    r.board[at(0, 5)] = { id: 2, ch: 'a' };
    r.board[at(0, 6)] = { id: 3, ch: 't' };
    r.board[at(1, 6)] = { id: 4, ch: '', rock: 1 };
    r.board[at(0, 3)] = { id: 5, ch: 'e' };
    const before = r.wordsLeft;
    const o = act(r, `W${at(0, 4)}.${at(0, 5)}.${at(0, 6)}`, dict)!;
    expect(o).not.toBeNull();
    expect(o.broken).toEqual([at(1, 6)]);
    expect(o.total).toBe(o.score!.points + 5);
    expect(r.wordsLeft).toBe(before - 1);
    expect(r.got).toBe(o.total);
    // The "e" above fell three rows to the bottom of column 0; the rock is gone.
    expect(r.board[at(0, 6)].id).toBe(5);
    expect(r.board.some((t) => t.id === 4)).toBe(false);
    expect(r.board.every((t) => t && typeof t.id === 'number')).toBe(true);
    expect(new Set(r.board.map((t) => t.id)).size).toBe(N);
  });

  it('a fuse that runs out blows and costs a word; using one blasts its neighbors', () => {
    const r = newRun(5, dict);
    clean(r);
    r.board[at(5, 0)] = { id: 9, ch: 'e', fuse: 1 };
    r.board[at(0, 4)] = { id: 1, ch: 'c' };
    r.board[at(0, 5)] = { id: 2, ch: 'a' };
    r.board[at(0, 6)] = { id: 3, ch: 't' };
    const left = r.wordsLeft;
    const o = act(r, `W${at(0, 4)}.${at(0, 5)}.${at(0, 6)}`, dict)!;
    expect(o.lostWords).toBe(1);
    expect(o.blown).toContain(at(5, 0));
    expect(r.wordsLeft).toBe(left - 2);

    const s = newRun(6, dict);
    clean(s);
    s.board[at(2, 2)] = { id: 1, ch: 'c' };
    s.board[at(2, 3)] = { id: 2, ch: 'a', fuse: 3 };
    s.board[at(2, 4)] = { id: 3, ch: 't' };
    const b = act(s, `W${at(2, 2)}.${at(2, 3)}.${at(2, 4)}`, dict)!;
    // The fuse's four other neighbors (z, worth 9 each) are blasted for double their value.
    expect(b.blasted!.sort((x, y) => x - y)).toEqual(NEIGHBORS[at(2, 3)].filter((n) => n !== at(2, 2) && n !== at(2, 4)).sort((x, y) => x - y));
    expect(b.blastPts).toBe(4 * VALUES.z * 2);
  });
});

describe('perks', () => {
  /** "stone" down column 0 (s t o n e: base 5), "jazz"-free board otherwise. */
  function stoneRun(perks: string[]): { r: Run; path: number[] } {
    const r = newRun(7, dict);
    clean(r);
    r.perks = perks as Run['perks'];
    [...'stone'].forEach((ch, y) => (r.board[at(0, y)] = { id: 1 + y, ch }));
    return { r, path: [0, 1, 2, 3, 4].map((y) => at(0, y)) };
  }

  it('word multipliers add up instead of multiplying', () => {
    const { r, path } = stoneRun(['first', 'echo']);
    r.board[at(0, 1)].gold = true;
    r.board[at(0, 3)].gold = true;
    // "stone" has no repeated letter: gold ×2 + gold + Opening Strike +2 = ×5, not 3·3.
    const e = evaluate(r, path, dict);
    expect(isScore(e) && e.factor).toBe(1 + 2 + 2);
    expect(isScore(e) && e.points).toBe(5 * 3 * 5);
    expect(isScore(e) && e.boosts).toEqual([['2 gold', 2], ['Opening Strike', 2]]);
  });

  it('Long Haul and Hot Seam add to the length bonus and are named', () => {
    const { r, path } = stoneRun(['long', 'streak']);
    r.streak = 1;
    const e = evaluate(r, path, dict);
    expect(isScore(e) && e.lenMult).toBe(3);
    expect(isScore(e) && e.adds).toEqual([['Long Haul', 1], ['Hot Seam', 2]]);
    expect(isScore(e) && e.points).toBe(5 * 6);
    r.streak = 9;
    const capped = evaluate(r, path, dict);
    expect(isScore(capped) && capped.adds[1]).toEqual(['Hot Seam', 3]);
  });

  it('Prospector, Echo and Chisel', () => {
    const r = newRun(8, dict);
    clean(r);
    r.perks = ['rare', 'echo', 'short'];
    // "jazz" is not on a straight line here; use "keep": k (5) is rare, e repeats, 4 letters.
    [...'keep'].forEach((ch, y) => (r.board[at(1, y)] = { id: 50 + y, ch }));
    const e = evaluate(r, [0, 1, 2, 3].map((y) => at(1, y)), dict);
    expect(isScore(e) && e.word).toBe('keep');
    expect(isScore(e) && e.boosts).toEqual([['Chisel', 2], ['Echo', 1], ['Prospector', 1]]);
    expect(isScore(e) && e.points).toBe((5 + 1 + 1 + 3) * 2 * 5);
  });

  it('a fuse never stays in a cramped spot when it drops in', () => {
    for (let s = 0; s < 30; s++) {
      const r = newRun(400 + s, dict);
      for (let k = 0; k < 120 && r.phase !== 'over'; k++) {
        if (r.phase === 'perk') {
          act(r, `P${r.offer[0]}`, dict);
          continue;
        }
        const ids = new Set(r.board.map((t) => t.id));
        act(r, botAction(r, dict, { mode: 'best' }), dict);
        r.board.forEach((t, i) => {
          if (!t.fuse || ids.has(t.id)) return;
          // A new fuse: room around it (4+ open neighbours) unless no tile anywhere had room.
          const open = NEIGHBORS[i].filter((n) => !r.board[n].rock).length;
          if (open < 4) expect(r.board.some((_, j) => fuseFriendly(r.board, j))).toBe(false);
        });
      }
    }
  });
});

describe('runs', () => {
  it('replays exactly from the seed and the actions', () => {
    for (const seed of [11, 12, 13]) {
      const r = playBot(seed);
      const again = replay(seed, r.actions, dict);
      expect(JSON.stringify(again)).toBe(JSON.stringify(r));
      // Partial replays match too.
      const half = r.actions.slice(0, Math.floor(r.actions.length / 2));
      const a = replay(seed, half, dict);
      const b = replay(seed, half, dict);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.actions).toEqual(half);
    }
  });

  it('different seeds deal different faces; the daily-style seed is stable', () => {
    const a = newRun(1, dict).board.map((t) => t.ch).join('');
    const b = newRun(2, dict).board.map((t) => t.ch).join('');
    expect(a).not.toBe(b);
    expect(newRun(1, dict).board.map((t) => t.ch).join('')).toBe(a);
  });

  it('clearing a depth offers three new perks; picking one starts the next depth', () => {
    const r = newRun(21, dict);
    r.got = r.target - 1;
    const f = findWords(r.board, dict, { limit: 1 })[0];
    const o = act(r, `W${f.path.join('.')}`, dict)!;
    expect(o.cleared).toBe(true);
    expect(r.log[0].score).toBeGreaterThanOrEqual(TARGETS[0]);
    expect(o.bonus).toBe(r.wordsLeft * 10);
    expect(r.phase).toBe('perk');
    expect(r.offer.length).toBe(3);
    expect(act(r, 'S', dict)).toBeNull();
    expect(act(r, `P${r.offer[0]}`, dict)).not.toBeNull();
    expect(r.phase).toBe('play');
    expect(r.depth).toBe(1);
    expect(r.got).toBe(0);
    expect(r.perks.length).toBe(1);
  });

  it('the best bot climbs out; the human bot gets somewhere; no exceptions', () => {
    let wins = 0;
    for (let s = 100; s < 104; s++) if (playBot(s, 'best').won) wins++;
    expect(wins).toBeGreaterThanOrEqual(3);
    const r = playBot(200, 'human');
    expect(r.log.length).toBeGreaterThanOrEqual(1);
    expect(r.score).toBeGreaterThan(0);
  });

  it('survives random play: random traces, shakes, picks and perks never throw or corrupt the face', () => {
    const g = new Rng(99);
    for (let s = 0; s < 12; s++) {
      const r = newRun(300 + s, dict);
      for (let k = 0; k < 400 && r.phase !== 'over'; k++) {
        let a: string;
        const roll = g.next();
        if (r.phase === 'perk') a = `P${g.pick(r.offer)}`;
        else if (roll < 0.05) a = 'S';
        else if (roll < 0.08) a = `X${g.int(0, N - 1)}`;
        else if (roll < 0.5) {
          const found = findWords(r.board, dict, { limit: 40 });
          a = `W${g.pick(found).path.join('.')}`;
        } else {
          // A random walk: almost always nonsense, which must be refused cleanly.
          const p = [g.int(0, N - 1)];
          for (let n = g.int(1, 7); n > 0; n--) p.push(g.pick(NEIGHBORS[p[p.length - 1]]));
          a = `W${p.join('.')}`;
        }
        act(r, a, dict);
        expect(r.board.length).toBe(W * H);
        expect(new Set(r.board.map((t) => t.id)).size).toBe(N);
        expect(r.wordsLeft).toBeGreaterThanOrEqual(0);
      }
      expect(r.depth).toBeLessThan(DEPTHS);
      expect(JSON.stringify(replay(300 + s, r.actions, dict))).toBe(JSON.stringify(r));
    }
  });
});
