// Simmer: a bot season's actions up to night n, for `simmer/?seed=&a=`.
// `npx vite-node scripts/simmer/upto.ts <seed> <nights> [strategy]`

import { newRun } from '../../src/simmer/core';
import { STRATS, planDay } from './bot';

const seed = Number(process.argv[2] ?? 1);
const nights = Number(process.argv[3] ?? 5);
const r = newRun(seed);
while (!r.over && r.day < nights) planDay(r, STRATS[process.argv[4] ?? 'clever']);
console.log(`?seed=${seed}&a=${r.actions.join(',')}`);
