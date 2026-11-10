// npx vite-node scripts/hexhold/balance.ts [runs]
import { runGame } from './bot';
const n = +(process.argv[2] ?? 12);
const res = [];
for (let k = 0; k < n; k++) res.push(runGame(100 + k));
const reached = res.map((r) => (r.s.status === 'won' ? 31 : r.reached)).sort((a, b) => a - b);
console.log('waves reached:', reached.join(' '));
console.log(`median ${reached[n >> 1]}, wins ${res.filter((r) => r.s.status === 'won').length}/${n}, lives left (winners) ${res.filter((r) => r.s.status === 'won').map((r) => r.s.lives).join(' ')}`);
const dealt: Record<string, number> = {};
for (const r of res) for (const [k, v] of Object.entries(r.s.stats.dealt)) dealt[k] = (dealt[k] ?? 0) + v!;
const tot = Object.values(dealt).reduce((a, b) => a + b, 0);
console.log('damage share:', Object.entries(dealt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Math.round((100 * v) / tot)}%`).join(', '));
