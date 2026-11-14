// Tidings companions probe: `npx vite-node scripts/tidings/comps.ts 300 [policy]`
// For each companion: how often their recruit card is dealt, how often the bot
// takes them, and how often a run that took them reaches Hollin.
// WITH=1 instead starts every run with one companion already in the band (the
// fair way to compare their power; "none" is the baseline).
// Target: offers within a few points of each other, no companion far ahead.
// TUNE=k:v and SEED=n as in balance.ts.

import { CARD, COMP_IDS, COMPANIONS, ENDING, TUNE, act, newRun, recruitOf, type CompId } from '../../src/tidings/core';
import { POLICIES, careful, playRun } from './bot';

const n = Number(process.argv[2] ?? 300);
const pol = (process.argv[3] ?? 'careful') === 'careful' ? careful() : POLICIES[process.argv[3]];
const seed0 = Number(process.env.SEED ?? 1000);
for (const kv of (process.env.TUNE ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  (TUNE as Record<string, number>)[k] = Number(v);
}
const pc = (k: number, of: number) => `${Math.round((100 * k) / Math.max(1, of))}%`;

if (process.env.WITH) {
  for (const id of ['none', ...COMP_IDS] as (CompId | 'none')[]) {
    let wins = 0, score = 0;
    for (let k = 0; k < n; k++) {
      const r0 = newRun(seed0 + k);
      if (id !== 'none') (r0.band.push({ id, at: 0 }), r0.met.push(id));
      const r = playRun(r0, pol);
      if (ENDING[r.end!.ending].kind === 'arrive') (wins++, (score += r.end!.score));
    }
    console.log(`${(id === 'none' ? 'none' : COMPANIONS[id].name).padEnd(11)} arrive ${pc(wins, n)}  mean score ${(score / Math.max(1, wins)).toFixed(1)}`);
  }
} else {
  const offered: Record<string, number> = {}, took: Record<string, number> = {}, won: Record<string, number> = {};
  let wins = 0;
  for (let k = 0; k < n; k++) {
    const r = playRun(newRun(seed0 + k), pol);
    const ok = ENDING[r.end!.ending].kind === 'arrive';
    if (ok) wins++;
    // Replay to see every hand dealt.
    const rr = newRun(r.seed);
    const seen = new Set<string>();
    for (const a of r.actions) {
      if (rr.phase === 'cards') for (const h of rr.hand) { const c = recruitOf(CARD[h.id]); if (c) seen.add(c); }
      act(rr, a);
    }
    for (const c of seen) offered[c] = (offered[c] ?? 0) + 1;
    for (const c of r.met) {
      took[c] = (took[c] ?? 0) + 1;
      if (ok) won[c] = (won[c] ?? 0) + 1;
    }
  }
  console.log(`${n} runs, ${pc(wins, n)} arrive`);
  for (const id of COMP_IDS) {
    const t = took[id] ?? 0;
    console.log(`${COMPANIONS[id].name.padEnd(11)} offered ${pc(offered[id] ?? 0, n)}  taken ${pc(t, n)}  arrive when taken ${t ? pc(won[id] ?? 0, t) : '-'}`);
  }
}
