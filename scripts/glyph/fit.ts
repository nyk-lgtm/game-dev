// Fit the smart bot's damage-model weights (smart.ts `W`) to ground truth:
// real leak counts for every caster × modifier triple (as in probe.ts).
// Run: npx vite-node scripts/glyph/fit.ts [--fresh]
// Leak data is cached in /tmp/glyph-fit.json (pass --fresh after rule changes).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { CASTERS, MODS, finishBattle, newGame, startBattle, type ModId, type Rune } from '../../src/glyph/core';
import { Evaluator, W, profileFor } from './smart';

const CACHE = '/tmp/glyph-fit.json';
const ORDER: ModId[] = ['heavy', 'split', 'pierce', 'fire', 'storm', 'frost', 'haste', 'leech', 'gild', 'echo'];
const STD = [{ id: 'bolt', tier: 1 }, null, null, null] as (Rune | null)[];
const SETS: { ct: 1 | 2 | 3; mt: 1 | 2 | 3; waves: number[] }[] = [
  { ct: 1, mt: 1, waves: [6, 9, 12] },
  { ct: 2, mt: 1, waves: [9, 12, 15] },
  { ct: 2, mt: 2, waves: [12, 15] },
];
const SEEDS = [1, 2];

interface Case {
  row: Rune[];
  set: number;
  leak: number;
}

function leak(row: Rune[], wave: number, seed: number): number {
  const s = newGame(seed);
  s.wave = wave;
  s.hp = s.maxHp = 1e6;
  s.loom = [row, STD, STD].map((r) => r.map((x) => x && { ...x }));
  startBattle(s);
  finishBattle(s);
  return s.battle!.leaked;
}

function build(): Case[] {
  const cases: Case[] = [];
  SETS.forEach(({ ct, mt, waves }, set) => {
    for (const c of CASTERS)
      for (let a = 0; a < MODS.length; a++)
        for (let b = a; b < MODS.length; b++)
          for (let d = b; d < MODS.length; d++) {
            const mods = [MODS[a], MODS[b], MODS[d]].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
            const row: Rune[] = [{ id: c, tier: ct }, ...mods.map((m) => ({ id: m, tier: mt }))];
            let l = 0;
            for (const seed of SEEDS) for (const w of waves) l += leak(row, w, seed);
            cases.push({ row, set, leak: l });
          }
    console.log(`set ${set} done`);
  });
  return cases;
}

const cases: Case[] = !process.argv.includes('--fresh') && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : build();
writeFileSync(CACHE, JSON.stringify(cases));

const evs = SETS.map(({ waves }) =>
  SEEDS.flatMap((seed) =>
    waves.map((w) => {
      const g = newGame(seed);
      g.wave = w;
      return { g, P: profileFor(seed, w) };
    }),
  ),
);

function rank(xs: number[]): number[] {
  const o = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
  const out = new Array<number>(xs.length);
  // Average ranks for ties.
  for (let i = 0; i < o.length; ) {
    let j = i;
    while (j + 1 < o.length && o[j + 1][0] === o[i][0]) j++;
    for (let k = i; k <= j; k++) out[o[k][1]] = (i + j) / 2;
    i = j + 1;
  }
  return out;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  return num / Math.sqrt(da * db || 1);
}

function score(): number {
  let total = 0;
  SETS.forEach((_, set) => {
    const cs = cases.filter((c) => c.set === set);
    const model = cs.map((c) => {
      let v = 0;
      for (const { g, P } of evs[set]) v += new Evaluator(P, g, {}).loom([c.row, STD, STD]);
      return -v;
    });
    total += pearson(rank(cs.map((c) => c.leak)), rank(model));
  });
  return total / SETS.length;
}

const keys = Object.keys(W) as (keyof typeof W)[];
let best = score();
console.log(`start rho ${best.toFixed(4)}`, JSON.stringify(W));
for (let pass = 0; pass < 3; pass++)
  for (const k of keys)
    for (const f of [0.5, 0.75, 1.33, 2]) {
      const old = W[k];
      W[k] = old * f;
      const sc = score();
      if (sc > best + 1e-4) {
        best = sc;
        console.log(`  ${k} ${old.toFixed(3)} -> ${W[k].toFixed(3)}: rho ${sc.toFixed(4)}`);
      } else W[k] = old;
    }
console.log(`final rho ${best.toFixed(4)}`, JSON.stringify(Object.fromEntries(keys.map((k) => [k, +W[k].toFixed(3)]))));
