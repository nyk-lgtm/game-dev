// Ninefold balance probe: `npx vite-node scripts/ninefold/balance.ts 6`
// A search bot plays N courses; prints its strokes against par per hole number.
// With NOISE=0.05 the bot's aim and power wobble a little, like a person's. DAILY=1 plays daily-picked courses
// (`dailyCourseSeed`), SEED=n moves the seed set; it also prints strokes against par per hole shape.

import { HOLES, dailyCourseSeed, encodeShot, newRound, play, toPar } from '../../src/ninefold/core';
import { Rng } from '../../src/shared/rng';
import { bestShot, distanceField } from './bot';

const n = Number(process.argv[2] ?? 6);
const noise = Number(process.env.NOISE ?? 0.04);
const rng = new Rng(7);
const byHole: number[][] = [...Array(HOLES)].map(() => []);
const pars: number[][] = [...Array(HOLES)].map(() => []);
const totals: number[] = [];
const byShape: Record<string, number[]> = {};
const daily = !!process.env.DAILY;
const base = Number(process.env.SEED ?? 1000);
const t0 = performance.now();
for (let k = 0; k < n; k++) {
  const seed = daily ? dailyCourseSeed(base + k) : base + k;
  const r = newRound(seed);
  let field = distanceField(r.holes[0]);
  let cur = 0;
  while (!r.over) {
    if (r.hole !== cur) {
      cur = r.hole;
      field = distanceField(r.holes[cur]);
    }
    const s = bestShot(r.holes[cur], r.ball, field);
    s.angle += (rng.next() - 0.5) * 2 * noise;
    s.power = Math.min(1, Math.max(0.05, s.power * (1 + (rng.next() - 0.5) * 2 * noise)));
    const h = r.hole;
    const res = play(r, encodeShot(s))!;
    if (res.finished) {
      byHole[h].push(r.strokes[h]);
      pars[h].push(r.holes[h].par);
      (byShape[r.holes[h].shape] ??= []).push(r.strokes[h] - r.holes[h].par);
    }
  }
  totals.push(toPar(r));
  console.log(`course ${seed}: ${r.strokes.join(' ')} (par ${r.holes.map((h) => h.par).join(' ')}) → ${toPar(r)}`);
}
const avg = (a: number[]) => (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2);
for (let h = 0; h < HOLES; h++) console.log(`hole ${h + 1}: strokes ${avg(byHole[h])}, par ${avg(pars[h])}`);
for (const [k, v] of Object.entries(byShape)) console.log(`${k}: ${v.length} holes, strokes − par ${avg(v)}`);
console.log(`to par: mean ${avg(totals)}, median ${totals.sort((a, b) => a - b)[Math.floor(n / 2)]}, ${((performance.now() - t0) / n / 1000).toFixed(1)} s/course`);
