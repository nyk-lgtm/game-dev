// npx vite-node scripts/rewild/actions.ts <seed> [seasons] — greedy bot action string (for ?seed=&a= links).
import { run } from './bot';
const seed = +(process.argv[2] ?? 1007);
const seasons = +(process.argv[3] ?? 99);
const toks = run(seed, 'greedy', 1).actions.split(',');
const out: string[] = [];
let ends = 0;
for (const t of toks) {
  if (ends >= seasons) break;
  out.push(t);
  if (t === 'E') ends++;
}
console.log(out.join(','));
