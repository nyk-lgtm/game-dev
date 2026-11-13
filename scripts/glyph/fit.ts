// Fit the smart bot's damage-model weights (smart.ts `W`) to ground truth:
// real leak counts for every caster × modifier triple (as in probe.ts) and for
// 1500 random whole looms on late waves (the bot picks looms; this set counts
// half). Coordinate search on Spearman rho; prints per-set rho.
// Run: npx vite-node scripts/glyph/fit.ts [--fresh]
// Leak data is cached in /tmp/glyph-fit-v3.json (pass --fresh after rule changes).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { CASTERS, MODS, Rng, finishBattle, mixSeed, newGame, startBattle, type ModId, type Rune } from '../../src/glyph/core';
import { Evaluator, W, profileFor } from './smart';

const CACHE = '/tmp/glyph-fit-v3.json';
const ORDER: ModId[] = ['heavy', 'split', 'pierce', 'fire', 'storm', 'frost', 'haste', 'leech', 'gild', 'echo'];
const STD = [{ id: 'bolt', tier: 1 }, null, null, null] as (Rune | null)[];
// Row sets: every caster × modifier triple in row 1, two plain bolts beside it
// (as in probe.ts). Loom set: whole random looms on late waves, where a loom
// has to cover every kind of foe (Drakes shrug off Fire and fly over Novas).
const SETS: { ct: 1 | 2 | 3; mt: 1 | 2 | 3; waves: number[]; looms?: number }[] = [
  { ct: 1, mt: 1, waves: [6, 9, 12] },
  { ct: 2, mt: 1, waves: [9, 12, 15] },
  { ct: 2, mt: 2, waves: [12, 15] },
  { ct: 2, mt: 2, waves: [10, 12, 14], looms: 1500 },
];
const SEEDS = [1, 2];

interface Case {
  loom: (Rune | null)[][];
  set: number;
  leak: number;
}

function leak(loom: (Rune | null)[][], wave: number, seed: number): number {
  const s = newGame(seed);
  s.wave = wave;
  s.hp = s.maxHp = 1e6;
  s.loom = loom.map((r) => r.map((x) => x && { ...x }));
  startBattle(s);
  finishBattle(s);
  return s.battle!.leaked;
}

function build(): Case[] {
  const cases: Case[] = [];
  const add = (loom: (Rune | null)[][], set: number) => {
    let l = 0;
    for (const seed of SEEDS) for (const w of SETS[set].waves) l += leak(loom, w, seed);
    cases.push({ loom, set, leak: l });
  };
  SETS.forEach(({ ct, mt, looms }, set) => {
    if (looms) {
      // Random looms: casters tier 2 or 3, three modifiers each (tier 1 or 2).
      const rng = new Rng(mixSeed(77, set));
      for (let n = 0; n < looms; n++)
        add(
          [0, 1, 2].map(() => {
            const mods = [0, 1, 2].map(() => rng.pick(MODS)).sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
            return [{ id: rng.pick(CASTERS), tier: rng.int(ct, 3) as 2 | 3 }, ...mods.map((m) => ({ id: m, tier: rng.int(1, mt) as 1 | 2 }))];
          }),
          set,
        );
    } else
      for (const c of CASTERS)
        for (let a = 0; a < MODS.length; a++)
          for (let b = a; b < MODS.length; b++)
            for (let d = b; d < MODS.length; d++) {
              const mods = [MODS[a], MODS[b], MODS[d]].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
              add([[{ id: c, tier: ct }, ...mods.map((m) => ({ id: m, tier: mt }))], STD, STD], set);
            }
    console.log(`set ${set} done`);
  });
  return cases;
}

const cases: Case[] = !process.argv.includes('--fresh') && existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : build();
writeFileSync(CACHE, JSON.stringify(cases));

// The model is judged against the exact wave it faces (no lookahead blend).
const evs = SETS.map(({ waves }) =>
  SEEDS.flatMap((seed) =>
    waves.map((w) => {
      const g = newGame(seed);
      g.wave = w;
      return { g, P: profileFor(seed, w, 0) };
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

const bySet = SETS.map((_, set) => cases.filter((c) => c.set === set));
const leakRanks = bySet.map((cs) => rank(cs.map((c) => c.leak)));

/** Spearman rho per set (model value vs leak); the fit maximizes their mean. */
function rhos(): number[] {
  return SETS.map((_, set) => {
    const model = bySet[set].map((c) => {
      let v = 0;
      for (const { g, P } of evs[set]) v += new Evaluator(P, g, {}).loom(c.loom);
      return -v;
    });
    return pearson(leakRanks[set], rank(model));
  });
}
// The bot picks whole looms, so the loom set counts as much as the row sets together.
const score = () => {
  const r = rhos();
  const rows = r.filter((_, i) => !SETS[i].looms);
  const looms = r.filter((_, i) => SETS[i].looms);
  return (rows.reduce((a, b) => a + b, 0) / rows.length + looms.reduce((a, b) => a + b, 0) / looms.length) / 2;
};

const keys = Object.keys(W) as (keyof typeof W)[];
let best = score();
console.log(`start rho ${best.toFixed(4)} (per set ${rhos().map((r) => r.toFixed(3)).join(' ')})`, JSON.stringify(W));
for (let pass = 0; pass < 3; pass++)
  for (const k of keys)
    // The coverage exponent may reach 0 (geometric mean) or below; others scale.
    for (const f of k === 'cover' ? [-1, -0.5, 0, 0.15, 0.3, 0.5, 0.75, 1] : [0.5, 0.75, 1.33, 2]) {
      const old = W[k];
      W[k] = k === 'cover' ? f : old * f;
      const sc = score();
      if (sc > best + 1e-4) {
        best = sc;
        console.log(`  ${k} ${old.toFixed(3)} -> ${W[k].toFixed(3)}: rho ${sc.toFixed(4)}`);
      } else W[k] = old;
    }
console.log(`final rho ${best.toFixed(4)} (per set ${rhos().map((r) => r.toFixed(3)).join(' ')})`, JSON.stringify(Object.fromEntries(keys.map((k) => [k, +W[k].toFixed(3)]))));
