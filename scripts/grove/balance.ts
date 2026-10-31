// Grove balance probe: the greedy bot plays many games; report length, score
// and the best plant reached. Run: npx vite-node scripts/grove/balance.ts [games]
import { PLANT_NAMES } from '../../src/grove/core';
import { playGreedy } from './bot';

const games = Number(process.argv[2] ?? 100);
const scores: number[] = [];
const turns: number[] = [];
const tiers = new Map<number, number>();
for (let i = 1; i <= games; i++) {
  const { state } = playGreedy(i);
  scores.push(state.score);
  turns.push(state.turn);
  tiers.set(state.bestTier, (tiers.get(state.bestTier) ?? 0) + 1);
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[xs.length >> 1];
console.log(`games=${games} median score=${med(scores)} median turns=${med(turns)} max score=${Math.max(...scores)}`);
console.log([...tiers].sort((a, b) => a[0] - b[0]).map(([t, n]) => `${PLANT_NAMES[t]}:${n}`).join(' '));
