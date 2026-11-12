// Quarry balance probe: `npx vite-node scripts/quarry/balance.ts 40 [human|best]`
// Plays N seeded runs with a bot; prints depths reached, wins, score, how the
// depth targets went and which perks it took. SEEN=0.08 MAXLEN=6 tune the human
// bot; SEED=n moves the seeds; TARGETS=70,100,... and WORDS=7,7,6,... try others.
// PICK=worst takes the weakest perks (WORST order), PICK=<perk> takes that one
// whenever offered; PERKTABLE=1 prints one line per perk (each favored in turn).

import { DEPTHS, Dict, PERKS, TARGETS, WORDS, act, depthReached, newRun, type PerkId } from '../../src/quarry/core';
import { PACKED } from '../../src/quarry/core/words';
import { WORST, botAction, type BotMode, type BotOpts } from './bot';

const n = Number(process.argv[2] ?? 40);
const mode = (process.argv[3] ?? 'human') as BotMode;
const seed0 = Number(process.env.SEED ?? 1000);
if (process.env.WORDS) process.env.WORDS.split(',').forEach((v, i) => (WORDS[i] = Number(v)));
if (process.env.TARGETS) process.env.TARGETS.split(',').forEach((v, i) => (TARGETS[i] = Number(v)));
const base: BotOpts = { mode, seen: Number(process.env.SEEN ?? 0.08), maxLen: Number(process.env.MAXLEN ?? 6) };
const dict = new Dict(PACKED);
const med = (a: number[]) => (a.length ? a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)] : 0);
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const favor = (p: PerkId): PerkId[] => [p, ...WORST.filter((q) => q !== p)];

function batch(opts: BotOpts) {
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
  return { reached, scores, cleared, ratio, wordPts, byDepth, lens, perkRuns, wins, blown, words, ms: (performance.now() - t0) / n };
}

if (process.env.PERKTABLE) {
  console.log(`${mode} bot, ${n} runs per line: perk favored → median depth, wins, median score`);
  for (const p of PERKS) {
    const s = batch({ ...base, perks: favor(p.id) });
    const took = s.perkRuns[p.id]?.n ?? 0;
    console.log(`${p.id.padEnd(7)} taken ${String(took).padStart(3)}: depth ${med(s.reached)}, wins ${Math.round((s.wins / n) * 100)}%, score ${med(s.scores)}`);
  }
} else {
  const pick = process.env.PICK;
  const opts: BotOpts = { ...base, perks: pick === 'worst' ? WORST : pick ? favor(pick as PerkId) : undefined };
  const s = batch(opts);
  console.log(`${mode} bot (${mode === 'human' ? `seen ${base.seen}, ≤${base.maxLen} letters` : 'every common word'}${pick ? `, picks ${pick}` : ''}) · words ${WORDS.join(',')} · targets ${TARGETS.join(',')}`);
  console.log(
    `runs ${n}: median depth ${med(s.reached)}, wins ${s.wins} (${Math.round((s.wins / n) * 100)}%), median score ${med(s.scores)}, ` +
      `median word ${med(s.wordPts)} (avg ${avg(s.lens).toFixed(1)} letters), ${(s.words / n).toFixed(1)} words/run, fuses blown ${s.blown}, ` +
      `${s.ms.toFixed(0)} ms/run`,
  );
  console.log(`cleared depth: ${s.cleared.map((c, d) => `${d + 1}:${Math.round((c / n) * 100)}%`).join(' ')}`);
  console.log(`median score/target per depth played: ${s.ratio.map((a, d) => `${d + 1}:${med(a).toFixed(2)}`).join(' ')}`);
  console.log(`median word points per depth: ${s.byDepth.map((a, d) => `${d + 1}:${med(a)}`).join(' ')}`);
  console.log(
    'perks (runs taken, avg depth):',
    Object.entries(s.perkRuns)
      .sort((a, b) => b[1].n - a[1].n)
      .map(([p, v]) => `${p} ${v.n}/${(v.depth / v.n).toFixed(1)}`)
      .join(', '),
  );
}
