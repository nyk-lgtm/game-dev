// Prints a bot's actions for a whole course: `npx vite-node scripts/ninefold/botround.ts <seed>` (for ?seed=&a=).
import { encodeShot, newRound, play } from '../../src/ninefold/core';
import { bestShot, distanceField } from './bot';
const seed = Number(process.argv[2] ?? 1000);
const r = newRound(seed);
while (!r.over) { const h = r.holes[r.hole]; play(r, encodeShot(bestShot(h, r.ball, distanceField(h), 36))); }
console.log(r.actions.join(','));
