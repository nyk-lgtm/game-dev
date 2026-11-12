// Where the bot dies, split by map shape: `npx vite-node scripts/hexhold/probe.ts 32`.
import { runGame } from './bot';
import { wavePlan } from '../../src/hexhold/core';

const n = Number(process.argv[2] ?? 32);
const by: Record<string, number[]> = { single: [], twin: [] };
// Lives lost per band of waves, summed over all runs: the shape of the difficulty curve.
const BANDS: [number, number][] = [[1, 3], [4, 7], [8, 10], [11, 14], [15, 20], [21, 25], [26, 30]];
const band = BANDS.map(() => 0);
for (let k = 0; k < n; k++) {
  const seed = 100 + k;
  const r = runGame(seed);
  const kind = r.s.portals.length > 1 ? 'twin' : 'single';
  by[kind].push(r.reached);
  r.lost.forEach((l, w) => (band[BANDS.findIndex(([a, b]) => w + 1 >= a && w + 1 <= b)] += l));
  if (r.s.status !== 'lost') continue;
  const c: Record<string, number> = {};
  for (const id of wavePlan(seed, r.reached)) c[id] = (c[id] ?? 0) + 1;
  console.log(`seed ${seed} ${kind} lost on wave ${r.reached}:`, Object.entries(c).map(([id, m]) => `${id}×${m}`).join(' '));
}
for (const k in by) console.log(k, by[k].sort((a, b) => a - b).join(' '));
console.log('lives lost by waves:', BANDS.map(([a, b], k) => `${a}-${b}: ${band[k]}`).join(', '));
