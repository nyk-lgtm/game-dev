import { describe, expect, it } from 'vitest';
import {
  CELLS,
  DIRS,
  POINTS,
  add,
  applyAction,
  cellAt,
  drawPiece,
  emptyCells,
  groupAt,
  hex,
  isLegal,
  key,
  newGame,
  nameOf,
  previewAction,
  wispPlan,
  wispPos,
  type Hex,
} from '../../src/grove/core';
import {
  addWisp,
  bestEmptyNeighbor,
  blankState,
  checkInvariants,
  fillMonoliths,
  place,
  plant,
  seedWhereDraw,
  stone,
  swap,
} from './helpers';

const C = hex(0, 0);
const at = (i: number, from: Hex = C) => add(from, DIRS[i]);

describe('board and naming', () => {
  it('has 37 cells and tier names', () => {
    expect(CELLS.length).toBe(37);
    expect(new Set(CELLS.map(key)).size).toBe(37);
    expect(nameOf('plant', 5)).toBe('Spirit Tree');
    expect(nameOf('stone', 2)).toBe('Monolith');
  });
});

describe('newGame', () => {
  it('has 37 empty-or-filled cells, no wisps, and is playing', () => {
    const s = newGame(7);
    expect(Object.keys(s.board).length).toBe(37);
    expect(s.wisps).toEqual([]);
    expect(s.status).toBe('playing');
    expect(s.turn).toBe(0);
    expect(s.score).toBe(0);
    expect(s.current).toEqual(drawPiece(7, 0));
    expect(s.draws).toBe(1);
  });

  it('is deterministic per seed and differs between seeds', () => {
    expect(newGame(42)).toEqual(newGame(42));
    const boards = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) boards.add(JSON.stringify(newGame(seed).board));
    expect(boards.size).toBeGreaterThan(10);
  });

  it('starting pieces never already form a group of 3+', () => {
    for (let seed = 0; seed < 300; seed++) {
      const s = newGame(seed);
      let pieces = 0;
      for (const h of CELLS) {
        const c = cellAt(s, h);
        if (!c) continue;
        pieces++;
        expect(c.kind).not.toBe('wisp');
        if (c.kind !== 'wisp') expect(groupAt(s, h, c.kind, c.tier).length).toBeLessThan(3);
      }
      expect(pieces).toBeGreaterThan(0);
      expect(pieces).toBeLessThanOrEqual(6);
    }
  });
});

