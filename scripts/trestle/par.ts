// How tight is par? `npx vite-node scripts/trestle/par.ts 40 [effort]`
// Generates levels (par from the normal surveyor) and searches each again much
// harder (effort 4 by default: more shapes stripped, shuffled orders, more
// local-search rounds). Prints how often and by how much the hard search beats
// par: a stand-in for a clever player.

import { makeLevel, survey } from '../../src/trestle/core';
import { mixSeed } from '../../src/shared/rng';

const n = Number(process.argv[2] ?? 30);
const effort = Number(process.argv[3] ?? 4);
const gaps: number[] = [];
let beaten = 0;
for (let i = 0; i < n; i++) {
  const d = (i % 25) / 24;
  const l = makeLevel(mixSeed(Number(process.env.SEED ?? 1), i), d);
  const s = survey(l, effort);
  const gap = s ? (l.par - s.cost) / l.par : 0;
  if (gap > 0) beaten++;
  gaps.push(gap);
  if (process.env.V) console.log(`${l.id} d=${d.toFixed(2)} ${l.goal.kind}${l.wind ? ' wind' : ''}: par ${l.par}/${l.parParts} hard ${s?.cost}/${s?.parts} (${(gap * 100).toFixed(0)}%)`);
}
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
console.log(`hard search beats par on ${beaten}/${n}; gap median ${(q(gaps, 0.5) * 100).toFixed(1)}%, p90 ${(q(gaps, 0.9) * 100).toFixed(1)}%, max ${(Math.max(...gaps) * 100).toFixed(1)}%`);
