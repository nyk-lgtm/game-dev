// npx vite-node scripts/rewild/balance.ts [games] [greedy|random] [lookahead]
import { census, starsFor } from '../../src/rewild/core';
import { run } from './bot';

const n = +(process.argv[2] ?? 20);
const who = (process.argv[3] ?? 'greedy') as 'greedy' | 'random';
const look = +(process.argv[4] ?? 2);
const scores: number[] = [];
const species: number[] = [];
const goals: number[] = [];
const stars = [0, 0, 0, 0];
const seen = new Map<string, number>();
const goalRate = new Map<string, [number, number]>();
const goalProg = new Map<string, string[]>();
for (let k = 0; k < n; k++) {
  const r = run(1000 + k * 7, who, look);
  scores.push(r.s.score);
  const c = census(r.s.cells);
  species.push(c.species.size);
  for (const id of c.species) seen.set(id, (seen.get(id) ?? 0) + 1);
  goals.push(r.s.goals.filter((g) => g.done).length);
  for (const g of r.s.goals) {
    const e = goalRate.get(g.id) ?? [0, 0];
    e[0] += g.done ? 1 : 0;
    e[1]++;
    goalRate.set(g.id, e);
    goalProg.set(g.id, [...(goalProg.get(g.id) ?? []), `${g.progress}/${g.target}`]);
  }
  stars[starsFor(r.s.score)]++;
  if (k < 3) console.log(`seed ${r.seed}: score ${r.s.score}, species ${c.species.size}, curve`, r.s.log.map((l) => l.species).join(' '), 'pts', r.s.log.map((l) => l.points).join(' '));
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(`${who} x${n}: score median ${med(scores)} (min ${Math.min(...scores)}, max ${Math.max(...scores)}); species at end median ${med(species)}; goals done avg ${(goals.reduce((a, b) => a + b, 0) / n).toFixed(2)}; stars 0-3: ${stars.join('/')}`);
console.log('alive at end (games):', [...seen].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
console.log('goals met (done/dealt):', [...goalRate].sort().map(([k, [d, t]]) => `${k} ${d}/${t}`).join(', '));
if (process.env.PROG) for (const [k, v] of [...goalProg].sort()) console.log(' ', k, v.join(' '));
