import { describe, expect, it } from 'vitest';
import { SETTLED_BONUS, SETTLE_AFTER, apply, census, newGame, seasonPoints, type GameState } from '../../src/rewild/core';
import { run } from '../../scripts/rewild/bot';

describe('settled species', () => {
  it('nobody is settled before season 4; the bonus is exactly settled × bonus', () => {
    for (const seed of [3, 11]) {
      const { s } = run(seed, 'random');
      s.log.forEach((l, k) => {
        if (k < SETTLE_AFTER - 1) expect(l.settled).toBe(0);
        expect(l.settled).toBeLessThanOrEqual(l.species);
      });
      expect(s.log.some((l) => l.settled > 0)).toBe(true);
    }
  });

  it('streaks count seasons alive in a row and restart after dying out', () => {
    const s: GameState = newGame(5);
    // Season 1: plant whatever is playable, then end seasons with nothing more.
    for (let k = 0; k < 6; k++) {
      const before = { ...s.stats.streak };
      const ev = apply(s, { type: 'end' });
      expect(ev).not.toBeNull();
      const alive = census(s.cells).species;
      for (const id of alive) expect(s.stats.streak[id]).toBe((before[id] ?? 0) + 1);
      for (const id of Object.keys(s.stats.streak)) expect(alive.has(id as never)).toBe(true);
      const last = s.log[s.log.length - 1];
      const settled = Object.values(s.stats.streak).filter((n) => n! >= SETTLE_AFTER).length;
      expect(last.settled).toBe(settled);
      expect(last.points).toBe(seasonPoints(s.cells) + settled * SETTLED_BONUS);
    }
  });
});
