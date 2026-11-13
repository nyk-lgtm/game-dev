// Sungrazer balance probe: `npx vite-node scripts/sungrazer/balance.ts 30 human`
// Plays N seeds with a bot of the given skill (novice, human, good, perfect; SG_MODE=n|s|t|m)
// and prints run length, altitude, score, causes of death and how far into each zone it gets.

import { MODES, ZONES, altitude, finalScore, isMode, replay, zoneAt, type Mode } from '../../src/sungrazer/core';
import { SKILLS, playBot } from './bot';

const n = Number(process.argv[2] ?? 20);
const skillName = process.argv[3] ?? 'human';
const sk = SKILLS[skillName];
if (!sk) throw new Error(`skill? ${Object.keys(SKILLS).join(', ')}`);
const mv = process.env.SG_MODE ?? 'n';
const mode: Mode = isMode(mv) ? mv : 'n';
const first = Number(process.env.SEED ?? 1000);
const verbose = !!process.env.V;
const secs: number[] = [], alts: number[] = [], scores: number[] = [];
const causes: Record<string, number> = {};
const zones = ZONES.map(() => 0);
const stat = { links: 0, nears: 0, sungrazes: 0, motes: 0, bounces: 0, graze: 0, bestMult: 0 };
const t0 = performance.now();
for (let k = 0; k < n; k++) {
  const seed = first + k;
  const { run, inputs } = playBot(seed, mode, sk, seed * 7 + 1);
  if (process.env.CHECK) {
    const again = replay(seed, mode, inputs, run.tick);
    if (again.score !== run.score || again.tick !== run.tick) throw new Error(`replay mismatch on seed ${seed}`);
  }
  const s = run.tick / 240;
  secs.push(s);
  alts.push(altitude(run));
  scores.push(finalScore(run));
  const c = run.alive ? 'timeout' : run.cause!;
  causes[c] = (causes[c] ?? 0) + 1;
  zones[zoneAt(altitude(run))]++;
  for (const key of Object.keys(stat) as (keyof typeof stat)[]) stat[key] += run.stats[key];
  if (verbose) console.log(`seed ${seed}: ${s.toFixed(1)} s, alt ${Math.round(altitude(run))}, score ${finalScore(run)}, ${c}, links ${run.stats.links}, best ×${run.stats.bestMult}, nears ${run.stats.nears}, graze ${run.stats.graze.toFixed(1)} s`);
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
console.log(`${skillName} × ${n} (${MODES[mode].name}): time median ${med(secs).toFixed(0)} s (p25 ${pct(secs, 0.25).toFixed(0)}, p75 ${pct(secs, 0.75).toFixed(0)}, p90 ${pct(secs, 0.9).toFixed(0)})`);
console.log(`altitude median ${Math.round(med(alts))} · score median ${med(scores)} (p75 ${pct(scores, 0.75)}, p90 ${pct(scores, 0.9)})`);
console.log(`deaths: ${Object.entries(causes).map(([k, v]) => `${k} ${v}`).join(', ')}`);
console.log(`reached: ${ZONES.map((z, i) => `${z.name} ${zones.slice(i).reduce((a, b) => a + b, 0)}`).join(' · ')}`);
console.log(`per run: links ${(stat.links / n).toFixed(1)}, nears ${(stat.nears / n).toFixed(1)}, sungrazes ${(stat.sungrazes / n).toFixed(1)}, motes ${(stat.motes / n).toFixed(1)}, bounces ${(stat.bounces / n).toFixed(1)}, graze ${(stat.graze / n).toFixed(1)} s, best combo ×${(stat.bestMult / n).toFixed(1)}`);
console.log(`${((performance.now() - t0) / n / 1000).toFixed(2)} s per run`);
