// Trestle generator probe: `npx vite-node scripts/trestle/probe.ts 60 [d]`
// Generates N levels and prints: how often the first layout was proven solvable,
// layouts per level, the surveyor's cost vs the budget, gen time, and the time
// one test run takes (the surveyor's own build, played to the end).

import { layout, makeLevel, type GenInfo } from '../../src/trestle/core/gen';
import { replayBuild } from '../../src/trestle/core/build';
import { Sim } from '../../src/trestle/core/sim';
import { mixSeed } from '../../src/shared/rng';

const n = Number(process.argv[2] ?? 40);
const fixedD = process.argv[3] !== undefined ? Number(process.argv[3]) : null;
const base = Number(process.env.SEED ?? 1);
const tries: number[] = [];
const genMs: number[] = [];
const runMs: number[] = [];
const ratio: number[] = [];
const kinds: Record<string, number> = {};
const first: Record<string, [number, number]> = {};
const pars: number[] = [];
let simsTotal = 0;
for (let i = 0; i < n; i++) {
  const d = fixedD ?? (i % 25) / 24;
  const info: GenInfo = { tries: 0, sims: 0 };
  const t0 = performance.now();
  const l = makeLevel(mixSeed(base, i), d, info);
  genMs.push(performance.now() - t0);
  tries.push(info.tries);
  kinds[l.goal.kind] = (kinds[l.goal.kind] ?? 0) + 1;
  kinds[`type:${l.type}`] = (kinds[`type:${l.type}`] ?? 0) + 1;
  const twists: [string, boolean][] = [
    ['wind', !!l.wind],
    ['twin', l.goal.kind === 'reach' && l.goal.rings.length > 1],
    ['log', l.terrain.some((r) => r.kind === 'log')],
    ['floor', l.terrain.some((r) => r.kind === 'floor')],
    ['convoy', l.goal.kind === 'cross' && (l.goal.carts ?? 1) > 1],
  ];
  for (const [k, on] of twists) if (on) kinds[k] = (kinds[k] ?? 0) + 1;
  const k0 = layout(mixSeed(base, i), d, 0).level.goal.kind;
  first[k0] = first[k0] ?? [0, 0];
  first[k0][1]++;
  if (info.tries === 1) first[k0][0]++;
  ratio.push(l.par / l.budget);
  pars.push(l.par);
  const ms = replayBuild(l, l.ref!).members;
  const t1 = performance.now();
  const s = new Sim(l, ms);
  while (!s.outcome || s.steps < s.outcomeAt + 480) s.step();
  runMs.push(performance.now() - t1);
  simsTotal += info.sims;
  if (process.env.V) console.log(`${l.id} d=${d.toFixed(2)} ${l.goal.kind} ${l.name}: par ${l.par} (${l.parParts} parts) budget ${l.budget}, tries ${info.tries}, sims ${info.sims}, ${genMs.at(-1)!.toFixed(0)} ms, ${s.outcome}`);
}
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const f = (x: number) => x.toFixed(x < 10 ? 2 : 0);
console.log(`levels ${n}: ${JSON.stringify(kinds)}`);
console.log(`first layout proven: ${((tries.filter((t) => t === 1).length / n) * 100).toFixed(0)}%, layouts per level median ${q(tries, 0.5)} max ${Math.max(...tries)}; by kind ${Object.entries(first).map(([k, [a, b]]) => `${k} ${a}/${b}`).join(", ")}`);
console.log(`par/budget median ${f(q(ratio, 0.5))} (min ${f(Math.min(...ratio))}, max ${f(Math.max(...ratio))}); par median ${q(pars, 0.5)} (${Math.min(...pars)}-${Math.max(...pars)})`);
console.log(`gen ms median ${f(q(genMs, 0.5))}, p90 ${f(q(genMs, 0.9))}, max ${f(Math.max(...genMs))}`);
console.log(`one test run (to the end + 1 s): median ${f(q(runMs, 0.5))} ms, max ${f(Math.max(...runMs))} ms`);
void simsTotal;
