// Lull probe: what a garden sounds like over a day.
//   npx vite-node scripts/lull/probe.ts [seed] [plants]
// Prints the weather spells, then for a garden filled with `plants` random grown
// plants: notes per step (by cause), the busiest step, notes per species, and how
// many bees / fireflies / frogs are out through the day.

import { Rng } from '../../src/shared/rng';
import {
  BEE, DAY, FLY, FROG, MAX_PLANTS, ROWS, SPECIES, SPELL, START, XS, apply, critterCount, dayTime, encode, newGarden, notesAt, spellKind,
  type Why,
} from '../../src/lull/core';

const seed = Number(process.argv[2] ?? 1);
const want = Math.min(MAX_PLANTS, Number(process.argv[3] ?? MAX_PLANTS));

console.log(`seed ${seed}: weather spells (half days) ${Array.from({ length: 12 }, (_, w) => spellKind(seed, w)).join(' ')}`);
const firsts: Record<string, number> = {};
for (let w = 0; w < 200; w++) firsts[spellKind(seed, w)] ??= w * SPELL;
console.log(`first step of each: ${Object.entries(firsts).map(([k, s]) => `${k} ${s}`).join(', ')}`);

const g = newGarden(seed);
const r = new Rng(seed ^ 0x9e0);
for (let i = 0; i < 5000 && g.plants.length < want; i++) apply(g, { t: START, k: 'P', sp: r.int(0, SPECIES.length - 1), x: r.int(0, XS - 1), y: r.int(0, ROWS - 1) });
for (const p of g.plants) p.born -= 1000;
console.log(`${g.plants.length} plants: ${SPECIES.map((s, i) => `${s.name} ${g.plants.filter((p) => p.sp === i).length}`).join(', ')}`);
console.log(`code ${encode(g)}`);

const by: Record<Why, number> = { song: 0, visit: 0, gust: 0, drip: 0, strum: 0 };
const perSp = SPECIES.map(() => 0);
let busiest = 0;
let total = 0;
const from = DAY;
for (let s = from; s < from + DAY; s++) {
  const ns = notesAt(g, s);
  busiest = Math.max(busiest, ns.length);
  total += ns.length;
  for (const n of ns) {
    by[n.why]++;
    if (n.i >= 0) perSp[g.plants[n.i].sp]++;
  }
}
console.log(`day 2: ${(total / DAY).toFixed(2)} notes a step (${((total / DAY) * 16).toFixed(1)} a bar), busiest step ${busiest}`);
console.log(`by cause: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`by species: ${SPECIES.map((s, i) => `${s.name} ${perSp[i]}`).join(', ')}`);
const line: string[] = [];
for (let k = 0; k < 12; k++) {
  const s = from + Math.round((k / 12) * DAY);
  line.push(`${dayTime(s).phase.padEnd(5)} bees ${critterCount(g, BEE, s)} flies ${critterCount(g, FLY, s)} frog ${critterCount(g, FROG, s)}`);
}
console.log(line.join('\n'));