describe('placing plants', () => {
  it('needs an empty hex; swap is always legal while playing', () => {
    const s = blankState({ cells: [[C, plant(0)]] });
    expect(isLegal(s, place(C))).toBe(false);
    expect(() => applyAction(s, place(C))).toThrow();
    expect(isLegal(s, place(at(0)))).toBe(true);
    expect(isLegal(s, place(hex(4, 0)))).toBe(false);
    expect(isLegal(s, swap)).toBe(true);
  });

  it('adds POINTS.plant[tier] and uses a turn', () => {
    for (const tier of [0, 1, 2]) {
      const s = blankState({ current: { kind: 'plant', tier } });
      const r = applyAction(s, place(C));
      expect(r.state.score).toBe(POINTS.plant[tier]);
      expect(r.state.turn).toBe(1);
      expect(cellAt(r.state, C)).toEqual(plant(tier));
      expect(r.state.draws).toBe(s.draws + 1);
      expect(r.state.current).toEqual(drawPiece(s.seed, s.draws));
    }
  });

  it('does not mutate the previous state', () => {
    const s = blankState();
    const copy = structuredClone(s);
    applyAction(s, place(C));
    expect(s).toEqual(copy);
  });

  it('three connected identical pieces merge into tier+1 at the placed hex', () => {
    const s = blankState({ cells: [[at(0), plant(0)], [at(2), plant(0)]] });
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(plant(1));
    expect(cellAt(r.state, at(0))).toBeNull();
    expect(cellAt(r.state, at(2))).toBeNull();
    expect(r.state.score).toBe(POINTS.plant[0] + POINTS.plant[1]);
    expect(r.state.bestTier).toBe(1);
    expect(r.events).toContainEqual({
      type: 'merge', at: C, from: expect.arrayContaining([at(0), at(2)]), kind: 'plant', tier: 1, points: POINTS.plant[1],
    });
  });

  it('connectivity is transitive (a line of pieces touching only through the placed hex)', () => {
    // seeds at (1,0) and (-1,0)... not adjacent to each other, but both touch C.
    const s = blankState({ cells: [[hex(1, 0), plant(0)], [hex(-1, 0), plant(0)]] });
    expect(cellAt(applyAction(s, place(C)).state, C)).toEqual(plant(1));
    // chain via a middle piece: placed at end of an L-shaped path of three
    const t = blankState({ cells: [[hex(1, 0), plant(0)], [hex(2, 0), plant(0)]] });
    const r = applyAction(t, place(C));
    expect(cellAt(r.state, C)).toEqual(plant(1));
    expect(cellAt(r.state, hex(2, 0))).toBeNull();
  });

  it('two touching pieces do not merge', () => {
    const s = blankState({ cells: [[at(0), plant(0)]] });
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(plant(0));
    expect(cellAt(r.state, at(0))).toEqual(plant(0));
    expect(r.state.score).toBe(5);
  });

  it('non-adjacent identical pieces do not merge', () => {
    const s = blankState({ cells: [[hex(2, 0), plant(0)], [hex(-2, 0), plant(0)]] });
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(plant(0));
  });

  it('chains: seed next to 2 seeds makes a sprout next to 2 sprouts, then a bush', () => {
    const s = blankState({
      cells: [[at(0), plant(0)], [at(1), plant(0)], [at(3), plant(1)], [at(4), plant(1)]],
    });
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(plant(2));
    for (const i of [0, 1, 3, 4]) expect(cellAt(r.state, at(i))).toBeNull();
    expect(r.state.score).toBe(POINTS.plant[0] + POINTS.plant[1] + POINTS.plant[2]);
    expect(r.state.bestTier).toBe(2);
    expect(r.events.filter((e) => e.type === 'merge').map((e) => (e as { tier: number }).tier)).toEqual([1, 2]);
  });

  it('group of 3 scores points*1, group of 4 scores round(points*3/2), group of 5 scores points*2', () => {
    const base = POINTS.plant[0];
    const three = applyAction(blankState({ cells: [[at(0), plant(0)], [at(1), plant(0)]] }), place(C));
    expect(three.state.score).toBe(base + POINTS.plant[1]);
    const four = applyAction(blankState({ cells: [[at(0), plant(0)], [at(1), plant(0)], [at(2), plant(0)]] }), place(C));
    expect(four.state.score).toBe(base + Math.round((POINTS.plant[1] * 3) / 2));
    expect(four.state.score).toBe(5 + 30);
    const five = applyAction(
      blankState({ cells: [0, 1, 2, 3].map((i) => [at(i), plant(0)] as [Hex, ReturnType<typeof plant>]) }),
      place(C),
    );
    expect(five.state.score).toBe(base + POINTS.plant[1] * 2);
    // a bigger tier: group of 4 sprouts -> bush worth 100*1.5
    const sprouts = applyAction(blankState({ current: { kind: 'plant', tier: 1 }, cells: [0, 1, 2].map((i) => [at(i), plant(1)] as [Hex, ReturnType<typeof plant>]) }), place(C));
    expect(sprouts.state.score).toBe(POINTS.plant[1] + 150);
    expect(cellAt(sprouts.state, C)).toEqual(plant(2));
  });

  it('every cell of the group is emptied, not just the neighbours of the placed hex', () => {
    const s = blankState({ cells: [[at(0), plant(0)], [at(0, at(0)), plant(0)], [at(1, at(0)), plant(0)]] });
    // placed at C touches only at(0); group = C, at(0), and its two seed neighbours = 4
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(plant(1));
    expect(CELLS.filter((h) => cellAt(r.state, h) !== null).length).toBe(1);
  });

  it('different tiers and families do not merge', () => {
    const tiers = blankState({ cells: [[at(0), plant(0)], [at(1), plant(1)], [at(2), plant(2)]] });
    const a = applyAction(tiers, place(C));
    expect(cellAt(a.state, C)).toEqual(plant(0));
    expect(CELLS.filter((h) => cellAt(a.state, h) !== null).length).toBe(4);
    const fam = blankState({ cells: [[at(0), stone(0)], [at(1), stone(0)]] });
    const b = applyAction(fam, place(C));
    expect(cellAt(b.state, C)).toEqual(plant(0));
    expect(cellAt(b.state, at(0))).toEqual(stone(0));
  });

  it('max tier never merges further', () => {
    const s = blankState({ current: { kind: 'plant', tier: 5 }, cells: [[at(0), plant(5)], [at(1), plant(5)]] });
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(plant(5));
    expect(cellAt(r.state, at(0))).toEqual(plant(5));
    expect(cellAt(r.state, at(1))).toEqual(plant(5));
    expect(r.state.score).toBe(5000);
    expect(r.events.some((e) => e.type === 'merge')).toBe(false);
  });

  it('merging into the max plant tier works, and the result stays put', () => {
    const s = blankState({ current: { kind: 'plant', tier: 4 }, cells: [[at(0), plant(4)], [at(1), plant(4)]] });
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(plant(5));
    expect(r.state.bestTier).toBe(5);
    expect(r.state.score).toBe(POINTS.plant[4] + POINTS.plant[5]);
  });

  it('stone merges: stones -> cairn -> monolith, monolith is final', () => {
    // via crystal: crystal next to 2 stones becomes the tier that merges
    const s = blankState({ current: { kind: 'crystal' }, cells: [[at(0), stone(0)], [at(1), stone(0)]] });
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(stone(1));
    expect(r.state.score).toBe(POINTS.stone[1]);
    const t = blankState({ current: { kind: 'crystal' }, cells: [[at(0), stone(1)], [at(1), stone(1)]] });
    const r2 = applyAction(t, place(C));
    expect(cellAt(r2.state, C)).toEqual(stone(2));
    expect(r2.state.score).toBe(POINTS.stone[2]);
    expect(r2.state.bestTier).toBe(0); // stones don't count toward bestTier
  });
});

