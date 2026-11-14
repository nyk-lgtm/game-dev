// Ninefold hole shapes: `npx vite-node scripts/ninefold/shapes.ts 200` counts corridor/green/split holes per
// hole number and par spread over N courses (rules v8), and how far par rounds from its fitted estimate.
import { HOLES, makeCourse } from '../../src/ninefold/core';

const n = Number(process.argv[2] ?? 200);
const count: Record<string, number[]> = { corridor: Array(HOLES).fill(0), green: Array(HOLES).fill(0), split: Array(HOLES).fill(0) };
const pars: number[] = [];
let slack = 0, mills = 0;
for (let s = 1; s <= n; s++)
  for (const h of makeCourse(s)) {
    count[h.shape][h.n]++;
    pars.push(h.par);
    slack += h.par - h.rawPar;
    mills += h.mills.length;
  }
for (const k of Object.keys(count)) console.log(`${k.padEnd(9)} ${count[k].map((v) => String(v).padStart(4)).join(' ')}`);
console.log(`par mean ${(pars.reduce((a, b) => a + b, 0) / n).toFixed(2)} a course; par − estimate ${(slack / n).toFixed(2)} a course; mills ${(mills / n).toFixed(2)}`);
