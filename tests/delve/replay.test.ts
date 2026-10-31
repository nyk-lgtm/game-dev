import { describe, expect, it } from 'vitest';
import { applyAction, decodeAction, encodeAction, isLegal, newGame, replay, type Action } from '../../src/delve/core';

const ALL: Action[] = [
  { type: 'forward' },
  { type: 'back' },
  { type: 'left' },
  { type: 'right' },
  { type: 'strafeL' },
  { type: 'strafeR' },
  { type: 'use' },
  { type: 'wait' },
  { type: 'potion' },
  { type: 'ether' },
  { type: 'cast', spell: 'fire' },
  { type: 'cast', spell: 'frost' },
  { type: 'cast', spell: 'heal' },
  { type: 'cast', spell: 'blink' },
];

describe('replay codes', () => {
  it('every action round-trips through a distinct one-character code', () => {
    const codes = ALL.map(encodeAction);
    expect(new Set(codes).size).toBe(ALL.length);
    for (const c of codes) expect(c.length).toBe(1);
    for (const a of ALL) expect(decodeAction(encodeAction(a))).toEqual(a);
  });

  it('malformed codes throw', () => {
    for (const bad of ['x', '', 'ff', ' ', 'Z', '1']) expect(() => decodeAction(bad)).toThrow();
    expect(() => replay(1, 'ffx')).toThrow();
    // An illegal action in the string (a potion at full health) throws too.
    expect(() => replay(1, 'p')).toThrow();
  });

  it('replaying an action string reproduces the stepped state exactly', () => {
    const seed = 4242;
    let s = newGame(seed);
    let code = '';
    // A wandering, deterministic sequence of legal actions.
    const pattern = 'ffrffflfffwffrffuflfFfff';
    for (let i = 0; i < 300 && s.status === 'playing'; i++) {
      const a = decodeAction(pattern[i % pattern.length]);
      if (!isLegal(s, a)) continue;
      s = applyAction(s, a).state;
      code += encodeAction(a);
    }
    expect(code.length).toBeGreaterThan(100);
    expect(replay(seed, code)).toEqual(s);
    expect(replay(seed, '')).toEqual(newGame(seed));
  });
});
