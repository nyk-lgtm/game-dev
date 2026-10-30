import { describe, expect, it } from 'vitest';
import {
  Rng,
  applyAction,
  distanceField,
  eq,
  generateFloor,
  key,
  legalActions,
  newRun,
  playerWalkable,
  type Action,
  type GameState,
} from '../src/core';

describe('level generation', () => {
  it('produces valid, deterministic floors', { timeout: 60_000 }, () => {
    for (let seed = 1; seed <= 150; seed++) {
      for (let depth = 1; depth <= 10; depth++) {
        const f = generateFloor(seed, depth);
        expect(generateFloor(seed, depth)).toEqual(f);
        const shell = { tiles: f.tiles } as GameState;
        const field = distanceField(shell, f.start, playerWalkable);
        expect(field.has(key(f.stairs))).toBe(true);
        expect(f.enemies.length).toBeGreaterThan(0);
        const seen = new Set<string>();
        for (const e of f.enemies) {
          expect(f.tiles[key(e.pos)]).toBe('floor');
          expect(seen.has(key(e.pos))).toBe(false);
          seen.add(key(e.pos));
          expect(field.has(key(e.pos))).toBe(true);
        }
        if (depth === 1) expect(f.enemies.every((e) => e.kind === 'brute')).toBe(true);
      }
    }
  });
});

function checkInvariants(s: GameState): void {
  const spots = new Set<string>([key(s.player.pos)]);
  expect(['floor', 'stairs']).toContain(s.tiles[key(s.player.pos)]);
  for (const e of s.enemies) {
    expect(e.hp).toBeGreaterThan(0);
    expect(s.tiles[key(e.pos)]).toBe('floor');
    expect(spots.has(key(e.pos))).toBe(false);
    spots.add(key(e.pos));
  }
  expect(s.player.hp).toBeGreaterThanOrEqual(0);
  expect(s.player.hp).toBeLessThanOrEqual(s.player.maxHp);
}

describe('fuzz', () => {
  it('random play never breaks invariants and replays deterministically', () => {
    for (let run = 0; run < 200; run++) {
      const rng = new Rng(run * 7919 + 1);
      let s = newRun(run + 1);
      const actions: Action[] = [];
      for (let i = 0; i < 300 && s.status === 'playing'; i++) {
        const acts = legalActions(s);
        // Bias toward the stairs so runs reach deeper floors.
        let a: Action = rng.pick(acts);
        if (acts[0].type !== 'wait' && rng.next() < 0.5) {
          const field = distanceField(s, s.stairs, playerWalkable);
          const moves = acts.filter((x): x is Extract<Action, { type: 'move' }> => x.type === 'move');
          moves.sort((x, y) => (field.get(key(x.to)) ?? 99) - (field.get(key(y.to)) ?? 99));
          if (moves.length) a = moves[0];
        }
        actions.push(a);
        s = applyAction(s, a).state;
        checkInvariants(s);
      }
      // Replay from the action log reproduces the exact state.
      let r = newRun(run + 1);
      for (const a of actions) r = applyAction(r, a).state;
      expect(r).toEqual(s);
      expect(eq(r.player.pos, s.player.pos)).toBe(true);
    }
  }, 60_000);
});