describe('crystal', () => {
  it('becomes a tier-0 stone when nothing merges', () => {
    const s = blankState({ current: { kind: 'crystal' }, cells: [[at(0), plant(0)]] });
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(stone(0));
    expect(r.state.score).toBe(0);
    expect(r.events).toContainEqual({ type: 'crystal', at: C, became: { kind: 'stone', tier: 0 } });
  });

  it('becomes the merging plant when only a plant merge is possible', () => {
    const s = blankState({ current: { kind: 'crystal' }, cells: [[at(0), plant(1)], [at(1), plant(1)]] });
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(plant(2));
    expect(r.state.score).toBe(POINTS.plant[2]);
  });

  it('prefers the higher-scoring merge when both a plant and a stone merge are possible', () => {
    // stone merge (cairn, 250) beats plant merge (sprout, 20)
    const a = blankState({
      current: { kind: 'crystal' },
      cells: [[at(0), plant(0)], [at(1), plant(0)], [at(3), stone(0)], [at(4), stone(0)]],
    });
    const ra = applyAction(a, place(C));
    expect(cellAt(ra.state, C)).toEqual(stone(1));
    expect(ra.state.score).toBe(250);
    expect(cellAt(ra.state, at(0))).toEqual(plant(0)); // untouched
    // plant merge (tree, 500) beats stone merge (cairn, 250)
    const b = blankState({
      current: { kind: 'crystal' },
      cells: [[at(0), plant(2)], [at(1), plant(2)], [at(3), stone(0)], [at(4), stone(0)]],
    });
    const rb = applyAction(b, place(C));
    expect(cellAt(rb.state, C)).toEqual(plant(3));
    expect(rb.state.score).toBe(500);
    expect(cellAt(rb.state, at(3))).toEqual(stone(0));
  });

  it('cannot merge into a maxed tier: next to monoliths it is just a stone', () => {
    const s = blankState({ current: { kind: 'crystal' }, cells: [[at(0), stone(2)], [at(1), stone(2)]] });
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(stone(0));
    expect(cellAt(r.state, at(0))).toEqual(stone(2));
    expect(r.state.score).toBe(0);
  });

  it('counts chained merges when choosing', () => {
    // plant tier 0 at C -> sprout, which then chains with two sprouts into a bush (20+100) vs stone cairn (250)
    const s = blankState({
      current: { kind: 'crystal' },
      cells: [[at(0), plant(0)], [at(1), plant(0)], [at(3), plant(1)], [at(4), plant(1)], [at(5), stone(0)], [at(2), stone(0)]],
    });
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(stone(1)); // 250 > 120
    const t = blankState({
      current: { kind: 'crystal' },
      cells: [[at(0), plant(0)], [at(1), plant(0)], [at(3), plant(1)], [at(4), plant(1)]],
    });
    expect(cellAt(applyAction(t, place(C)).state, C)).toEqual(plant(2));
  });
});

