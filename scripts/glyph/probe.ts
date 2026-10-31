// Ground truth for build strength: run real waves with a fixed loom and count
// what leaks. Run: npx vite-node scripts/glyph/probe.ts [tier] [waves] [seeds] [top]
//   Every caster × every ordered triple of modifiers (all at `tier`), the same
//   row on all three rows; ranks builds by HP leaked (lower is better).
import { Evaluator, profileFor } from './smart';
import { CASTERS, MODS, finishBattle, newGame, startBattle, type CasterId, type ModId, type Rune } from '../../src/glyph/core';

export function leakTest(rows: (Rune | null)[][], waves: number[], seeds: number[]): { leak: number; t: number } {
  let leak = 0;
  let t = 0;
  for (const seed of seeds)
    for (const wave of waves) {
      const s = newGame(seed);
      s.wave = wave;
      s.hp = s.maxHp = 1e6;
      s.loom = rows.map((r) => r.map((x) => x && { ...x }));
      startBattle(s);
      finishBattle(s);
      leak += s.battle!.leaked;
      t += s.battle!.t;
    }
  return { leak, t: t / (seeds.length * waves.length) };
}

{
  // "2" = everything tier 2; "2/1" = tier-2 casters with tier-1 modifiers.
  const [ct, mt] = (process.argv[2] ?? '2').split('/').map(Number) as (1 | 2 | 3)[];
  const tier = ct;
  const modTier = mt ?? ct;
  const waves = (process.argv[3] ?? '6,9,12').split(',').map(Number);
  const seeds = Array.from({ length: Number(process.argv[4] ?? 2) }, (_, i) => i + 1);
  const top = Number(process.argv[5] ?? 12);
  const results: { name: string; c: CasterId; mods: ModId[]; leak: number; model: number }[] = [];
  const t0 = performance.now();
  // Unordered multisets of mods in a sensible order; the tested row plus two
  // plain tier-1 bolts (so flyers and leaks reflect the tested row's share).
  const ORDER: ModId[] = ['heavy', 'split', 'pierce', 'fire', 'storm', 'frost', 'haste', 'leech', 'gild', 'echo'];
  const STD: Rune[] = [{ id: 'bolt', tier: 1 }, null, null, null] as unknown as Rune[];
  for (const c of CASTERS)
    for (let a = 0; a < MODS.length; a++)
      for (let b = a; b < MODS.length; b++)
        for (let d = b; d < MODS.length; d++) {
          const mods = [MODS[a], MODS[b], MODS[d]].sort((x, y) => ORDER.indexOf(x) - ORDER.indexOf(y));
          const row: Rune[] = [{ id: c, tier }, ...mods.map((m) => ({ id: m, tier: modTier }))];
          const { leak } = leakTest([row, STD, STD], waves, seeds);
          results.push({ name: `${c}:${mods.join('+')}`, c, mods, leak, model: 0 });
        }
  // How well does the smart bot's damage model rank the same builds?
  for (const r of results) {
    let v = 0;
    for (const seed of seeds)
      for (const wave of waves) {
        const g = newGame(seed);
        g.wave = wave;
        const ev = new Evaluator(profileFor(seed, wave), g, {});
        const row: Rune[] = [{ id: r.c, tier }, ...r.mods.map((m) => ({ id: m, tier: modTier }))];
        v += ev.loom([row, STD, STD]);
      }
    r.model = v;
  }
  const rk = (xs: number[]) => {
    const o = xs.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]);
    const out = new Array(xs.length);
    o.forEach(([, i], j) => (out[i] = j));
    return out;
  };
  const ra = rk(results.map((r) => r.leak));
  const rb = rk(results.map((r) => -r.model));
  const n = results.length;
  const d2 = ra.reduce((a, x, i) => a + (x - rb[i]) ** 2, 0);
  console.log(`model vs probe Spearman rho = ${(1 - (6 * d2) / (n * (n * n - 1))).toFixed(3)}`);
  results.sort((a, b) => a.leak - b.leak);
  console.log(`${results.length} builds in ${Math.round(performance.now() - t0)}ms; tier ${tier}/${modTier}, waves ${waves}, ${seeds.length} seeds`);
  for (const r of results.slice(0, top)) console.log(`  ${r.leak.toString().padStart(5)}  ${r.name}  (model ${Math.round(r.model)})`);
  const byModel = [...results].sort((a, b) => b.model - a.model);
  console.log('model top:', byModel.slice(0, top).map((r) => `${r.name}=${r.leak}`).join(' '));
  for (const c of CASTERS) {
    const best = results.filter((r) => r.c === c).slice(0, 3);
    console.log(`best ${c}: ${best.map((r) => `${r.mods.join('+')} (${r.leak})`).join(', ')}`);
  }
  // Mod strength: average rank of builds containing each mod.
  const rank = new Map<ModId, number[]>();
  results.forEach((r, i) => new Set(r.mods).forEach((m) => rank.set(m, [...(rank.get(m) ?? []), i])));
  console.log(
    'mod median rank:',
    MODS.map((m) => {
      const xs = rank.get(m)!.sort((a, b) => a - b);
      return `${m} ${xs[xs.length >> 1]}`;
    }).join(', '),
  );
  console.log('top-50 mod count:', MODS.map((m) => `${m} ${results.slice(0, 50).filter((r) => r.mods.includes(m)).length}`).join(', '));
}
