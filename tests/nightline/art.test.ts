import { describe, expect, it } from 'vitest';
import { FORK_SIGN, PLAYER_BOOST, PLAYER_CAR, PROPS, SKYLINES, TRAFFIC, type Art } from '../../src/nightline/art';
import { BIOMES, CAR_HIT_W, ROAD_HALF_COLS } from '../../src/nightline/core';

/** Each row's silhouette [left, right) in columns, relative to the art's centre (blitArt centres a piece on its column). */
const silhouette = (a: Art) =>
  a.rows.map((s) => {
    let last = s.length - 1;
    while (last > 0 && s[last] === ' ') last--;
    return [s.search(/\S/) - s.length / 2, last + 1 - s.length / 2];
  });

describe('nightline art', () => {
  it('every piece has rows of one width', () => {
    const all: Art[] = [PLAYER_CAR.straight, PLAYER_CAR.left, PLAYER_CAR.right, PLAYER_BOOST, FORK_SIGN, ...TRAFFIC, ...Object.values(PROPS), ...Object.values(SKYLINES)];
    for (const a of all) for (const row of a.rows) expect(row.length).toBe(a.rows[0].length);
    for (const b of BIOMES) expect(SKYLINES[b].rows[0].length).toBe(64);
  });

  it('CAR_HIT_W is where the player car and each traffic car touch on screen, side by side at 1:1', () => {
    const me = silhouette(PLAYER_CAR.straight);
    TRAFFIC.forEach((t, kind) => {
      const them = silhouette(t);
      let touch = 0;
      // Both stand on their last row; compare the rows they share from the bottom.
      for (let i = 1; i <= Math.min(me.length, them.length); i++) {
        const [a0, a1] = me[me.length - i];
        const [b0, b1] = them[them.length - i];
        touch = Math.max(touch, a1 - b0, b1 - a0);
      }
      expect(CAR_HIT_W[kind]).toBeCloseTo(touch / ROAD_HALF_COLS, 3);
    });
  });

  it('the player car keeps its width when steering or boosting', () => {
    for (const a of [PLAYER_CAR.left, PLAYER_CAR.right, PLAYER_BOOST]) {
      expect(a.rows[0].length).toBe(PLAYER_CAR.straight.rows[0].length);
      expect(a.rows.length).toBe(PLAYER_CAR.straight.rows.length);
    }
  });
});