describe('bolt', () => {
  it('clears a plant or a stone', () => {
    for (const c of [plant(3), stone(1)]) {
      const s = blankState({ current: { kind: 'bolt' }, cells: [[C, c]] });
      expect(isLegal(s, place(C))).toBe(true);
      const r = applyAction(s, place(C));
      expect(cellAt(r.state, C)).toBeNull();
      expect(r.state.score).toBe(0);
      expect(r.state.turn).toBe(1);
      expect(r.events).toContainEqual({ type: 'bolt', at: C, hit: c });
    }
  });

  it('on a wisp removes the wisp and leaves a stone', () => {
    const s = blankState({ current: { kind: 'bolt' } });
    addWisp(s, C);
    const r = applyAction(s, place(C));
    expect(r.state.wisps).toEqual([]);
    expect(cellAt(r.state, C)).toEqual(stone(0));
  });

  it('the stone left by a bolted wisp merges with 2 adjacent stones', () => {
    const s = blankState({ current: { kind: 'bolt' }, cells: [[at(0), stone(0)], [at(2), stone(0)]] });
    addWisp(s, C);
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual(stone(1));
    expect(cellAt(r.state, at(0))).toBeNull();
    expect(cellAt(r.state, at(2))).toBeNull();
    expect(r.state.score).toBe(POINTS.stone[1]);
    expect(r.state.wisps).toEqual([]);
  });

  it('on an empty hex it fizzles: legal, nothing changes but turn and draw', () => {
    const s = blankState({ current: { kind: 'bolt' }, cells: [[at(0), plant(2)]] });
    expect(isLegal(s, place(C))).toBe(true);
    const r = applyAction(s, place(C));
    expect(r.state.board).toEqual(s.board);
    expect(r.state.score).toBe(s.score);
    expect(r.state.turn).toBe(1);
    expect(r.state.draws).toBe(s.draws + 1);
    expect(r.state.current).toEqual(drawPiece(s.seed, s.draws));
  });

  it('is not legal off the board', () => {
    expect(isLegal(blankState({ current: { kind: 'bolt' } }), place(hex(4, 0)))).toBe(false);
  });
});

