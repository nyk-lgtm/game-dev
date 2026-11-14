// Bot actions up to the moment before wave n is sent, for `hexhold/?seed=&a=&t=`:
// npx vite-node scripts/hexhold/upto.ts <seed> <wave>
import { runGame } from './bot';

const seed = Number(process.argv[2] ?? 100);
const wave = Number(process.argv[3] ?? 10);
const r = runGame(seed);
const toks = r.actions.split(',');
const out: string[] = [];
let sent = 0;
let tick = 0;
for (const t of toks) {
  tick = Number(t.split(':')[0]);
  if (t.endsWith(':W') && ++sent >= wave) break;
  out.push(t);
}
console.log(`?seed=${seed}&a=${out.join(',') || '-'}&t=${tick}`);
