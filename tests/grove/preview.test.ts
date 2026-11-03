import { describe, expect, it } from 'vitest';
import { CELLS, cellAt, hex, key, mergeSpots, previewAction, type GameState, type Hex } from '../../src/grove/core';
import { blankState } from './helpers';

const seed = { kind: 'plant' as const, tier: 0 };
const sprout = { kind: 'plant' as const, tier: 1 };

describe('preview hints', () => {
  it('reports the size of the group a non-merging piece joins', () => {
    const s = blankState({ cells: [[hex(0, 0), seed]] });
    expect(previewAction(s, { type: 'place', at: hex(1, 0) }).group).toBe(2);
    expect(previewAction(s, { type: 'place', at: hex(3, 0) }).group).toBe(1);
    // A merge reports what it creates instead.
    const two = blankState({ cells: [[hex(0, 0), seed], [hex(1, 0), seed]] });
    const o = previewAction(two, { type: 'place', at: hex(-1, 0) });
    expect(o.creates).toEqual(sprout);
    expect(o.group).toBe(0);
    // Wisps and bolts have no group.
    expect(previewAction(blankState({ current: { kind: 'wisp' } }), { type: 'place', at: hex(0, 0) }).group).toBe(0);
  });

  it('mergeSpots lists exactly the empty hexes where the piece in hand merges', () => {
    const s = blankState({ cells: [[hex(0, 0), seed], [hex(1, 0), seed], [hex(-2, 0), sprout]] });
    const spots = mergeSpots(s).map(key).sort();
    const expected = emptyWhere(s, (h) => previewAction(s, { type: 'place', at: h }).creates !== null);
    expect(spots).toEqual(expected);
    expect(spots.length).toBeGreaterThan(0);
    expect(mergeSpots(blankState({ current: { kind: 'wisp' } }))).toEqual([]);
    expect(mergeSpots(blankState({ current: { kind: 'bolt' } }))).toEqual([]);
  });
});

function emptyWhere(s: GameState, f: (h: Hex) => boolean): string[] {
  return CELLS.filter((h) => cellAt(s, h) === null && f(h))
    .map(key)
    .sort();
}
