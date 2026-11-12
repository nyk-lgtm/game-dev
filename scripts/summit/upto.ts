// `npx vite-node scripts/summit/upto.ts <seed> <floor> [moves]`
// The bot's actions until it reaches floor <floor> (1-based), plus [moves] more,
// for `summit/?seed=&a=`. A floor past 8 plays the whole run. A negative
// [moves] stops at the charm pick before that floor.

import { FLOORS, act, newRun } from '../../src/summit/core';
import { botAction } from './bot';

const seed = Number(process.argv[2] ?? 1);
const floor = Number(process.argv[3] ?? 2) - 1;
const moves = Number(process.argv[4] ?? 0);
const r = newRun(seed);
while (r.phase !== 'over' && r.floor < Math.min(floor, FLOORS)) {
  if (moves < 0 && r.phase === 'charm' && r.floor === floor - 1) break;
  act(r, botAction(r));
}
for (let k = 0; k < moves && r.phase !== 'over'; k++) act(r, botAction(r));
console.error(`floor ${r.floor + 1}, phase ${r.phase}, charms ${r.charms.join(' ') || '-'}, score ${r.score}`);
console.log(r.actions.join(','));
