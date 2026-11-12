// Traces the bot on one hole: `npx vite-node scripts/ninefold/trace.ts <seed> <hole 1-9>`.
import { encodeShot, makeHole, simulate } from '../../src/ninefold/core';
import { bestShot, distanceField } from './bot';

const seed = Number(process.argv[2] ?? 1000), n = Number(process.argv[3] ?? 1) - 1;
const hole = makeHole(seed, n);
console.log(`par ${hole.par}, tee ${JSON.stringify(hole.tee)}, cup ${JSON.stringify(hole.cup)}`);
console.log('posts', JSON.stringify(hole.posts), '\nzones', JSON.stringify(hole.zones));
const field = distanceField(hole);
let ball = { ...hole.tee };
for (let k = 0; k < 8; k++) {
  const s = bestShot(hole, ball, field);
  const r = simulate(hole, ball, s);
  console.log(`shot ${encodeShot(s)} from ${ball.x.toFixed(1)},${ball.y.toFixed(1)} → ${r.outcome} ${r.x.toFixed(1)},${r.y.toFixed(1)} field ${field[Math.floor(r.y) * 96 + Math.floor(r.x)]}`);
  if (r.outcome === 'sunk') break;
  if (r.outcome === 'rest') ball = { x: r.x, y: r.y };
}
