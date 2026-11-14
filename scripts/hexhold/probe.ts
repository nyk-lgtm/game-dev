// Where the bot dies, split by map shape: `npx vite-node scripts/hexhold/probe.ts 32`.
// Also the gold it banks per band of waves and what was still there to spend it on
// (open cells, upgrades and specializations left), and the gold left unspent at the end.
import { runGame } from './bot';
import { wavePlan } from '../../src/hexhold/core';

const n = Number(process.argv[2] ?? 32);
// CAP=14: the bot stops building at 14 towers and only upgrades (a player who coasts on a small maze);
// EXPAND=1 with it: once all of them are maxed and specialized it builds again (spends the surplus).
const CAP = Number(process.env.CAP ?? Infinity);
const EXPAND = !!process.env.EXPAND;
const by: Record<string, number[]> = { single: [], twin: [] };
// Lives lost per band of waves, summed over all runs: the shape of the difficulty curve.
const BANDS: [number, number][] = [[1, 3], [4, 7], [8, 10], [11, 14], [15, 20], [21, 25], [26, 30]];
const band = BANDS.map(() => 0);
const banked = BANDS.map(() => [] as number[]);
const cells = BANDS.map(() => [] as number[]);
const left = BANDS.map(() => [] as number[]);
const ends: string[] = [];
// The early curve wave by wave (a first-timer's waves): lives lost and runs that lost any.
const early = new Array(12).fill(0);
const earlyRuns = new Array(12).fill(0);
const bandOf = (w: number) => BANDS.findIndex(([a, b]) => w >= a && w <= b);
for (let k = 0; k < n; k++) {
  const seed = 100 + k;
  const r = runGame(seed, 1, CAP, EXPAND);
  const kind = r.s.portals.length > 1 ? 'twin' : 'single';
  by[kind].push(r.s.status === 'won' ? 31 : r.reached);
  r.lost.forEach((l, w) => (band[bandOf(w + 1)] += l));
  r.lost.slice(0, 12).forEach((l, w) => ((early[w] += l), (earlyRuns[w] += l > 0 ? 1 : 0)));
  r.banked.forEach((g, w) => {
    banked[bandOf(w + 1)].push(g);
    cells[bandOf(w + 1)].push(r.room[w].cells);
    left[bandOf(w + 1)].push(r.room[w].upGold);
  });
  const last = r.room[r.room.length - 1];
  ends.push(`${r.s.status === 'won' ? 'W' : r.reached} ${r.s.gold}g/${last.cells}c/${last.upGold}u`);
  if (r.s.status !== 'lost') continue;
  const c: Record<string, number> = {};
  for (const id of wavePlan(seed, r.reached)) c[id] = (c[id] ?? 0) + 1;
  console.log(`seed ${seed} ${kind} lost on wave ${r.reached}:`, Object.entries(c).map(([id, m]) => `${id}×${m}`).join(' '));
}
for (const k in by) console.log(k, by[k].sort((a, b) => a - b).join(' '));
const all = [...by.single, ...by.twin].sort((a, b) => a - b);
console.log(`median wave (31 = won) ${all[n >> 1]}, wins ${ends.filter((e) => e[0] === 'W').length}/${n}`);
console.log('lives lost by waves:', BANDS.map(([a, b], k) => `${a}-${b}: ${band[k]}`).join(', '));
const q = (a: number[], f: number) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * f)] ?? 0;
console.log('waves 1-12, lives lost / runs that lost any:', early.map((l, w) => `${w + 1}:${l}/${earlyRuns[w]}`).join(' '));
console.log('as a wave is sent: gold banked (median / p90), open cells, gold of upgrades+specs left (medians):');
BANDS.forEach(([a, b], k) =>
  console.log(`  ${a}-${b}: ${q(banked[k], 0.5)} / ${q(banked[k], 0.9)} gold, ${q(cells[k], 0.5)} cells, ${q(left[k], 0.5)} to upgrade`),
);
console.log('end of run (wave or W: gold unspent / open cells / upgrade gold left):', ends.join(', '));
