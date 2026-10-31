// Tune the smart bot's own knobs (so balance is measured against a bot that
// plays its best). Run: npx vite-node scripts/glyph/sweep.ts [runs]
import { runGame } from './bot';
import { smartPlayer, type SmartOptions } from './smart';

const runs = Number(process.argv[2] ?? 30);

function score(o: SmartOptions): { wins: number; avg: number } {
  let wins = 0;
  let sum = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const r = runGame(seed, smartPlayer(o));
    if (r.won) wins++;
    sum += r.won ? 16 : r.reached;
  }
  return { wins, avg: sum / runs };
}

const grid: Record<keyof Pick<SmartOptions, 'reserve' | 'maxRerolls' | 'tauFree' | 'tauReserve'>, number[]> = {
  reserve: [5, 10, 15],
  maxRerolls: [2, 4, 6, 10, 16],
  tauFree: [0.001, 0.002, 0.004, 0.008],
  tauReserve: [0.01, 0.02, 0.03, 0.06],
};
const best: SmartOptions = { reserve: 10, maxRerolls: 10, tauFree: 0.004, tauReserve: 0.01, threatSpend: 3 };
let bs = score(best);
console.log('start', JSON.stringify(best), bs);
for (let pass = 0; pass < 2; pass++)
  for (const k of Object.keys(grid) as (keyof typeof grid)[])
    for (const v of grid[k]) {
      if (best[k] === v) continue;
      const o = { ...best, [k]: v };
      const sc = score(o);
      const better = sc.avg + sc.wins / runs > bs.avg + bs.wins / runs;
      console.log(`  ${k}=${v}: wins ${sc.wins} avg ${sc.avg.toFixed(2)}${better ? ' *' : ''}`);
      if (better) {
        best[k] = v;
        bs = sc;
      }
    }
console.log('best', JSON.stringify(best), bs);
