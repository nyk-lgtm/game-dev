import { describe, expect, it } from 'vitest';
import { DIRS8, WORLD, applyAction, newGame, pathTo, pathToward, planWalk, samePos, type GameState } from '../../src/lantern/core';

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

  it('a tap far down a dark tunnel keeps walking as the lantern shows the way, all the way there', () => {
    let s: GameState = newGame(1);
    s.player.map = 'cave2';
    s.player.pos = { x: 1, y: 14 };
    s.monsters = [];
    s = applyAction(s, { type: 'wait' }).state; // light up the start
    const target = { x: 28, y: 14 };
    const first = planWalk(s, target);
    expect(first?.direct).toBe(false); // the far end is still dark
    let steps = 0;
    for (; steps < 60 && !samePos(s.player.pos, target); steps++) {
      const plan = planWalk(s, target);
      if (!plan) break;
      s = applyAction(s, { type: 'step', dir: plan.dirs[0] }).state;
    }
    expect(s.player.pos).toEqual(target);
    expect(steps).toBe(27);
  });

  it('no plan when nothing known gets any closer', () => {
    let s: GameState = newGame(1);
    s.player.map = 'cave2';
    s.player.pos = { x: 28, y: 14 };
    s.monsters = [];
    s = applyAction(s, { type: 'wait' }).state;
    // Straight down through solid rock: the bottom wall is as close as it gets.
    expect(planWalk(s, { x: 28, y: 15 })).toBeNull();
  });
});
