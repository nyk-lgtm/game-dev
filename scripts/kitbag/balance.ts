// Kitbag balance probe: `npx vite-node scripts/kitbag/balance.ts 200`
// The planning bot plays N seeded runs; prints floors reached, wins, where runs
// end and what killed them, and which gear it finished with.
// Targets: the first fights almost always won, wins ~15-30% (people plan better).
// SEED=n moves the seeds; TUNE=hp:1.1,dmg:0.9 tries other numbers.

import { FLOORS, TUNE, act, enemyDef, floorReached, newRun, scriptFor } from '../../src/kitbag/core';
import { botAction } from './bot';

const n = Number(process.argv[2] ?? 100);
const seed0 = Number(process.env.SEED ?? 1000);
for (const kv of (process.env.TUNE ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  (TUNE as Record<string, number>)[k] = Number(v);
}
const reached: number[] = [];
const scores: number[] = [];
const turns: number[] = [];
const actions: number[] = [];
const endedOn = Array(FLOORS + 1).fill(0);
const killers: Record<string, number> = {};
const gear: Record<string, number> = {};
let wins = 0;
// The House's script per run: [reached, won].
const houseBy: number[][] = (enemyDef('house').scripts ?? []).map(() => [0, 0]);
let firstTwo = 0;
const t0 = performance.now();
for (let k = 0; k < n; k++) {
  const r = newRun(seed0 + k);
  for (let guard = 0; r.phase !== 'over' && guard < 20000; guard++) {
    const a = botAction(r);
    if (!act(r, a)) throw new Error(`bot made an illegal move ${a} on seed ${seed0 + k} at ${r.actions.length}`);
  }
  if (r.floor >= FLOORS - 1) {
    const h = houseBy[scriptFor(r.seed, 'house')];
    h[0]++;
    if (r.won) h[1]++;
  }
  reached.push(floorReached(r));
  scores.push(r.score);
  turns.push(r.stats.turns);
  actions.push(r.actions.length);
  if (r.floor >= 2) firstTwo++;
  if (r.won) wins++;
  else {
    endedOn[floorReached(r)]++;
    killers[r.killedBy ?? '?'] = (killers[r.killedBy ?? '?'] ?? 0) + 1;
  }
  for (const g of r.gear) gear[g.id + (g.up ? '+' : '')] = (gear[g.id + (g.up ? '+' : '')] ?? 0) + 1;
}
const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
const pct = (x: number) => `${Math.round((x / n) * 100)}%`;
console.log(
  `runs ${n}: wins ${wins} (${pct(wins)}), first two fights won ${pct(firstTwo)}, median floor ${med(reached)}, median score ${med(scores)}, median turns ${med(turns)}, actions ${med(actions)}, ${((performance.now() - t0) / n).toFixed(0)} ms/run`,
);
console.log(`ended on floor: ${endedOn.map((c, f) => (c ? `${f}:${c}` : '')).filter(Boolean).join(' ')}`);
console.log('killed by:', Object.entries(killers).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
console.log('The House by script (won/reached):', houseBy.map(([n, w], i) => `${enemyDef('house').scripts![i].name} ${w}/${n} ${n ? Math.round((100 * w) / n) : 0}%`).join(', '));
console.log('gear at the end:', Object.entries(gear).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
