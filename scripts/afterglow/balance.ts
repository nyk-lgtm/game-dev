// Afterglow balance probe. Run: npx vite-node scripts/afterglow/balance.ts [runs] [character]
import { playBot } from './bot';

const runs = Number(process.argv[2] ?? 12);
const character = process.argv[3] ?? 'spark';
const rows: string[] = [];
const times: number[] = [];
let wins = 0;
const t0 = Date.now();
for (let i = 1; i <= runs; i++) {
  const { w, peak } = playBot(i, character);
  times.push(w.time);
  if (w.status === 'won') wins++;
  const build = w.weapons.map((x) => `${x.id}${x.level}`).join(',');
  rows.push(`seed ${i}: ${w.status} at ${(w.time / 60).toFixed(1)}m lvl ${w.player.level} kills ${w.kills} peak ${peak} [${build}]`);
}
times.sort((a, b) => a - b);
console.log(rows.join('\n'));
console.log(`median survival ${(times[runs >> 1] / 60).toFixed(1)}m, wins ${wins}/${runs}, ${((Date.now() - t0) / runs / 1000).toFixed(1)}s per run`);
