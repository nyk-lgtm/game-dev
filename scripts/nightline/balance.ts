// Nightline balance probe. Run: npx vite-node scripts/nightline/balance.ts [runs] [skills] [SEED=n] [ROWS=1]
// skills: comma list of clean,crashy (bot.ts). For each skill and fork side (always left / always right) it
// prints finishes, the clock left at the goal and at the tightest checkpoint (before its bonus), crashes
// (rear-ends + roadside), and how often each biome is driven per stage.
import { BIOME_NAMES, TUNE, type BiomeId } from '../../src/nightline/core';
import { SKILLS, drive } from './bot';

// TUNE=start:60,bonus:40 tries other clock numbers.
for (const kv of (process.env.TUNE ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  (TUNE as Record<string, number>)[k] = Number(v);
}
const runs = Number(process.argv[2] ?? 40);
const skills = (process.argv[3] ?? 'clean,crashy').split(',');
const base = Number(process.env.SEED ?? 1);
const med = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};
const pct = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(q * (s.length - 1))] : NaN;
};
const biomes = new Map<string, number>();
for (const name of skills) {
  const skill = SKILLS[name];
  for (const side of [0, 1]) {
    let fin = 0;
    const left: number[] = [];
    const tight: number[] = [];
    const crashes: number[] = [];
    const rears: number[] = [];
    const props: number[] = [];
    const scores: number[] = [];
    const outAt: string[] = [];
    for (let i = 0; i < runs; i++) {
      const d = drive(base + i, side, skill);
      const r = d.race;
      if (r.status === 'finished') {
        fin++;
        left.push(r.clock);
      } else outAt.push(`s${r.stage + 1}`);
      tight.push(Math.min(...d.splits, r.status === 'finished' ? Infinity : 0));
      crashes.push(r.crashes);
      rears.push(d.rears);
      props.push(d.props);
      scores.push(r.score);
      r.stages.forEach((s, k) => biomes.set(`${k}:${s.biome}`, (biomes.get(`${k}:${s.biome}`) ?? 0) + 1));
      if (process.env.ROWS) console.log(`  ${r.status} stage ${r.stage + 1} t=${r.time.toFixed(0)}s clock=${r.clock.toFixed(1)} splits=${d.splits.map((x) => x.toFixed(0)).join('/')} crashes=${r.crashes} (${d.rears}+${d.props}) score=${Math.round(r.score)} ${r.stages.map((s) => s.biome).join('>')}`);
    }
    console.log(
      `${name.padEnd(7)} ${side ? 'right' : 'left '}: finished ${fin}/${runs}${outAt.length ? ` (out: ${outAt.join(' ')})` : ''}; clock left median ${med(left).toFixed(1)} s (p10 ${pct(left, 0.1).toFixed(1)}); tightest checkpoint median ${med(tight).toFixed(1)} s (p10 ${pct(tight, 0.1).toFixed(1)}); crashes median ${med(crashes)} (${med(rears)} rear + ${med(props)} roadside, p90 ${pct(crashes, 0.9)}); score median ${Math.round(med(scores))}`,
    );
  }
}
const rows: string[] = [];
for (let k = 0; k < 5; k++) rows.push(`  stage ${k + 1}: ${(Object.keys(BIOME_NAMES) as BiomeId[]).map((b) => `${b} ${biomes.get(`${k}:${b}`) ?? 0}`).join(', ')}`);
console.log(`biomes driven per stage:\n${rows.join('\n')}`);
