// Ninefold par fit: `NOISE=0.06 npx vite-node scripts/ninefold/fit.ts 45 [seedBase] > rows.json` plays N courses
// with the wobbly search bot and prints one row per hole (strokes and the features par is fitted on);
// `fit.ts solve a.json b.json …` least-squares fits strokes ≈ a·length + b·obstacles + c·turns + d·green + e·split
// and says where the rounded par would sit against the bot.
import { readFileSync } from 'node:fs';
import { encodeShot, newRound, play } from '../../src/ninefold/core';
import { Rng } from '../../src/shared/rng';
import { bestShot, distanceField } from './bot';

type Row = { s: number; len: number; inWay: number; turns: number; green: number; split: number; mills: number; par: number };
const FEATS = ['len', 'inWay', 'turns', 'green', 'split'] as const;

if (process.argv[2] === 'solve') {
  const rows: Row[] = process.argv.slice(3).flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));
  // Normal equations, no intercept (par is a sum of costs).
  const k = FEATS.length;
  const A = [...Array(k)].map(() => Array(k + 1).fill(0));
  for (const r of rows)
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) A[i][j] += r[FEATS[i]] * r[FEATS[j]];
      A[i][k] += r[FEATS[i]] * r.s;
    }
  for (let i = 0; i < k; i++) {
    const p = A[i][i];
    for (let j = i; j <= k; j++) A[i][j] /= p;
    for (let m = 0; m < k; m++)
      if (m !== i) {
        const f = A[m][i];
        for (let j = i; j <= k; j++) A[m][j] -= f * A[i][j];
      }
  }
  const w = A.map((row) => row[k]);
  console.log(`${rows.length} holes: strokes ≈ ${FEATS.map((f, i) => `${w[i].toFixed(3)}·${f}`).join(' + ')}`);
  let fitted = 0, now = 0;
  for (const r of rows) {
    fitted += r.s - Math.max(2, Math.min(5, Math.round(FEATS.reduce((a, f, i) => a + w[i] * r[f], 0))));
    now += r.s - r.par;
  }
  console.log(`bot strokes − par a round: with this fit ${((fitted / rows.length) * 9).toFixed(2)}, with the current par ${((now / rows.length) * 9).toFixed(2)}`);
} else {
  const n = Number(process.argv[2] ?? 45);
  const base = Number(process.argv[3] ?? 3000);
  const noise = Number(process.env.NOISE ?? 0.06);
  const rng = new Rng(base);
  const rows: Row[] = [];
  for (let c = 0; c < n; c++) {
    const r = newRound(base + c);
    let cur = 0;
    let field = distanceField(r.holes[0]);
    while (!r.over) {
      if (r.hole !== cur) field = distanceField(r.holes[(cur = r.hole)]);
      const h = r.holes[cur];
      const s = bestShot(h, r.ball, field);
      s.angle += (rng.next() - 0.5) * 2 * noise;
      s.power = Math.min(1, Math.max(0.05, s.power * (1 + (rng.next() - 0.5) * 2 * noise)));
      const res = play(r, encodeShot(s))!;
      if (res.finished)
        rows.push({ s: r.strokes[cur], len: h.path.length, inWay: h.inWay, turns: h.turns, green: +(h.shape === 'green'), split: +(h.shape === 'split'), mills: h.mills.length, par: h.par });
    }
  }
  console.log(JSON.stringify(rows));
}
