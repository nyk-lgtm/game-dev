// Where the bot dies, split by map shape: `npx vite-node scripts/hexhold/probe.ts 32`.
import { runGame } from './bot';
import { wavePlan } from '../../src/hexhold/core';

const n = Number(process.argv[2] ?? 32);
const by: Record<string, number[]> = { single: [], twin: [] };
for (let k = 0; k < n; k++) {
  const seed = 100 + k;
  const r = runGame(seed);
  const kind = r.s.portals.length > 1 ? 'twin' : 'single';
  by[kind].push(r.reached);
  if (r.s.status !== 'lost') continue;
  const c: Record<string, number> = {};
  for (const id of wavePlan(seed, r.reached)) c[id] = (c[id] ?? 0) + 1;
  console.log(`seed ${seed} ${kind} lost on wave ${r.reached}:`, Object.entries(c).map(([id, m]) => `${id}×${m}`).join(' '));
}
for (const k in by) console.log(k, by[k].sort((a, b) => a - b).join(' '));
