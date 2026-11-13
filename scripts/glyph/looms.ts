// Whole-loom ground truth for the late game: does a caster leave a hole that
// the other two rows can't cover? Run: npx vite-node scripts/glyph/looms.ts [tier] [waves] [seeds] [pool]
//   Ranks every caster's modifier triples (one row + two plain bolts, as in
//   probe.ts), keeps the best `pool` rows per caster, then plays every loom of
//   three pool rows on the waves and reports, per caster, the best loom that
//   uses it (once / twice or more) and what leaks through it, by foe kind.
//   TWEAK tries numbers without editing the rules (tweak.ts).
import { CASTERS, ENEMIES, MODS, finishBattle, newGame, startBattle, type EnemyKind, type ModId, type Rune } from '../../src/glyph/core';
import { applyTweaks } from './tweak';

applyTweaks();

const [ct, mt] = (process.argv[2] ?? '3/2').split('/').map(Number) as (1 | 2 | 3)[];
const modTier = mt ?? ct;
const waves = (process.argv[3] ?? '12,14').split(',').map(Number);
const seeds = Array.from({ length: Number(process.argv[4] ?? 3) }, (_, i) => i + 1);
const poolN = Number(process.argv[5] ?? 6);

type Row = (Rune | null)[];
const STD: Row = [{ id: 'bolt', tier: 1 }, null, null, null];

function play(loom: Row[]): { leak: number; by: Partial<Record<EnemyKind, number>> } {
  let leak = 0;
  const by: Partial<Record<EnemyKind, number>> = {};
  for (const seed of seeds)
    for (const wave of waves) {
      const s = newGame(seed);
      s.wave = wave;
      s.hp = s.maxHp = 1e6;
      s.loom = loom.map((r) => r.map((x) => x && { ...x }));
      startBattle(s);
      finishBattle(s);
      leak += s.battle!.leaked;
      for (const [k, n] of Object.entries(s.battle!.leakedBy)) by[k as EnemyKind] = (by[k as EnemyKind] ?? 0) + (n as number) * ENEMIES[k as EnemyKind].leak;
    }
  return { leak, by };
}

const ORDER: ModId[] = ['heavy', 'split', 'pierce', 'fire', 'storm', 'frost', 'haste', 'leech', 'gild', 'echo'];
const name = (r: Row) => `${r[0]!.id}:${r.slice(1).map((x) => x!.id).join('+')}`;
const t0 = performance.now();
const pool: Row[] = [];
for (const c of CASTERS) {
  const rows: { row: Row; leak: number }[] = [];
  for (let a = 0; a < MODS.length; a++)
    for (let b = a; b < MODS.length; b++)
      for (let d = b; d < MODS.length; d++) {
        const mods = [MODS[a], MODS[b], MODS[d]].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
        const row: Row = [{ id: c, tier: ct }, ...mods.map((m) => ({ id: m, tier: modTier }))];
        rows.push({ row, leak: play([row, STD, STD]).leak });
      }
  rows.sort((x, y) => x.leak - y.leak);
  pool.push(...rows.slice(0, poolN).map((r) => r.row));
  console.log(`pool ${c}: ${rows.slice(0, poolN).map((r) => `${name(r.row)} ${r.leak}`).join(', ')}`);
}
const looms: { rows: Row[]; leak: number; by: Partial<Record<EnemyKind, number>> }[] = [];
for (let a = 0; a < pool.length; a++)
  for (let b = a; b < pool.length; b++)
    for (let d = b; d < pool.length; d++) {
      const rows = [pool[a], pool[b], pool[d]];
      looms.push({ rows, ...play(rows) });
    }
looms.sort((x, y) => x.leak - y.leak);
console.log(`${looms.length} looms, tier ${ct}/${modTier}, waves ${waves}, ${seeds.length} seeds, ${Math.round(performance.now() - t0)}ms`);
const show = (l: (typeof looms)[number]) =>
  `${l.leak} [${l.rows.map(name).join(' | ')}] leaks ${Object.entries(l.by).sort((x, y) => y[1] - x[1]).map(([k, n]) => `${k} ${n}`).join(', ') || '-'}`;
console.log('best overall:', show(looms[0]));
const top = (xs: typeof looms, n: number) => Math.round(xs.slice(0, n).reduce((s, l) => s + l.leak, 0) / Math.max(1, Math.min(n, xs.length)));
for (const c of CASTERS) {
  const n = (l: (typeof looms)[number]) => l.rows.filter((r) => r[0]!.id === c).length;
  for (const k of [1, 2, 3]) {
    const xs = looms.filter((l) => n(l) === k);
    if (xs.length) console.log(`${c} ×${k}: best/top-10 ${xs[0].leak}/${top(xs, 10)}  ${show(xs[0])}`);
  }
}
