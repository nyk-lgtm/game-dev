// What gets through in smart-bot runs: tower HP lost by primary caster, wave band and foe kind.
// Run: npx vite-node scripts/glyph/leaks.ts [runs] [favor rune]
import { apply, compileRow, finishBattle, newGame, mixSeed, ENEMIES } from '../../src/glyph/core';
import { Rng } from '../../src/shared/rng';
import { smartPlayer, profileFor, evalRow } from './smart';
const runs = Number(process.argv[2] ?? 100);
const favor = process.argv[3];
const p = smartPlayer(favor ? { favor: favor as any } : {});
const agg: Record<string, Record<string, number>> = {};
const novaRows: Record<string, number> = {};
let wins = 0;
for (let seed = 1; seed <= runs; seed++) {
  const s = newGame(seed);
  const rng = new Rng(mixSeed(seed, 4242));
  const act = (a: any) => apply(s, a);
  const leaks: [number, Record<string, number>][] = [];
  while (s.phase === 'build') {
    p.turn(s, act, rng);
    const w = s.wave;
    const nn = s.loom.filter((r) => r[0]?.id === 'nova').length;
    if (w >= 11) novaRows[nn] = (novaRows[nn] ?? 0) + 1;
    act({ t: 'fight' });
    finishBattle(s);
    const lb: Record<string, number> = {};
    for (const [k, n] of Object.entries(s.battle!.leakedBy)) lb[k] = (n as number) * ENEMIES[k as keyof typeof ENEMIES].leak;
    leaks.push([w, lb]);
  }
  if (s.phase === 'won') wins++;
  const P = profileFor(seed, Math.min(s.wave, 15), 0);
  let prim = '-';
  let best = -1;
  s.loom.forEach((r) => {
    const sp = compileRow(r);
    const v = evalRow(r, P).dps;
    if (sp && v > best) {
      best = v;
      prim = sp.caster;
    }
  });
  for (const [w, lb] of leaks) {
    const band = w <= 8 ? 'w1-8' : w <= 12 ? 'w9-12' : 'w13-15';
    for (const [k, v] of Object.entries(lb)) {
      for (const key of [prim + ' ' + band, 'ALL ' + band]) {
        agg[key] ??= {};
        agg[key][k] = (agg[key][k] ?? 0) + v;
      }
    }
  }
}
console.log(`wins ${wins}/${runs}; looms with 0/1/2/3 Nova rows from wave 11: ${JSON.stringify(novaRows)}`);
for (const k of Object.keys(agg).sort()) console.log(k.padEnd(14), Object.entries(agg[k]).sort((a, b) => b[1] - a[1]).map(([a, b]) => a + ' ' + b).join(', '));
