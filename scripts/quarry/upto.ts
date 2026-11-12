// Prints a bot run's actions up to the start of depth n (1-based; 99 = the whole
// run), ready for `quarry/?seed=<seed>&a=<actions>`:
//   npx vite-node scripts/quarry/upto.ts <seed> <n> [human|best]

import { Dict, act, newRun } from '../../src/quarry/core';
import { PACKED } from '../../src/quarry/core/words';
import { botAction, type BotMode } from './bot';

const seed = Number(process.argv[2] ?? 1);
const upto = Number(process.argv[3] ?? 99);
const mode = (process.argv[4] ?? 'human') as BotMode;
const dict = new Dict(PACKED);
const r = newRun(seed, dict);
while (r.phase !== 'over' && !(r.phase === 'play' && r.depth + 1 >= upto && r.played === 0 && r.depth > 0)) {
  if (!act(r, botAction(r, dict, { mode }), dict)) break;
}
console.log(r.actions.join(','));
console.error(`depth ${r.depth + 1}, phase ${r.phase}, score ${r.score}, ${r.actions.length} actions`);
