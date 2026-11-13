// Simmer balance probe: `npx vite-node scripts/simmer/balance.ts 200 [naive,decent,clever,…]`
// Plays N seeded seasons per strategy and prints score (coins + 5·rep), coins,
// reputation, stars, waste, what guests walked off over, and what got bought.
// Targets: naive ~1★, decent ~2★, clever 3★ in about a quarter of seeds, and no
// single-minded strategy (cheap, premium, fame, sweets…) beating clever.
// SEED=n moves the seeds; TUNE=street0:9,love:1.3 tries other numbers.

import { DISHES, STARS, TUNE, UPGRADES, newRun, scoreOf, starsOf } from '../../src/simmer/core';
import { STRATS, playSeason } from './bot';

const n = Number(process.argv[2] ?? 100);
const names = (process.argv[3] ?? 'naive,decent,clever').split(',');
const seed0 = Number(process.env.SEED ?? 1000);
for (const kv of (process.env.TUNE ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  (TUNE as Record<string, number>)[k] = Number(v);
}
const q = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
const pct = (k: number) => `${Math.round((100 * k) / n)}%`;
console.log(`stars at ${STARS.join(' / ')}, score = coins + ${TUNE.repPts}·rep, ${n} seasons from seed ${seed0}`);
for (const name of names) {
  const s = STRATS[name];
  if (!s) throw new Error(`no strategy ${name}`);
  const scores: number[] = [], coins: number[] = [], reps: number[] = [], waste: number[] = [], guests: number[] = [];
  const stars = [0, 0, 0, 0];
  const left: Record<string, number> = {};
  const ups: Record<string, number> = {};
  const learned: Record<string, number> = {};
  let helpers = 0, served = 0, tot = 0;
  const t0 = performance.now();
  for (let k = 0; k < n; k++) {
    const r = playSeason(newRun(seed0 + k), s);
    const sc = scoreOf(r);
    scores.push(sc);
    coins.push(r.coins);
    reps.push(r.rep);
    stars[starsOf(sc)]++;
    waste.push(r.ledgers.reduce((a, l) => a + l.wasteCost, 0));
    guests.push(r.ledgers[r.ledgers.length - 1].guests);
    for (const l of r.ledgers) {
      for (const [w, c] of Object.entries(l.left)) left[w] = (left[w] ?? 0) + c!;
      if (l.helper) helpers++;
      served += l.served;
      tot += l.guests;
    }
    r.ups.forEach((lv, i) => lv && (ups[UPGRADES[i].key] = (ups[UPGRADES[i].key] ?? 0) + lv));
    r.known.forEach((kn, i) => kn && DISHES[i].learn && (learned[DISHES[i].key] = (learned[DISHES[i].key] ?? 0) + 1));
  }
  const ms = (performance.now() - t0) / n;
  console.log(
    `\n${name.padEnd(10)} score median ${q(scores, 0.5)} (p25 ${q(scores, 0.25)}, p75 ${q(scores, 0.75)}, p90 ${q(scores, 0.9)})  coins ${q(coins, 0.5)}  rep ${q(reps, 0.5)}` +
      `\n           stars 0:${pct(stars[0])} 1:${pct(stars[1])} 2:${pct(stars[2])} 3:${pct(stars[3])}  waste ${q(waste, 0.5)}¢/season  last-night guests ${q(guests, 0.5)}  served ${Math.round((100 * served) / tot)}%  helpers ${(helpers / n).toFixed(1)}/season  ${ms.toFixed(0)} ms/season` +
      `\n           walked off per season: ${Object.entries(left).map(([w, c]) => `${w} ${(c / n).toFixed(1)}`).join(', ')}` +
      `\n           upgrades: ${Object.entries(ups).map(([k, c]) => `${k} ${pct(c)}`).join(', ') || '-'}  recipes: ${Object.entries(learned).map(([k, c]) => `${k} ${pct(c)}`).join(', ') || '-'}`,
  );
}
