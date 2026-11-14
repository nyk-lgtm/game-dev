import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  POOL,
  looseOf,
  dailyName,
  type Level,
  COLS,
  LEVEL_TYPES,
  SURVEY_EFFORT,
  PLANK,
  explain,
  joined,
  layout,
  survey,
  wobbly,
  RULES_VERSION,
  Sim,
  TUTORIALS,
  TWIG,
  TWINE,
  WON,
  addMember,
  addToken,
  costOf,
  delToken,
  judge,
  makeLevel,
  pt,
  px,
  py,
  replayBuild,
  runSim,
  starsFor,
  toActions,
  trailLevel,
  whyNot,
  type Member,
} from '../../src/trestle/core';

describe('core purity', () => {
  it('uses no Math.random, Date or DOM', () => {
    const dir = 'src/trestle/core';
    for (const f of readdirSync(dir)) {
      const src = readFileSync(`${dir}/${f}`, 'utf8');
      expect(src, f).not.toMatch(/Math\.random|Date\.|new Date|document\.|window\.|Math\.(sin|cos|atan|hypot|pow)\(/);
    }
    expect(RULES_VERSION).toBeGreaterThan(0);
  });
});

describe('building', () => {
  const l = TUTORIALS[2]; // Triangles: banks at y 6, anchors (3,6) and (9,6)
  it('adds members from pegs only, within length, out of rock', () => {
    expect(whyNot(l, [], pt(3, 6), pt(5, 6), PLANK)).toBeNull();
    expect(whyNot(l, [], pt(4, 6), pt(5, 6), PLANK)).toBe('Start from a peg');
    expect(whyNot(l, [], pt(3, 6), pt(6, 6), PLANK)).toMatch(/Too long/);
    expect(whyNot(l, [], pt(3, 6), pt(6, 6), TWINE)).toBeNull();
    expect(whyNot(l, [], pt(3, 6), pt(2, 7), TWIG)).toMatch(/rock/);
  });
  it('splits a member at a peg it passes through, and replaces a material on the same pair', () => {
    let ms = addMember(l, [], pt(3, 6), pt(4, 6), PLANK)!;
    ms = addMember(l, ms, pt(3, 6), pt(5, 6), TWINE)!;
    // (3,6)-(4,6) becomes twine, (4,6)-(5,6) is new twine.
    expect(ms).toHaveLength(2);
    expect(ms.every((m) => m.mat === TWINE)).toBe(true);
    expect(addMember(l, ms, pt(3, 6), pt(4, 6), TWINE)).toBeNull();
  });
  it('replays actions with undo, delete and clear', () => {
    const a = addToken(pt(3, 6), pt(5, 6), PLANK) + addToken(pt(5, 6), pt(4, 7), TWIG) + 'G' + delToken(pt(5, 6), pt(4, 7)) + 'U' + 'C' + 'U';
    const b = replayBuild(l, a);
    expect(b.members).toHaveLength(2);
    expect(b.runs).toBe(1);
    expect(costOf(b.members)).toBe(20 + 7);
    expect(replayBuild(l, a + 'U').members).toHaveLength(1);
    // Junk tokens are skipped.
    expect(replayBuild(l, 'Pzzzz' + a).members).toHaveLength(2);
  });
});

describe('the sim', () => {
  it('is deterministic step for step', () => {
    const l = TUTORIALS[2];
    const ms = replayBuild(l, l.ref!).members;
    const a = new Sim(l, ms);
    const b = new Sim(l, ms);
    for (let i = 0; i < 900; i++) a.step(), b.step();
    expect([...a.x]).toEqual([...b.x]);
    expect([...a.force]).toEqual([...b.force]);
  });
  it('a lone row of planks sags and snaps; a truss holds', () => {
    const l = TUTORIALS[2];
    let ms: Member[] = [];
    for (let x = 3; x < 9; x += 2) ms = addMember(l, ms, pt(x, 6), pt(x + 2, 6), PLANK)!;
    const r = runSim(l, ms);
    expect(r.outcome).toBe('fell');
    expect(r.breaks).toBeGreaterThan(0);
    expect(WON.has(runSim(l, replayBuild(l, l.ref!).members).outcome)).toBe(true);
  });
  it('a road that stops short leaves the cart behind', () => {
    const l = TUTORIALS[0];
    expect(runSim(l, []).outcome).not.toBe('crossed');
  });
  it('the lantern needs a peg on its ring', () => {
    const l = TUTORIALS[4];
    expect(runSim(l, addMember(l, [], pt(2, 4), pt(4, 4), TWIG)!).outcome).toBe('nohook');
  });
});

describe('tutorials', () => {
  it('each reference build clears at par with three stars, and par fits the budget', () => {
    for (const l of TUTORIALS) {
      const v = judge(l, l.ref!);
      expect(WON.has(v.outcome), l.id).toBe(true);
      expect(v.cost, l.id).toBe(l.par);
      expect(v.parts, l.id).toBe(l.parParts);
      expect(v.stars, l.id).toBe(3);
      expect(l.par, l.id).toBeLessThan(l.budget);
      // The obvious build holds with room to spare, and the surveyor never needs more than par.
      const r = runSim(l, replayBuild(l, l.ref!).members);
      expect(Math.max(...r.peak), l.id).toBeLessThan(0.85);
      expect(survey(l, SURVEY_EFFORT)!.cost, l.id).toBeLessThanOrEqual(l.par);
    }
  });
  it('stars: budget, par, parts', () => {
    const l = TUTORIALS[1];
    expect(starsFor(l, l.budget + 1, 1)).toBe(0);
    expect(starsFor(l, l.budget, 1)).toBe(1);
    expect(starsFor(l, l.par, l.parParts + 1)).toBe(2);
    expect(starsFor(l, l.par, l.parParts)).toBe(3);
  });
});

describe('generated levels', () => {
  it('are deterministic and proven: the surveyor’s build clears within budget', () => {
    for (const [seed, d] of [
      [11, 0],
      [12, 0.3],
      [13, 0.6],
      [14, 1],
    ] as const) {
      const l = makeLevel(seed, d);
      expect(JSON.stringify(makeLevel(seed, d))).toBe(JSON.stringify(l));
      const v = judge(l, l.ref!);
      expect(WON.has(v.outcome)).toBe(true);
      expect(v.cost).toBe(l.par);
      expect(l.par).toBeLessThanOrEqual(l.budget);
      expect(l.parParts).toBeGreaterThanOrEqual(3);
      // The proof replays to the same build it was priced on.
      expect(toActions(l, replayBuild(l, l.ref!).members).length).toBe(l.ref!.length);
      if (l.goal.kind === 'reach') {
        for (const r of l.goal.rings) expect(l.anchors.some((a) => px(a) === px(r) && py(a) < py(r))).toBe(false);
      }
    }
  });
  it('trail level 7 is the same for everyone', () => {
    const a = trailLevel(7);
    expect(a.id).toBe('n7');
    expect(JSON.stringify(trailLevel(7))).toBe(JSON.stringify(a));
  });
  it('the picked trail: every level proven at par, unique names, steady difficulty, all types', () => {
    expect(POOL.length).toBeGreaterThanOrEqual(40);
    const names = new Set(POOL.map((l) => l.name));
    expect(names.size).toBe(POOL.length);
    for (const t of TUTORIALS) expect(names.has(t.name)).toBe(false);
    // A daily never borrows a trail name.
    for (let s = 1; s < 40; s++) {
      const crossing = dailyName(s * 7919, false);
      expect(names.has(crossing)).toBe(false);
      // A crossing's name never sounds like a lantern level, and the other way round.
      expect(crossing).not.toMatch(/Lantern|Lookout|Ledge|Overhang|Perch|Beacon|Hook/);
      expect(dailyName(s * 7919, true)).not.toMatch(/Gap|Gully|Ford|Ravine|Crossing|Cut|Dell|Brook/);
    }
    // No par build leans on a piece with a free end.
    for (const l of POOL) expect(looseOf(l, replayBuild(l, l.ref!).members, l.goal.kind === 'reach' ? l.goal.rings : []).some(Boolean), l.name).toBe(false);
    POOL.forEach((l, i) => {
      if (i % 5) return;
      const v = judge(l, l.ref!);
      expect(WON.has(v.outcome), l.name).toBe(true);
      expect(v.cost, l.name).toBe(l.par);
    });
    const third = Math.floor(POOL.length / 3);
    const avg = (a: Level[]) => a.reduce((x, l) => x + (l.diff ?? 0), 0) / a.length;
    expect(avg(POOL.slice(0, third))).toBeLessThan(avg(POOL.slice(third, 2 * third)));
    expect(avg(POOL.slice(third, 2 * third))).toBeLessThan(avg(POOL.slice(2 * third)));
    for (const t of LEVEL_TYPES) expect(POOL.some((l) => l.type === t), t).toBe(true);
  });
});

describe('cart over joints', () => {
  it('a heavy cart down a kinked road does not snap propped planks; it cannot climb out of a dip', () => {
    const nodes = [3, 5, 7, 9].map((x, i) => pt(x, [6, 7, 7, 7][i]));
    const props = nodes.slice(1, 3).flatMap((p) => [p + COLS - 1, p + COLS + 1]);
    const l = {
      ...TUTORIALS[2],
      terrain: [TUTORIALS[2].terrain[0], { ...TUTORIALS[2].terrain[1], y0: 7 }],
      anchors: [nodes[0], nodes[3], ...props],
      goal: { kind: 'cross' as const, from: nodes[0], to: nodes[3], startX: 1.9, startY: 6, goalX: 9.7, cart: 4.5 },
    };
    let ms: Member[] = [];
    for (let i = 0; i < 3; i++) ms = addMember(l, ms, nodes[i], nodes[i + 1], PLANK)!;
    nodes.slice(1, 3).forEach((p, k) => {
      ms = addMember(l, ms, p, props[2 * k], TWIG)!;
      ms = addMember(l, ms, p, props[2 * k + 1], TWIG)!;
    });
    const r = runSim(l, ms);
    expect(r.outcome).toBe('crossed');
    expect(Math.max(...ms.map((m, i) => (m.mat === PLANK ? r.peak[i] : 0)))).toBeLessThan(0.6);
    // A three-plank dip (a hanging chain) would hold, but the beetle can't haul back up out of it.
    const t3 = TUTORIALS[2];
    const dip = replayBuild(t3, 'P292oP2o2qP2f2q').members;
    expect(runSim({ ...t3, terrain: t3.terrain.filter((r) => r.kind !== 'clear') }, dip).outcome).toBe('stalled');
  });
});

describe('diagnosis', () => {
  it('rock tops join the road (an island between two road ends)', () => {
    const t6 = TUTORIALS[5];
    const isl = {
      ...t6,
      terrain: [...t6.terrain.filter((r) => r.kind !== 'rock'), { x0: 5, y0: 6, x1: 7, y1: 14, kind: 'bank' as const }],
      anchors: [pt(2, 6), pt(10, 6), pt(5, 6), pt(7, 6)],
    };
    let ms: Member[] = [];
    for (const [a, b] of [[2, 4], [4, 5], [7, 9], [9, 10]]) ms = addMember(isl, ms, pt(a, 6), pt(b, 6), PLANK)!;
    expect(joined(isl, ms).road).toBe(true);
  });
  it('a swinging chain is called wobbly (with its pegs), not too weak', () => {
    const l = TUTORIALS[4];
    // A row of twigs out from the cliff to the ring, nothing bracing it.
    let ms: Member[] = [];
    for (let x = 2; x < 6; x++) ms = addMember(l, ms, pt(x, x === 2 ? 4 : 5), pt(x + 1, 5), TWIG)!;
    const r = runSim(l, ms);
    const v = explain(l, ms, r);
    expect(v.cause).toBe('wobbly');
    expect(v.wobbly.size).toBeGreaterThan(0);
  });
  it('names a missing diagonal, a road with a gap and a collapse', () => {
    const l = TUTORIALS[2];
    const deck = replayBuild(l, 'P292bP2b2dP2d2f').members;
    // The two middle road pegs can swing.
    expect([...wobbly(l, deck)].sort()).toEqual([pt(5, 6), pt(7, 6)].sort());
    expect(wobbly(l, replayBuild(l, l.ref!).members).size).toBe(0);
    const v = explain(l, deck, runSim(l, deck));
    expect(['weight', 'wobbly']).toContain(v.cause);
    const half = deck.slice(0, 2);
    expect(joined(l, half).road).toBe(false);
    expect(explain(l, half, runSim(l, half)).cause).toBe('unjoined');
    expect(joined(l, deck).road).toBe(true);
  });
  it('a twine pushed under a lantern goes slack; one pulled too hard is called too weak', () => {
    const l = TUTORIALS[4];
    // A single cord from the top of the cliff to the ring can't hold it out there.
    const ms = addMember(l, [], pt(2, 4), pt(6, 5), TWINE)!;
    const r = runSim(l, ms);
    expect(WON.has(r.outcome)).toBe(false);
    expect(['wobbly', 'weak', 'sag']).toContain(explain(l, ms, r).cause);
  });
});

describe('free ends', () => {
  it('a piece with a free end is left out of the run: it can neither help nor hurt', () => {
    const l = TUTORIALS[2];
    const ms = replayBuild(l, l.ref!).members;
    const stub = addMember(l, ms, pt(5, 6), pt(5, 4), TWIG)!;
    expect(looseOf(l, stub)[stub.length - 1]).toBe(1);
    const a = runSim(l, ms);
    const b = runSim(l, stub);
    expect(b.outcome).toBe(a.outcome);
    expect(b.steps).toBe(a.steps);
    // A chain of two stubs goes too, and the wobble check ignores them.
    const chain = addMember(l, stub, pt(5, 4), pt(6, 3), TWIG)!;
    expect([...looseOf(l, chain)].slice(-2)).toEqual([1, 1]);
    expect(wobbly(l, chain).size).toBe(0);
  });
  it('a cart stuck uphill points at the climbing plank', () => {
    const t3 = TUTORIALS[2];
    const dip = replayBuild(t3, 'P292oP2o2qP2f2q').members;
    const v = explain(t3, dip, runSim(t3, dip));
    expect(v.uphill?.map((k) => dip[k])).toEqual([dip.find((m) => m.a === pt(9, 6) || m.b === pt(9, 6))]);
  });
});

describe('the ramp', () => {
  it('later layouts bring wind, twin lanterns and obstacles', () => {
    let wind = 0, twin = 0, twist = 0;
    for (let i = 0; i < 120; i++) {
      const { level: l } = layout(1000 + i, 1, 0, LEVEL_TYPES[i % LEVEL_TYPES.length]);
      if (l.wind) wind++;
      if (l.goal.kind === 'reach' && l.goal.rings.length > 1) twin++;
      if (l.terrain.some((r) => r.kind === 'log' || r.kind === 'floor')) twist++;
    }
    expect(wind).toBeGreaterThan(20);
    expect(twin).toBeGreaterThan(5);
    expect(twist).toBeGreaterThan(5);
  });
  it('wind pushes a hanging lantern sideways', () => {
    const l = TUTORIALS[4];
    const ms = replayBuild(l, l.ref!).members;
    const calm = new Sim(l, ms);
    const gusty = new Sim({ ...l, wind: 1 }, ms);
    for (let i = 0; i < 700; i++) calm.step(), gusty.step();
    expect(Math.abs(gusty.x[gusty.lanterns[0]] - calm.x[calm.lanterns[0]])).toBeGreaterThan(0.05);
  });
});
