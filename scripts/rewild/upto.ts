// Prints a bot game's actions up to the end of season N: `npx vite-node scripts/rewild/upto.ts <seed> <N>`.
import { run } from './bot';
const [seed, n] = [Number(process.argv[2] ?? 1007), Number(process.argv[3] ?? 6)];
const toks = run(seed).actions.split(',');
let ends = 0;
const out: string[] = [];
for (const t of toks) {
  out.push(t);
  if (t === 'E' && ++ends >= n) break;
}
console.log(out.join(','));
