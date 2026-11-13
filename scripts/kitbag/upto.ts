// Bot actions up to a point, for `kitbag/?seed=&a=`:
//   npx vite-node scripts/kitbag/upto.ts <seed> <floorsDone> [phase] [extra]
// stops at the first moment with at least <floorsDone> floors done and the
// given phase (fight, choice, map or over; default fight). `extra` plays that
// many more bot actions (e.g. a few placements into the turn).

import { act, newRun } from '../../src/kitbag/core';
import { botAction } from './bot';

const seed = Number(process.argv[2] ?? 1);
const floors = Number(process.argv[3] ?? 0);
const phase = process.argv[4] ?? 'fight';
let extra = Number(process.argv[5] ?? 0);
const r = newRun(seed);
while (r.phase !== 'over' && !(r.floor >= floors && r.phase === phase)) act(r, botAction(r));
while (extra-- > 0 && r.phase !== 'over') act(r, botAction(r));
console.log(`${r.phase} floor ${r.floor} hp ${r.hp}/${r.maxHp}${r.won ? ' won' : ''}`);
console.log(r.actions.join(','));
