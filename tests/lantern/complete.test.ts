import { describe, expect, it } from 'vitest';
import { replay } from '../../src/lantern/core';
import { playCompletion } from '../../scripts/lantern/bot';

describe('completion bot', () => {
  it(
    'finishes the story on at least 9 of 10 seeds, and its action string replays exactly',
    () => {
      let won = 0;
      for (let seed = 1; seed <= 10; seed++) {
        const r = playCompletion(seed, 6000);
        expect(r.actions.length).toBeLessThanOrEqual(6000);
        if (r.state.quest === 'won') {
          won++;
          expect(r.king, `seed ${seed}`).not.toBeNull();
        }
        expect(replay(seed, r.actions)).toEqual(r.state);
      }
      expect(won).toBeGreaterThanOrEqual(9);
    },
    120_000,
  );
});
