import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COLS,
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
});

describe('cart over joints', () => {
  it('a heavy cart through a V in the road does not snap propped planks', () => {
    const nodes = [3, 5, 7, 9].map((x, i) => pt(x, [6, 7, 7, 6][i]));
    const props = nodes.slice(1, 3).flatMap((p) => [p + COLS - 1, p + COLS + 1]);
    const l = {
      ...TUTORIALS[2],
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
  });
});

describe('diagnosis', () => {
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

describe('the ramp', () => {
  it('later layouts bring wind, twin lanterns and obstacles', () => {
    let wind = 0, twin = 0, twist = 0;
    for (let i = 0; i < 120; i++) {
      const { level: l } = layout(1000 + i, 1, 0, i % 2 ? 'reach' : 'cross');
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
    const gusty = new Sim({ ...l, wind: 2 }, ms);
    for (let i = 0; i < 700; i++) calm.step(), gusty.step();
    expect(gusty.x[gusty.lanterns[0]] - calm.x[calm.lanterns[0]]).toBeGreaterThan(0.05);
  });
});