describe('wisps', () => {
  const wispHand = { kind: 'wisp' } as const;

  it('placing one puts it on the board and it does not move that turn', () => {
    const s = blankState({ current: wispHand });
    const r = applyAction(s, place(C));
    expect(cellAt(r.state, C)).toEqual({ kind: 'wisp', id: 1 });
    expect(r.state.wisps.length).toBe(1);
    expect(r.state.nextWispId).toBe(2);
    expect(r.events.some((e) => e.type === 'wispMove')).toBe(false);
    expect(r.state.score).toBe(0);
    // its plan is shown: all neighbours tie on room, so the first DIRS index wins
    expect(r.state.wisps[0].plan).toEqual(DIRS[0]);
    expect(r.state.wisps[0].plan).toEqual(wispPlan(r.state, C));
  });

  it('a newly placed wisp waits while an older wisp moves', () => {
    const s = blankState({ current: wispHand });
    addWisp(s, hex(-2, 0), hex(-1, 0));
    const r = applyAction(s, place(hex(2, 0)));
    expect(cellAt(r.state, hex(-1, 0))).toEqual({ kind: 'wisp', id: 1 });
    expect(cellAt(r.state, hex(2, 0))).toEqual({ kind: 'wisp', id: 2 });
    expect(r.events.filter((e) => e.type === 'wispMove')).toEqual([{ type: 'wispMove', id: 1, from: hex(-2, 0), to: hex(-1, 0) }]);
  });

  it('steps to its plan on the next turn, then re-plans', () => {
    const s = blankState({ current: { kind: 'plant', tier: 0 } });
    addWisp(s, C, at(1));
    const r = applyAction(s, place(hex(-3, 0)));
    expect(cellAt(r.state, C)).toBeNull();
    expect(cellAt(r.state, at(1))).toEqual({ kind: 'wisp', id: 1 });
    expect(wispPos(r.state, 1)).toEqual(at(1));
    expect(r.events).toContainEqual({ type: 'wispMove', id: 1, from: C, to: at(1) });
    expect(r.state.wisps[0].plan).toEqual(wispPlan(r.state, at(1)));
    expect(r.state.wisps[0].plan).toEqual(bestEmptyNeighbor(r.state, at(1)));
  });

  it('falls back to the best empty neighbour when its planned hex was filled', () => {
    const s = blankState();
    addWisp(s, C, at(1));
    const r = applyAction(s, place(at(1))); // player takes the planned hex
    // occupied after placement: at(1). Compute best on that board.
    const pre = blankState({ cells: [[at(1), plant(0)]] });
    addWisp(pre, C);
    const expected = bestEmptyNeighbor(pre, C)!;
    expect(wispPos(r.state, 1)).toEqual(expected);
    expect(expected).toEqual(at(3)); // (-1,1): first of the 5-room neighbours
  });

  it('best empty neighbour = most empty neighbours; ties go to the first DIRS index', () => {
    // Edge cell (3,-3) corner: neighbours (3,-2), (2,-2), (2,-3) — dirs 2,3,4.
    const s = blankState();
    const corner = hex(3, -3);
    addWisp(s, corner);
    expect(wispPlan(s, corner)).toEqual(bestEmptyNeighbor(s, corner));
    // Make dir 2 neighbour cramped; the plan must avoid it.
    const t = blankState({ cells: [[hex(3, -1), plant(0)], [hex(2, -1), plant(0)], [hex(3, -2), null]] });
    addWisp(t, corner);
    expect(wispPlan(t, corner)).toEqual(bestEmptyNeighbor(t, corner));
    expect(wispPlan(t, corner)).not.toEqual(hex(3, -2));
  });

  it('wispPlan is null with no empty neighbour', () => {
    const s = blankState();
    fillMonoliths(s, [C]);
    expect(wispPlan(s, C)).toBeNull();
  });

  it('after every turn wisp.plan matches wispPlan for its position', () => {
    let s = blankState({ current: wispHand });
    addWisp(s, hex(-2, 1));
    addWisp(s, hex(2, -1));
    for (const h of [hex(0, 0), hex(1, 1), hex(-1, -1), hex(3, 0)]) {
      s = applyAction(s, place(h)).state;
      for (const w of s.wisps) expect(w.plan).toEqual(wispPlan(s, wispPos(s, w.id)!));
      checkInvariants(s);
    }
  });

  it('a wisp with no empty neighbour after the move phase turns into a tier-0 stone', () => {
    const corner = hex(3, -3);
    const ns = [hex(3, -2), hex(2, -2), hex(2, -3)];
    const s = blankState({ cells: [[ns[0], plant(3)], [ns[1], plant(3)]] });
    addWisp(s, corner, ns[2]);
    const r = applyAction(s, place(ns[2])); // seals the last exit
    expect(cellAt(r.state, corner)).toEqual(stone(0));
    expect(r.state.wisps).toEqual([]);
    expect(r.events).toContainEqual({ type: 'wispTrapped', id: 1, at: corner });
    expect(r.events.some((e) => e.type === 'wispMove')).toBe(false);
  });

  it('trapped stones merge with adjacent stones', () => {
    const corner = hex(3, -3);
    const ns = [hex(3, -2), hex(2, -2), hex(2, -3)];
    const s = blankState({ cells: [[ns[0], stone(0)], [ns[1], stone(0)]] });
    addWisp(s, corner, ns[2]);
    const r = applyAction(s, place(ns[2]));
    expect(cellAt(r.state, corner)).toEqual(stone(1));
    expect(cellAt(r.state, ns[0])).toBeNull();
    expect(cellAt(r.state, ns[1])).toBeNull();
    expect(cellAt(r.state, ns[2])).toEqual(plant(0));
    expect(r.state.score).toBe(POINTS.plant[0] + POINTS.stone[1]);
  });

  it('wisps move oldest first; a later wisp re-plans when its planned hex was taken', () => {
    const corner = hex(3, -3);
    const s = blankState({ cells: [[hex(3, -2), plant(3)], [hex(2, -3), plant(3)]] });
    const a = addWisp(s, corner, hex(2, -2));
    // 2nd wisp sits where it will step into 'corner' after wisp 1 vacates it
    const b = addWisp(s, hex(1, -2), hex(2, -2));
    expect([a, b]).toEqual([1, 2]);
    const r = applyAction(s, place(hex(-3, 0)));
    // wisp 1 (oldest) takes (2,-2); wisp 2's plan is now filled so it re-plans
    expect(wispPos(r.state, 1)).toEqual(hex(2, -2));
    checkInvariants(r.state);
  });

  it('a wisp placed into a 1-hex pocket turns to stone immediately', () => {
    const pocket = hex(3, -3);
    const far = hex(-3, 3);
    const s = blankState({ current: { kind: 'wisp' } });
    fillMonoliths(s, [pocket, far]);
    const r = applyAction(s, place(pocket));
    expect(cellAt(r.state, pocket)).toEqual(stone(0));
    expect(r.state.wisps).toEqual([]);
    expect(r.state.nextWispId).toBe(2);
    expect(r.events).toContainEqual({ type: 'wispTrapped', id: 1, at: pocket });
  });

  it('a pocketed wisp-stone merges with adjacent stones', () => {
    const pocket = hex(3, -3);
    const far = hex(-3, 3);
    const s = blankState({ current: { kind: 'wisp' } });
    fillMonoliths(s, [pocket, far]);
    s.board[key(hex(3, -2))] = stone(0);
    s.board[key(hex(2, -2))] = stone(0);
    const r = applyAction(s, place(pocket));
    expect(cellAt(r.state, pocket)).toEqual(stone(1));
    expect(cellAt(r.state, hex(3, -2))).toBeNull();
    expect(cellAt(r.state, hex(2, -2))).toBeNull();
    expect(r.state.score).toBe(POINTS.stone[1]);
  });
});

