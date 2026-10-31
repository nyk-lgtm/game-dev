import { describe, expect, it } from 'vitest';
import {
  DIRS,
  add,
  applyAction,
  axialToOffset,
  distance,
  eq,
  fromPixel,
  hex,
  isLegal,
  key,
  legalMoves,
  lineDir,
  newRun,
  offsetToAxial,
  previewAction,
  toPixel,
  PLAYER_ID,
  replay,
  threats,
} from '../../src/telegraph/core';
import { addEnemy, blankState } from './helpers';

const P = hex(3, 3);
const move = (to: { q: number; r: number }) => ({ type: 'move' as const, to });

describe('hex math', () => {
  it('distance and lines', () => {
    expect(distance(hex(0, 0), hex(2, -1))).toBe(2);
    expect(lineDir(hex(0, 0), hex(0, 3))).toBe(2);
    expect(lineDir(hex(0, 0), hex(2, -1))).toBe(-1);
    expect(lineDir(hex(1, 1), hex(1, 1))).toBe(-1);
  });
  it('offset and pixel round trips', () => {
    for (let col = 0; col < 7; col++)
      for (let row = 0; row < 9; row++) {
        const h = offsetToAxial(col, row);
        expect(axialToOffset(h)).toEqual({ col, row });
        const px = toPixel(h, 30);
        expect(fromPixel(px.x + 5, px.y - 7, 30)).toEqual(h);
      }
  });
});

describe('player attacks', () => {
  it('lunge kills an enemy straight ahead', () => {
    const s = blankState(P);
    const b = addEnemy(s, 'brute', add(P, add(DIRS[5], DIRS[5])));
    const { state, events } = applyAction(s, move(add(P, DIRS[5])));
    expect(state.enemies.find((e) => e.id === b.id)).toBeUndefined();
    expect(events).toContainEqual({ type: 'attack', kind: 'lunge', by: PLAYER_ID, target: b.id });
    expect(state.player.hp).toBe(3);
    expect(state.kills).toBe(1);
  });

  it('stab wounds but does not daze: the brute smashes back', () => {
    const s = blankState(P);
    const b = addEnemy(s, 'brute', add(P, DIRS[0]));
    const { state } = applyAction(s, move(add(P, DIRS[5])));
    expect(state.enemies.find((e) => e.id === b.id)!.hp).toBe(1);
    expect(state.player.hp).toBe(2);
  });
});

describe('brute', () => {
  it('smashes when you end next to it', () => {
    const s = blankState(P);
    addEnemy(s, 'brute', hex(5, 2));
    const { state } = applyAction(s, move(add(P, DIRS[1])));
    expect(state.player.hp).toBe(2);
  });

  it('walks toward you otherwise', () => {
    const s = blankState(offsetToAxial(3, 8));
    const b = addEnemy(s, 'brute', offsetToAxial(3, 1));
    const d0 = distance(b.pos, s.player.pos);
    const { state } = applyAction(s, move(legalMoves(s)[0]));
    expect(distance(state.enemies[0].pos, state.player.pos)).toBeLessThan(d0 + 1);
    expect(eq(state.enemies[0].pos, b.pos)).toBe(false);
  });
});

