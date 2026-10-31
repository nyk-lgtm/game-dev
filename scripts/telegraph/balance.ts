// Balance probe: the greedy bot plays many runs and we report how deep it
// gets. Run: npx vite-node scripts/balance.ts [runs]
import { playGreedy } from './bot';

const runs = Number(process.argv[2] ?? 300);
const depths: number[] = [];
let turns = 0;
for (let i = 1; i <= runs; i++) {
  const { state } = playGreedy(i);
  depths.push(state.depth);
  turns += state.turn;
}
depths.sort((a, b) => a - b);
const hist = new Map<number, number>();
for (const d of depths) hist.set(d, (hist.get(d) ?? 0) + 1);
console.log(`runs=${runs} median depth=${depths[runs >> 1]} mean=${(depths.reduce((a, b) => a + b, 0) / runs).toFixed(2)} max=${depths.at(-1)} avg turns=${(turns / runs).toFixed(0)}`);
console.log([...hist].map(([d, n]) => `d${d}:${n}`).join(' '));