describe('swap', () => {
  it('with an empty stash moves current to stash and draws a new current', () => {
    const s = blankState({ current: { kind: 'plant', tier: 2 }, draws: 5 });
    addWisp(s, hex(1, 1), hex(2, 0));
    const r = applyAction(s, swap);
    expect(r.state.stash).toEqual({ kind: 'plant', tier: 2 });
    expect(r.state.current).toEqual(drawPiece(s.seed, 5));
    expect(r.state.draws).toBe(6);
    expect(r.state.turn).toBe(s.turn);
    expect(r.state.board).toEqual(s.board);
    expect(r.state.wisps).toEqual(s.wisps);
    expect(r.events).toEqual([{ type: 'swap' }]);
  });

  it('with a stash exchanges them without drawing', () => {
    const s = blankState({ current: { kind: 'plant', tier: 1 }, stash: { kind: 'crystal' }, draws: 5 });
    addWisp(s, hex(1, 1), hex(2, 0));
    const r = applyAction(s, swap);
    expect(r.state.current).toEqual({ kind: 'crystal' });
    expect(r.state.stash).toEqual({ kind: 'plant', tier: 1 });
    expect(r.state.draws).toBe(5);
    expect(r.state.turn).toBe(s.turn);
    expect(r.state.board).toEqual(s.board);
    expect(r.state.wisps).toEqual(s.wisps);
    expect(applyAction(r.state, swap).state.current).toEqual(s.current);
  });

  it('does not score or change the score', () => {
    const s = blankState();
    expect(applyAction(s, swap).state.score).toBe(0);
  });
});

