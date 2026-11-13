// Sungrazer step cost: `npx vite-node scripts/sungrazer/bench.ts` (µs per tick, and per clone).
import { cloneRun, newRun, step } from '../../src/sungrazer/core';

const r = newRun(5);
for (let i = 0; i < 300; i++) step(r, true);
console.log(`alive ${r.alive}, tether ${!!r.tether}`);
const base = cloneRun(r);
let t0 = performance.now();
let n = 0;
for (let k = 0; k < 2000; k++) {
  const c = cloneRun(base);
  for (let i = 0; i < 110 && c.alive; i++, n++) step(c, false);
}
const ms = performance.now() - t0;
console.log(`${((ms * 1000) / n).toFixed(2)} µs/tick over ${n} ticks`);
t0 = performance.now();
for (let k = 0; k < 20000; k++) cloneRun(base);
console.log(`${((performance.now() - t0) * 1000 / 20000).toFixed(2)} µs/clone (motes got ${base.got.size})`);
