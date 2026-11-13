// The hand-made opening levels: each one teaches one idea. Par is the obvious
// good build for the lesson (`ref`, mostly all twigs), so a learner who builds
// the shape the tip describes earns the stars; the surveyor may find cheaper
// (tests check the ref holds with room to spare and the surveyor fits par).

import { pt, type Level } from './level';

const bank = (x0: number, y0: number, x1: number) => ({ x0, y0, x1, y1: 14, kind: 'bank' as const });

export const TUTORIALS: Level[] = [
  {
    id: 't1',
    name: 'First Plank',
    terrain: [bank(-3, 6, 5), bank(7, 6, 15)],
    anchors: [pt(5, 6), pt(7, 6)],
    goal: { kind: 'cross', from: pt(5, 6), to: pt(7, 6), startX: 3.6, startY: 6, goalX: 7.7, cart: 2 },
    ref: 'P2b2d',
    budget: 30,
    par: 20,
    parParts: 1,
    tip: 'Drag from one gold peg to the other to lay a plank, then press Go.',
  },
  {
    id: 't2',
    name: 'Prop It Up',
    terrain: [bank(-3, 6, 4), bank(8, 6, 15)],
    anchors: [pt(4, 6), pt(8, 6), pt(4, 7), pt(8, 7)],
    goal: { kind: 'cross', from: pt(4, 6), to: pt(8, 6), startX: 2.9, startY: 6, goalX: 8.7, cart: 2 },
    ref: 'P2a2cP2c2eT2n2cT2r2c',
    budget: 80,
    par: 62,
    parParts: 4,
    tip: 'Planks alone sag. Brace the middle peg with a twig from a rock peg: triangles hold.',
  },
  {
    id: 't3',
    name: 'Triangles',
    terrain: [bank(-3, 6, 3), bank(9, 6, 15)],
    anchors: [pt(3, 6), pt(9, 6)],
    goal: { kind: 'cross', from: pt(3, 6), to: pt(9, 6), startX: 1.9, startY: 6, goalX: 9.7, cart: 2 },
    ref: 'P292bP2b2dP2d2fT292nT2n2bT2b2pT2p2dT2d2rT2r2fT2n2pT2p2r',
    budget: 170,
    par: 122,
    parParts: 11,
    tip: 'Nothing to lean on: build a row of triangles over or under the road.',
  },
  {
    id: 't4',
    name: 'Hanging Road',
    terrain: [bank(-3, 6, 3), bank(9, 6, 15)],
    anchors: [pt(3, 6), pt(9, 6), pt(4, 2), pt(8, 2)],
    goal: { kind: 'cross', from: pt(3, 6), to: pt(9, 6), startX: 1.9, startY: 6, goalX: 9.7, cart: 2.4 },
    ref: 'P292bP2b2dP2d2fR0u2bR0y2d',
    budget: 100,
    par: 84,
    parParts: 5,
    tip: 'Twine is cheap and long but only pulls: hang the road from the hooks.',
  },
  {
    id: 't5',
    name: 'Lantern',
    terrain: [{ x0: -3, y0: 4, x1: 2, y1: 14, kind: 'wall' }],
    anchors: [pt(2, 4), pt(2, 6)],
    goal: { kind: 'reach', rings: [pt(6, 5)], weight: 2 },
    ref: 'R1i1xT1x1yR1x2bT2a2bT1z2bR1y2aR1i1yR1i1zT1x28T282a',
    budget: 110,
    par: 74,
    parParts: 10,
    tip: 'Build out from the cliff and end a piece on the ring. The lantern must not sag.',
  },
  {
    id: 't6',
    name: 'Stepping Stone',
    terrain: [bank(-3, 6, 2), bank(10, 6, 15), { x0: 5.6, y0: 8, x1: 6.4, y1: 14, kind: 'rock' }],
    anchors: [pt(2, 6), pt(10, 6), pt(6, 8)],
    goal: { kind: 'cross', from: pt(2, 6), to: pt(10, 6), startX: 0.9, startY: 6, goalX: 10.7, cart: 2.5 },
    ref: 'P282aP2a2cP2c2eP2e2gT322cT2a2oT2o2cT2c2qT2q2eT2o32T2q32',
    budget: 180,
    par: 132,
    parParts: 11,
    tip: 'A long gap: lean on the rock spire in the middle.',
  },
];