describe('game over', () => {
  const P = hex(3, -3);
  const E = hex(-3, 3);

  it('is over when no empty cell remains after a turn', () => {
    const d = 4;
    const seed = seedWhereDraw(d, (p) => p.kind !== 'bolt');
    const s = blankState({ seed, draws: d });
    fillMonoliths(s, [P]);
    const r = applyAction(s, place(P));
    expect(emptyCells(r.state).length).toBe(0);
    expect(r.state.status).toBe('over');
    expect(r.events.at(-1)).toEqual({ type: 'gameOver' });
  });

  it('stays playing while empty cells remain', () => {
    const seed = seedWhereDraw(4, (p) => p.kind !== 'bolt');
    const s = blankState({ seed, draws: 4 });
    fillMonoliths(s, [P, E]);
    expect(applyAction(s, place(P)).state.status).toBe('playing');
  });

  it('no actions are legal after game over', () => {
    const seed = seedWhereDraw(4, (p) => p.kind !== 'bolt');
    const s = blankState({ seed, draws: 4 });
    fillMonoliths(s, [P]);
    const over = applyAction(s, place(P)).state;
    expect(isLegal(over, swap)).toBe(false);
    for (const h of CELLS) expect(isLegal(over, place(h))).toBe(false);
    expect(() => applyAction(over, swap)).toThrow();
    expect(() => applyAction(over, place(P))).toThrow();
  });

  it('a drawn bolt keeps the game alive on a full board', () => {
    const seed = seedWhereDraw(4, (p) => p.kind === 'bolt');
    const s = blankState({ seed, draws: 4 });
    fillMonoliths(s, [P]);
    const r = applyAction(s, place(P));
    expect(r.state.current.kind).toBe('bolt');
    expect(r.state.status).toBe('playing');
    // and the bolt can be used
    const r2 = applyAction(r.state, place(hex(0, 0)));
    expect(cellAt(r2.state, hex(0, 0))).toBeNull();
  });

  it('a stashed bolt keeps the game alive on a full board', () => {
    const seed = seedWhereDraw(4, (p) => p.kind !== 'bolt');
    const s = blankState({ seed, draws: 4, stash: { kind: 'bolt' } });
    fillMonoliths(s, [P]);
    const r = applyAction(s, place(P));
    expect(r.state.status).toBe('playing');
    expect(isLegal(r.state, swap)).toBe(true);
    const swapped = applyAction(r.state, swap).state;
    expect(swapped.current.kind).toBe('bolt');
    expect(isLegal(swapped, place(hex(0, 0)))).toBe(true);
  });

  it('a merge that frees cells on a full board keeps the game playing', () => {
    const seed = seedWhereDraw(4, (p) => p.kind !== 'bolt');
    const s = blankState({ seed, draws: 4, current: { kind: 'plant', tier: 0 } });
    fillMonoliths(s, [P]);
    s.board[key(hex(3, -2))] = plant(0);
    s.board[key(hex(2, -2))] = plant(0);
    const r = applyAction(s, place(P));
    expect(cellAt(r.state, P)).toEqual(plant(1));
    expect(r.state.status).toBe('playing');
    expect(emptyCells(r.state).length).toBe(2);
  });
});

describe('previewAction', () => {
  function expectMatches(s: ReturnType<typeof blankState>, a: Parameters<typeof applyAction>[1]) {
    const o = previewAction(s, a);
    const r = applyAction(s, a);
    expect(o.points).toBe(r.state.score - s.score);
    let consumed = 0;
    let trapped = 0;
    for (const e of r.events) {
      if (e.type === 'merge') consumed += e.from.length;
      if (e.type === 'wispTrapped') trapped++;
    }
    expect(o.consumed.length).toBe(consumed);
    expect(o.trapped).toBe(trapped);
    expect(o.over).toBe(r.state.status === 'over');
    return o;
  }

  it('matches applyAction for a plain merge', () => {
    const s = blankState({ cells: [[at(0), plant(0)], [at(1), plant(0)]] });
    const o = expectMatches(s, place(C));
    expect(o.points).toBe(25);
    expect(o.consumed.length).toBe(2);
    expect(o.creates).toEqual({ kind: 'plant', tier: 1 });
  });

  it('matches for chains, crystals, bolts and traps', () => {
    expectMatches(
      blankState({ cells: [[at(0), plant(0)], [at(1), plant(0)], [at(3), plant(1)], [at(4), plant(1)]] }),
      place(C),
    );
    const cr = blankState({ current: { kind: 'crystal' }, cells: [[at(0), stone(0)], [at(1), stone(0)]] });
    // the crystal event reports the piece that settles (tier 0 stone), which then merges up to a cairn
    expect(expectMatches(cr, place(C)).crystal).toEqual({ kind: 'stone', tier: 0 });
    const bolt = blankState({ current: { kind: 'bolt' }, cells: [[at(0), stone(0)], [at(2), stone(0)]] });
    addWisp(bolt, C);
    expectMatches(bolt, place(C));
    const corner = hex(3, -3);
    const ns = [hex(3, -2), hex(2, -2), hex(2, -3)];
    const trap = blankState({ cells: [[ns[0], stone(0)], [ns[1], stone(0)]] });
    addWisp(trap, corner, ns[2]);
    const o = expectMatches(trap, place(ns[2]));
    expect(o.trapped).toBe(1);
    expect(o.points).toBe(5 + 250);
  });

  it('reports a game-ending move', () => {
    const P = hex(3, -3);
    const seed = seedWhereDraw(4, (p) => p.kind !== 'bolt');
    const s = blankState({ seed, draws: 4 });
    fillMonoliths(s, [P]);
    expect(expectMatches(s, place(P)).over).toBe(true);
  });

  it('does not mutate the state', () => {
    const s = blankState({ cells: [[at(0), plant(0)], [at(1), plant(0)]] });
    const copy = structuredClone(s);
    previewAction(s, place(C));
    expect(s).toEqual(copy);
  });
});