describe('archer', () => {
  it('aims when it has a clear line, then fires next turn', () => {
    const s = blankState(hex(3, 4));
    addEnemy(s, 'archer', hex(3, 0));
    // Step sideways out of the line? No: step along the line (toward the archer is a lunge
    // only if adjacent, it is not). Moving to (3,5) keeps us in line.
    const s1 = applyAction(s, move(hex(3, 5))).state;
    expect(s1.enemies[0].aim).toBe(2);
    const s2 = applyAction(s1, move(hex(3, 6))).state;
    // Range 5 from (3,0) reaches (3,5); we're at (3,6), out of range.
    expect(s2.player.hp).toBe(3);
    expect(s2.enemies[0].aim).toBeNull();
    expect(s2.enemies[0].reload).toBe(1); // fired, so it skips aiming next turn
  });

  it('arrow hits the player standing in the line', () => {
    const s = blankState(hex(3, 3));
    addEnemy(s, 'archer', hex(3, 0), { aim: 2 });
    const s1 = applyAction(s, move(hex(3, 4))).state;
    expect(s1.player.hp).toBe(2);
  });

  it('friendly fire: arrow hits the first enemy in the line', () => {
    const s = blankState(hex(3, 5));
    addEnemy(s, 'archer', hex(3, 0), { aim: 2 });
    const brute = addEnemy(s, 'brute', hex(3, 2));
    const { state, events } = applyAction(s, move(hex(3, 4)));
    expect(events).toContainEqual({ type: 'shot', by: 1, path: [hex(3, 1), hex(3, 2)], hit: brute.id });
    expect(state.player.hp).toBe(3);
    expect(state.enemies.find((e) => e.id === brute.id)!.hp).toBe(1);
  });

  it('walls block shots, lava does not', () => {
    const walled = blankState(hex(3, 3), { tiles: [[hex(3, 2), 'wall']] });
    addEnemy(walled, 'archer', hex(3, 0), { aim: 2 });
    expect(applyAction(walled, move(hex(3, 4))).state.player.hp).toBe(3);

    const lava = blankState(hex(3, 3), { tiles: [[hex(3, 2), 'lava']] });
    addEnemy(lava, 'archer', hex(3, 0), { aim: 2 });
    expect(applyAction(lava, move(hex(3, 4))).state.player.hp).toBe(2);
  });
});

describe('turn rules', () => {
  it('applyAction is pure', () => {
    const s = newRun(42);
    const snapshot = JSON.stringify(s);
    applyAction(s, move(legalMoves(s)[0]));
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('wait is only legal with no moves', () => {
    const s = blankState(P);
    expect(isLegal(s, { type: 'wait' })).toBe(false);
    for (const d of DIRS) s.tiles[key(add(P, d))] = 'wall';
    expect(legalMoves(s)).toHaveLength(0);
    expect(isLegal(s, { type: 'wait' })).toBe(true);
  });

  it('stairs descend; clearing the floor heals', () => {
    const s = blankState(hex(0, 1), { hp: 2 });
    const { state, events } = applyAction(s, move(hex(0, 0)));
    expect(state.depth).toBe(2);
    expect(state.player.hp).toBe(3);
    expect(events.at(-1)).toEqual({ type: 'descend', depth: 2, healed: true });
  });

  it('preview matches the real outcome', () => {
    const s = blankState(P);
    addEnemy(s, 'brute', hex(5, 2));
    expect(previewAction(s, move(add(P, DIRS[1])))).toMatchObject({ damageTaken: 1, kills: [] });
  });

  it('dying ends the run', () => {
    const s = blankState(P, { hp: 1 });
    addEnemy(s, 'brute', hex(5, 2));
    const { state } = applyAction(s, move(add(P, DIRS[1])));
    expect(state.status).toBe('dead');
    expect(isLegal(state, { type: 'wait' })).toBe(false);
  });
});

describe('review fixes', () => {
  it('preview reports the heal when the move clears the floor and descends', () => {
    // Last enemy sits next to both the player and the stairs; stepping onto the stairs stabs it.
    const s = blankState(hex(0, 1), { hp: 2 });
    addEnemy(s, 'archer', hex(1, 0));
    expect(previewAction(s, move(hex(0, 0)))).toMatchObject({ descends: true, healed: true });
  });

  it('archer cannot aim on the turn right after firing', () => {
    const s = blankState(hex(3, 3));
    addEnemy(s, 'archer', hex(3, 0), { aim: 2 });
    const s1 = applyAction(s, move(hex(3, 4))).state; // shot fires, hits us
    expect(s1.enemies[0].aim).toBeNull();
    const s2 = applyAction(s1, move(hex(3, 5))).state; // still in line, but reloading
    expect(s2.enemies[0].aim).toBeNull();
  });

  it('shot danger zone stops at the first enemy in the line', () => {
    const s = blankState(hex(5, 3));
    addEnemy(s, 'archer', hex(3, 0), { aim: 2 });
    addEnemy(s, 'brute', hex(3, 2));
    expect(threats(s).lines[0].path).toEqual([hex(3, 1), hex(3, 2)]);
  });

  it('rejects malformed action codes', () => {
    expect(() => replay(1, '5 5')).toThrow();
  });
});
