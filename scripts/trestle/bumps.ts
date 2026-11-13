// Contact spikes at road kinks: `npx vite-node scripts/trestle/bumps.ts [cart]`
// The same rigidly propped road, flat and stepping down a slope to a lower
// bank (and, for the record, a V and a hill, which the beetle can't climb out
// of or over), crossed by the cart: prints each plank's peak stress. A fair sim
// keeps the kinked planks well under their strength (no hammer at the joints).

import { COLS, PLANK, TWIG, addMember, pt, runSim, type Level, type Member } from '../../src/trestle/core';

const cart = Number(process.argv[2] ?? 3.5);
const road = (shape: 'flat' | 'down' | 'v' | 'hill') => {
  const ys = shape === 'flat' ? [6, 6, 6, 6] : shape === 'down' ? [6, 7, 7, 7] : shape === 'v' ? [6, 7, 7, 6] : [6, 5, 5, 6];
  return [3, 5, 7, 9].map((x, i) => pt(x, ys[i]));
};
for (const shape of ['flat', 'down', 'v', 'hill'] as const) {
  const nodes = road(shape);
  // Props: two anchors under each inner road peg.
  const props = nodes.slice(1, 3).flatMap((p) => [p + COLS - 1, p + COLS + 1]);
  const l: Level = {
    id: 'bump', name: 'bump',
    terrain: [{ x0: -3, y0: 6, x1: 3, y1: 14, kind: 'bank' }, { x0: 9, y0: shape === 'down' ? 7 : 6, x1: 15, y1: 14, kind: 'bank' }],
    anchors: [nodes[0], nodes[3], ...props],
    goal: { kind: 'cross', from: nodes[0], to: nodes[3], startX: 1.9, startY: 6, goalX: 9.7, cart },
    budget: 999, par: 0, parParts: 0,
  };
  let ms: Member[] = [];
  for (let i = 0; i < 3; i++) ms = addMember(l, ms, nodes[i], nodes[i + 1], PLANK) ?? ms;
  nodes.slice(1, 3).forEach((p, k) => {
    ms = addMember(l, ms, p, props[2 * k], TWIG) ?? ms;
    ms = addMember(l, ms, p, props[2 * k + 1], TWIG) ?? ms;
  });
  const r = runSim(l, ms);
  const planks = ms.map((m, i) => (m.mat === PLANK ? r.peak[i].toFixed(2) : null)).filter(Boolean);
  console.log(`${shape.padEnd(5)} ${r.outcome} planks ${planks.join(' ')} (max ${Math.max(...planks.map(Number)).toFixed(2)})`);
}
