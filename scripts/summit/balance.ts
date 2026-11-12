// Summit balance probe: `npx vite-node scripts/summit/balance.ts 200`
// The greedy bot plays N seeded runs; prints floors reached, wins, score and
// which charms it took. Targets: floors 1-2 almost always cleared, median
// floor ~5, wins 10-20% (people plan better than this bot).
// DRAWS=36,20,18,... tries other per-floor draw allotments; SEED=n moves the seeds;
// CHARM=mirror starts every run holding that charm (a fair way to compare charms).

import { DEAL_DRAWS, FLOORS, TUNE, act, floorReached, newRun, startAt, type CharmId } from '../../src/summit/core';
import { botAction } from './bot';

const n = Number(process.argv[2] ?? 100);
const seed0 = Number(process.env.SEED ?? 1000);
if (process.env.DRAWS) process.env.DRAWS.split(',').forEach((v, i) => (DEAL_DRAWS[i] = Number(v)));
// TUNE=mirrors:1,flags:2 tries other charm strengths.
for (const kv of (process.env.TUNE ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  (TUNE as Record<string, number>)[k] = Number(v);
}
const reached: number[] = [];
const scores: number[] = [];
const clearedAt = Array(FLOORS).fill(0);
const ended = Array(FLOORS).fill(0);
const charmRuns: Record<string, { n: number; floors: number }> = {};
let wins = 0;
const t0 = performance.now();
for (let k = 0; k < n; k++) {
  const r = process.env.CHARM ? startAt(seed0 + k, 0, [process.env.CHARM as CharmId]) : newRun(seed0 + k);
  while (r.phase !== 'over') if (!act(r, botAction(r))) throw new Error(`bot made an illegal move on seed ${seed0 + k}`);
  reached.push(floorReached(r));
  scores.push(r.score);
  for (let f = 0; f < r.cleared; f++) clearedAt[f]++;
  if (r.won) wins++;
  else ended[r.floor]++;
  for (const c of r.charms) {
    charmRuns[c] ??= { n: 0, floors: 0 };
    charmRuns[c].n++;
    charmRuns[c].floors += r.cleared;
  }
}
const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(`${process.env.CHARM ? `${process.env.CHARM} · ` : ''}draws ${DEAL_DRAWS.join(',')} · runs ${n}: median floor ${med(reached)}, wins ${wins} (${Math.round((wins / n) * 100)}%), median score ${med(scores)}, ${((performance.now() - t0) / n).toFixed(1)} ms/run`);
console.log(`cleared floor: ${clearedAt.map((c, f) => `${f + 1}:${Math.round((c / n) * 100)}%`).join(' ')}`);
console.log(`lost on floor: ${ended.map((c, f) => `${f + 1}:${c}`).join(' ')}`);
console.log(
  'charms (runs taken, avg floors cleared):',
  Object.entries(charmRuns)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([c, v]) => `${c} ${v.n}/${(v.floors / v.n).toFixed(1)}`)
    .join(', '),
);
