import { describe, expect, it } from 'vitest';
import { replay } from '../../src/delve/core';
import { playDescent } from '../../scripts/delve/bot';

describe('descent bot', () => {
  it(
    'its action string replays exactly, and some of 20 seeds reach depth 6',
    () => {
      let deep = 0;
      for (let seed = 1; seed <= 20; seed++) {
        // Played only until it reaches depth 6 (the whole run would take ~3x longer on CI).
        const r = playDescent(seed, 8000, 6);
        if (r.state.depth >= 6) deep++;
        expect(replay(seed, r.actions), `seed ${seed}`).toEqual(r.state);
      }
      expect(deep).toBeGreaterThanOrEqual(5);
    },
    120_000,
  );

  it('is deterministic', () => {
    expect(playDescent(3, 600).actions).toBe(playDescent(3, 600).actions);
  });
});
