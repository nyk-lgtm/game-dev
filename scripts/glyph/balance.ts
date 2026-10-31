// Glyphwright balance probe. Run: npx vite-node scripts/glyph/balance.ts [runs] [bots]
//   bots: comma list of naive, smart, favor (smart bot pushed toward each caster),
//   favor:mods (toward each modifier), favor:beam+fire (toward the given runes)
// Last result (200 seeds): smart 36% wins, median wave 15, deaths spread 9-15
// (lich 41, colossus 10); naive median 7, all deaths on waves 4-10.
// Favor runs (60 seeds): casters 20-42% wins, modifiers 22-52%.
// Related tools: probe.ts (ground-truth build ranking), fit.ts (bot model
// weights), sweep.ts (bot economy knobs).
import { CASTERS, MODS, WAVES, type CasterId, type RuneId } from '../../src/glyph/core';
import { PLAYERS, runGame, type Player, type RunResult } from './bot';
import { smartPlayer } from './smart';

const runs = Number(process.argv[2] ?? 60);
const bots = (process.argv[3] ?? 'naive,smart').split(',');
const pct = (a: number, b: number) => `${b ? Math.round((100 * a) / b) : 0}%`;
const r1 = (x: number) => Math.round(x * 10) / 10;

function report(p: Player, verbose = true): RunResult[] {
  const t0 = performance.now();
  const res: RunResult[] = [];
  for (let seed = 1; seed <= runs; seed++) res.push(runGame(seed, p));
  const reached = res.map((r) => (r.won ? WAVES + 1 : r.reached)).sort((a, b) => a - b);
  const wins = res.filter((r) => r.won);
  console.log(`\n== ${p.name}: ${runs} runs, ${Math.round(performance.now() - t0)}ms`);
  console.log(`wins ${wins.length}/${runs} (${pct(wins.length, runs)}), median wave ${reached[runs >> 1]} (16 = won)`);
  if (!verbose) return res;
  const deaths = new Array(WAVES + 1).fill(0);
  for (const r of res) if (!r.won) deaths[r.reached]++;
  console.log(`deaths by wave: ${deaths.map((n, w) => (w && n ? `${w}:${n}` : '')).filter(Boolean).join(' ')}`);
  const T = new Array(WAVES + 1).fill(0);
  const N = new Array(WAVES + 1).fill(0);
  const L = new Array(WAVES + 1).fill(0);
  const G = new Array(WAVES + 1).fill(0);
  for (const r of res)
    for (const w of r.log) {
      T[w.wave] += w.t;
      N[w.wave]++;
      L[w.wave] += w.hpLost;
      G[w.wave] += w.goldEarned;
    }
  console.log(`battle s/wave: ${T.map((t, w) => (N[w] ? `${w}:${Math.round(t / N[w])}` : '')).filter(Boolean).join(' ')}`);
  console.log(`hp lost/wave:  ${L.map((t, w) => (N[w] ? `${w}:${r1(t / N[w])}` : '')).filter(Boolean).join(' ')}`);
  console.log(`kill gold/wave: ${G.map((t, w) => (N[w] ? `${w}:${Math.round(t / N[w])}` : '')).filter(Boolean).join(' ')}`);
  if (wins.length) {
    const hp = wins.map((r) => r.s.hp).sort((a, b) => a - b);
    console.log(`hp left on wins: ${hp.join(' ')} (flawless ${wins.filter((r) => r.s.hp === r.s.maxHp).length})`);
  }
  const byCaster = new Map<CasterId, [number, number]>();
  for (const r of res) {
    if (!r.primary) continue;
    const e = byCaster.get(r.primary) ?? [0, 0];
    e[0]++;
    if (r.won) e[1]++;
    byCaster.set(r.primary, e);
  }
  console.log(`primary caster (runs/wins): ${CASTERS.map((c) => `${c} ${byCaster.get(c)?.[0] ?? 0}/${byCaster.get(c)?.[1] ?? 0}`).join(', ')}`);
  const casterUse = new Map<string, number>();
  const modUse = new Map<string, number>();
  for (const r of res)
    for (const row of r.s.loom)
      row.forEach((x, c) => x && (c ? modUse : casterUse).set(x.id, ((c ? modUse : casterUse).get(x.id) ?? 0) + 1));
  console.log(`casters on final looms: ${CASTERS.map((c) => `${c} ${casterUse.get(c) ?? 0}`).join(', ')}`);
  console.log(`mods on final looms: ${MODS.map((m) => `${m} ${modUse.get(m) ?? 0}`).join(', ')}`);
  for (const r of res.slice(0, 4))
    console.log(`  seed ${r.seed}: ${r.won ? 'won' : `died w${r.reached}`} hp ${r.s.hp} dps ${r.dps.join('/')} | ${r.s.loom.map((row) => row.map((x) => (x ? x.id + x.tier : '-')).join(',')).join(' | ')}`);
  return res;
}

for (const b of bots) {
  if (b.startsWith('favor')) {
    const arg = b.slice(6);
    const ids: RuneId[] = arg === 'mods' ? MODS : arg ? (arg.split('+') as RuneId[]) : CASTERS;
    for (const c of ids) report(smartPlayer({ favor: c }), arg !== 'mods' && !!arg);
  }
  else report(PLAYERS[b]);
}
