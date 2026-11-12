import { describe, expect, it } from 'vitest';
import { DIRS8, WORLD, applyAction, newGame, pathTo, pathToward, type GameState } from '../../src/lantern/core';

const cheb = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

describe('tap to walk', () => {
  it('a tap on an unreachable cell heads as close as possible instead of refusing', () => {
    let s: GameState = newGame(1);
    const m = WORLD[s.player.map];
    // The far corner of the map: walls, or out of reach.
    const target = { x: m.w - 1, y: m.h - 1 };
    expect(pathTo(s, target)).toBeNull();
    const dirs = pathToward(s, target);
    expect(dirs).not.toBeNull();
    const start = cheb(s.player.pos, target);
    for (const dir of dirs!) s = applyAction(s, { type: 'step', dir }).state;
    expect(cheb(s.player.pos, target)).toBeLessThan(start);
    expect(DIRS8.length).toBe(8);
  });
});
