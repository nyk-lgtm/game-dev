// Quarry balance probe: `npx vite-node scripts/quarry/balance.ts 40 [human|best]`
// Plays N seeded runs with a bot; prints depths reached, wins, score, how the
// depth targets went and which perks it took. SEEN=0.08 MAXLEN=6 tune the human
// bot; SEED=n moves the seeds; TARGETS=70,100,... tries other targets.

import { DEPTHS, Dict, TARGETS, WORDS, act, depthReached, newRun } from '../../src/quarry/core';
import { PACKED } from '../../src/quarry/core/words';
import { botAction, type BotMode } from './bot';

const n = Number(process.argv[2] ?? 40);
const mode = (process.argv[3] ?? 'human') as BotMode;
const seed0 = Number(process.env.SEED ?? 1000);
if (process.env.WORDS) process.env.WORDS.split(',').forEach((v, i) => (WORDS[i] = Number(v)));
if (process.env.TARGETS) process.env.TARGETS.split(',').forEach((v, i) => (TARGETS[i] = Number(v)));
const opts = { mode, seen: Number(process.env.SEEN ?? 0.08), maxLen: Number(process.env.MAXLEN ?? 6) };
const dict = new Dict(PACKED);
const reached: number[] = [];
const scores: number[] = [];
const cleared = Array(DEPTHS).fill(0);
const ratio: number[][] = Array.from({ length: DEPTHS }, () => []);
const wordPts: number[] = [];
const byDepth: number[][] = Array.from({ length: DEPTHS }, () => []);
const lens: number[] = [];
const perkRuns: Record<string, { n: number; depth: number }> = {};
let wins = 0;
let blown = 0;
let words = 0;
const t0 = performance.now();
for (let k = 0; k < n; k++) {
  const r = newRun(seed0 + k, dict);
  for (let guard = 0; r.phase !== 'over' && guard < 500; guard++) {
    const o = act(r, botAction(r, dict, opts), dict);
    if (!o) throw new Error(`bot made an illegal move on seed ${seed0 + k}`);
    if (o.kind === 'word') {
      wordPts.push(o.total!);
      byDepth[r.phase === 'play' ? r.depth : r.log.length - 1]?.push(o.total!);
      lens.push(o.score!.word.length);
    }
    if (o.blown) blown++;
  }
  reached.push(depthReached(r));
  scores.push(r.score);
  words += r.words;
  if (r.won) wins++;
  r.log.forEach((l, d) => {
    if (l.score >= l.target) cleared[d]++;
    ratio[d].push(l.score / l.target);
  });
  for (const p of r.perks) {
    perkRuns[p] ??= { n: 0, depth: 0 };
    perkRuns[p].n++;
    perkRuns[p].depth += depthReached(r);
  }
}
const med = (a: number[]) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
console.log(`${mode} bot (${mode === 'human' ? `seen ${opts.seen}, ≤${opts.maxLen} letters` : 'every common word'}) · words ${WORDS.join(',')} · targets ${TARGETS.join(',')}`);
console.log(
  `runs ${n}: median depth ${med(reached)}, wins ${wins} (${Math.round((wins / n) * 100)}%), median score ${med(scores)}, ` +
    `median word ${med(wordPts)} (avg ${avg(lens).toFixed(1)} letters), ${(words / n).toFixed(1)} words/run, fuses blown ${blown}, ` +
    `${((performance.now() - t0) / n).toFixed(0)} ms/run`,
);
console.log(`cleared depth: ${cleared.map((c, d) => `${d + 1}:${Math.round((c / n) * 100)}%`).join(' ')}`);
console.log(`median score/target per depth played: ${ratio.map((a, d) => `${d + 1}:${med(a).toFixed(2)}`).join(' ')}`);
console.log(`median word points per depth: ${byDepth.map((a, d) => `${d + 1}:${med(a)}`).join(' ')}`);
console.log(
  'perks (runs taken, avg depth):',
  Object.entries(perkRuns)
    .sort((a, b) => b[1].n - a[1].n)
    .map(([p, v]) => `${p} ${v.n}/${(v.depth / v.n).toFixed(1)}`)
    .join(', '),
);
