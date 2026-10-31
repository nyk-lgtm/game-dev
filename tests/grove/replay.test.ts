import { describe, expect, it } from 'vitest';
import {
  CELLS,
  Rng,
  applyAction,
  decodeAction,
  drawPiece,
  encodeAction,
  isLegal,
  newGame,
  previewAction,
  replay,
  type Action,
  type GameState,
} from '../../src/grove/core';
import { checkInvariants, randomAction } from './helpers';

describe('action codes', () => {
  it('round-trip for every cell and swap', () => {
    const codes = new Set<string>();
    for (const h of CELLS) {
      const a: Action = { type: 'place', at: h };
      const c = encodeAction(a);
      expect(c.length).toBe(1);
      codes.add(c);
      expect(decodeAction(c)).toEqual(a);
    }
    expect(codes.size).toBe(37);
    expect(encodeAction({ type: 'swap' })).toBe('~');
    expect(decodeAction('~')).toEqual({ type: 'swap' });
  });

  it('malformed codes throw', () => {
    for (const bad of ['', 'L', '1', ' ', 'ab', '!']) expect(() => decodeAction(bad)).toThrow();
    expect(() => replay(1, 'a1')).toThrow();
    expect(() => replay(1, 'a L')).toThrow();
  });

  it('replaying an illegal placement throws', () => {
    const seed = 3;
    expect(drawPiece(seed, 0).kind).not.toBe('bolt');
    const s = newGame(seed);
    const occupied = CELLS.find((h) => !isLegal(s, { type: 'place', at: h }))!;
    expect(() => replay(seed, encodeAction({ type: 'place', at: occupied }))).toThrow();
  });
});

function playRandom(seed: number, maxActions: number, rng: Rng): { final: GameState; codes: string } {
  let s = newGame(seed);
  let codes = '';
  for (let i = 0; i < maxActions; i++) {
    const a = randomAction(s, rng, 0.15);
    if (!a) break;
    codes += encodeAction(a);
    s = applyAction(s, a).state;
  }
  return { final: s, codes };
}

describe('replay', () => {
  it('empty action list is newGame', () => {
    expect(replay(9, '')).toEqual(newGame(9));
  });

  it('reproduces a game of mixed random legal actions', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { final, codes } = playRandom(seed, 60, new Rng(seed * 1000 + 7));
      expect(codes.length).toBeGreaterThan(10);
      expect(codes).toContain('~');
      expect(replay(seed, codes)).toEqual(final);
    }
  });

  it('a different seed gives a different game for the same codes', () => {
    const { codes } = playRandom(1, 20, new Rng(5));
    expect(replay(2, codes.slice(0, 1))).not.toEqual(replay(1, codes.slice(0, 1)));
  });
});

describe('fuzz', () => {
  it('30 random games keep every invariant and replay exactly', { timeout: 60_000 }, () => {
    for (let g = 0; g < 30; g++) {
      const seed = 5000 + g * 37;
      const rng = new Rng(seed ^ 0xabcdef);
      let s = newGame(seed);
      let codes = '';
      checkInvariants(s);
      for (let i = 0; i < 400 && s.status === 'playing'; i++) {
        const a = randomAction(s, rng, 0.08)!;
        expect(isLegal(s, a)).toBe(true);
        const prev = s;
        const o = previewAction(prev, a);
        const r = applyAction(prev, a);
        s = r.state;
        codes += encodeAction(a);
        expect(s.score).toBeGreaterThanOrEqual(prev.score);
        expect(o.points).toBe(s.score - prev.score);
        expect(o.trapped).toBe(r.events.filter((e) => e.type === 'wispTrapped').length);
        expect(s.bestTier).toBeGreaterThanOrEqual(prev.bestTier);
        if (a.type === 'swap') expect(s.turn).toBe(prev.turn);
        else expect(s.turn).toBe(prev.turn + 1);
        checkInvariants(s);
      }
      expect(replay(seed, codes)).toEqual(s);
    }
  });
});
