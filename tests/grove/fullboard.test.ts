import { describe, expect, it } from 'vitest';
import { Rng, applyAction, emptyCells, newGame, type GameState } from '../../src/grove/core';
import { randomAction } from './helpers';

// The UI tells a player on a full board to use a Bolt (in hand or from the stash). That advice is
// only sound if the rules never leave a full board in play without one: check over random games.
describe('full board', () => {
  it('a full board still in play always has a Bolt in hand or in the stash', () => {
    let fullSeen = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rng = new Rng(seed * 7919);
      let s: GameState = newGame(seed);
      for (let i = 0; i < 2000 && s.status === 'playing'; i++) {
        if (emptyCells(s).length === 0) {
          fullSeen++;
          expect(s.current.kind === 'bolt' || s.stash?.kind === 'bolt').toBe(true);
        }
        const a = randomAction(s, rng, 0.15);
        if (!a) break;
        s = applyAction(s, a).state;
      }
      expect(s.status).toBe('over');
    }
    expect(fullSeen).toBeGreaterThan(0);
  });
});
