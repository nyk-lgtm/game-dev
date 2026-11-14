// Prints a bot's actions for a course: `npx vite-node scripts/ninefold/botround.ts <seed> [holes]` (for ?seed=&a=);
// with `holes` it stops once that many holes are done (to open a round on a given hole).
import { HOLES, encodeShot, newRound, play } from '../../src/ninefold/core';
import { bestShot, distanceField } from './bot';
const seed = Number(process.argv[2] ?? 1000);
const upTo = Number(process.argv[3] ?? HOLES);
const r = newRound(seed);
while (!r.over && r.hole < upTo) { const h = r.holes[r.hole]; play(r, encodeShot(bestShot(h, r.ball, distanceField(h), 36))); }
console.log(r.actions.join(','));
