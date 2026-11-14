// Tidings balance probe: `npx vite-node scripts/tidings/balance.ts 300 [careful,random,safe,risky,greedy,crowd,miser]`
// Plays N seeded journeys per policy; prints how often each reaches Hollin, the
// stars and score of arrivals, where and why the others ended, the endings, and
// which cards/companions came up.
// Targets: careful ~50-60% arrive, random < 15%, no single-minded policy
// (always safest, always riskiest, greedy) at or above careful.
// SEED=n moves the seeds; TUNE=legFood:1,startF:7 tries other numbers;
// W=life:10,reserve:0.3 tries other careful-bot weights.

import { CARD, CARDS, ENDING, LAST, TUNE, act, newRun, type Res } from '../../src/tidings/core';
import { POLICIES, W, careful, playRun } from './bot';

const n = Number(process.argv[2] ?? 200);
const names = (process.argv[3] ?? 'careful,random,safe,risky,greedy').split(',');
const seed0 = Number(process.env.SEED ?? 1000);
for (const kv of (process.env.TUNE ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  (TUNE as Record<string, number>)[k] = Number(v);
}
for (const kv of (process.env.W ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  (W as unknown as Record<string, number>)[k] = Number(v);
}
const q = (xs: number[], p: number) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const pct = (k: number, of = n) => `${Math.round((100 * k) / Math.max(1, of))}%`;
console.log(`${n} journeys from seed ${seed0}`);
for (const name of names) {
  const pol = name === 'careful' ? careful(W) : POLICIES[name];
  if (!pol) throw new Error(`no policy ${name}`);
  let arrived = 0;
  const scores: number[] = [];
  const stars = [0, 0, 0, 0];
  const endings: Record<string, number> = {};
  const causes: Record<string, number> = {};
  const diedAt = Array(LAST + 1).fill(0);
  const band: number[] = [];
  let gambles = 0, gambleWins = 0, kept = 0, cbs = 0, joined = 0, short = 0, hands = 0;
  const seenCards = new Set<string>();
  const t0 = performance.now();
  for (let k = 0; k < n; k++) {
    const r = playRun(newRun(seed0 + k), pol);
    const e = r.end!;
    endings[e.ending] = (endings[e.ending] ?? 0) + 1;
    for (const x of e.also ?? []) endings[`+${x}`] = (endings[`+${x}`] ?? 0) + 1;
    for (const l of r.log) {
      if (CARD[l.id].choices[l.pick].odds !== undefined) (gambles++, l.won && gambleWins++);
      if (CARD[l.id].cb) cbs++;
      seenCards.add(l.id);
    }
    joined += r.met.length;
    // Hands dealt short (fewer than TUNE.hand cards): replay the deals.
    const rr = newRun(r.seed);
    for (const a of r.actions) {
      if (rr.phase === 'cards' && rr.faced === 0) (hands++, rr.hand.length < TUNE.hand && short++);
      act(rr, a);
    }
    if (ENDING[e.ending].kind === 'arrive') {
      arrived++;
      scores.push(e.score);
      stars[e.stars]++;
      band.push(r.band.length);
      kept += e.kept.length;
    } else {
      causes[e.cause as Res] = (causes[e.cause as Res] ?? 0) + 1;
      diedAt[r.stop]++;
    }
  }
  const ms = (performance.now() - t0) / n;
  console.log(
    `\n${name.padEnd(8)} arrive ${pct(arrived)} (${arrived}/${n})  ★ ${stars[1]} ★★ ${stars[2]} ★★★ ${stars[3]}  score p25/50/75 ${q(scores, 0.25)}/${q(scores, 0.5)}/${q(scores, 0.75)}  band at end ${q(band, 0.5)}  promises kept ${(kept / Math.max(1, arrived)).toFixed(2)}/arrival  gambles ${gambles} (${pct(gambleWins, gambles)} won)  ${ms.toFixed(1)} ms/run`,
  );
  console.log(`  ran out of: ${Object.entries(causes).map(([k, v]) => `${k} ${v}`).join(', ') || '-'}   ended at stop: ${diedAt.map((x, i) => (x ? `${i}:${x}` : '')).filter(Boolean).join(' ')}`);
  console.log(`  per run: ${(cbs / n).toFixed(1)} callbacks faced, ${(joined / n).toFixed(1)} companions joined; ${seenCards.size}/${CARDS.length} cards faced overall; short hands ${short}/${hands}`);
  console.log(`  endings: ${Object.entries(endings).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
}
