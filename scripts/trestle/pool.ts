// Builds the trail's hand-picked run: `npx vite-node scripts/trestle/pool.ts [slots] [perType]`
// Generates candidates of every level type across difficulty d 0..1, re-surveys
// each harder (effort 4) for a tight par, scores them (gen.ts `difficulty`:
// how few textbook shapes hold, and the parts the lean answer needs), then
// fills the slots in a rotation of types, each with the unused candidate whose
// difficulty is nearest a steadily rising target. Writes src/trestle/core/pool.ts
// and prints the curve (difficulty per slot, the biggest jump).

import { writeFileSync } from 'node:fs';
import { mixSeed } from '../../src/shared/rng';
import { LEVEL_TYPES, costOf, difficulty, isLantern, makeLevel, polish, replayBuild, survey, toActions, trailName, WON, runSim, type Level, type LevelType } from '../../src/trestle/core';

const SLOTS = Number(process.argv[2] ?? 60);
const PER = Number(process.argv[3] ?? 14);
const POLISH = Number(process.env.POLISH ?? 5000);
const ROT: LevelType[] = ['plain', 'wall', 'hooks', 'arch', 'gap', 'boat', 'spire', 'convoy', 'island'];

interface Cand {
  l: Level;
  d: number;
  type: LevelType;
}
const cands: Cand[] = [];
const t0 = performance.now();
LEVEL_TYPES.forEach((type, ti) => {
  for (let j = 0; j < PER; j++) {
    const d = j / (PER - 1);
    let l: Level;
    try {
      l = makeLevel(mixSeed(0x900d, ti * 1000 + j), d, undefined, type);
    } catch {
      continue;
    }
    // A harder look for a tighter par (the pool is made once, offline).
    const s = survey(l, 4);
    if (s && costOf(s.members) < l.par) {
      const a = toActions(l, s.members);
      const b = replayBuild(l, a).members;
      if (b.length === s.members.length && WON.has(runSim(l, b).outcome)) {
        const cost = costOf(b);
        l = { ...l, par: cost, parParts: b.length, ref: a, budget: Math.ceil((cost * (1.4 - 0.25 * d)) / 10) * 10, diff: difficulty(s.ease, b.length) };
      }
    }
    // Playtests found arches harder, islands easier and gap lanterns gentler than the solver's measure says.
    const bias = type === 'arch' ? 0.12 : type === 'island' ? -0.05 : type === 'gap' ? -0.15 : 0;
    l = { ...l, diff: Math.max(0, Math.min(1, Math.round(((l.diff ?? 0) + bias) * 1000) / 1000)) };
    cands.push({ l, d, type });
  }
  console.error(`${type}: ${cands.filter((c) => c.type === type).length} candidates (${((performance.now() - t0) / 1000).toFixed(0)} s)`);
});

// Targets: a steady rise through the spread of difficulties on offer.
const diffs = cands.map((c) => c.l.diff ?? 0).sort((a, b) => a - b);
const q = (p: number) => diffs[Math.min(diffs.length - 1, Math.floor(p * diffs.length))];
const used = new Set<Cand>();
const picked: Cand[] = [];
for (let i = 0; i < SLOTS; i++) {
  const f = i / (SLOTS - 1);
  const target = q(0.08 + 0.84 * f);
  const type = ROT[i % ROT.length];
  let best: Cand | null = null;
  let bs = Infinity;
  for (const c of cands) {
    if (used.has(c)) continue;
    // Near-twins of a level already picked (same type, parts and about the same par) are kept apart.
    const twin = picked.some((p) => p.type === c.type && p.l.parParts === c.l.parParts && Math.abs(p.l.par - c.l.par) <= 8);
    const score = Math.abs((c.l.diff ?? 0) - target) + 0.25 * Math.abs(c.d - f) + (c.type === type ? 0 : 0.2) + (twin ? 0.5 : 0);
    if (score < bs) (bs = score), (best = c);
  }
  used.add(best!);
  picked.push(best!);
}
// Then order them: always the easiest left whose type differs from the last two placed,
// so the curve climbs steadily and the kinds of level keep changing.
const order: Cand[] = [];
const left = [...picked];
while (left.length) {
  const recent = order.slice(-2).map((c) => c.type);
  const sorted = left.map((c, i) => ({ c, i })).sort((a, b) => (a.c.l.diff ?? 0) - (b.c.l.diff ?? 0));
  // Every type shows up within the first dozen levels: past the 4th slot, a type not seen yet comes next if
  // its easiest level is no more than 0.25 above the easiest left.
  const seen = new Set(order.map((c) => c.type));
  const fresh = order.length >= 4 && order.length < 12 ? sorted.find(({ c }) => !seen.has(c.type) && !recent.includes(c.type) && (c.l.diff ?? 0) <= (sorted[0].c.l.diff ?? 0) + 0.25) : undefined;
  const pick = fresh ?? sorted.find(({ c }) => !recent.includes(c.type)) ?? sorted[0];
  order.push(pick.c);
  left.splice(pick.i, 1);
}
// Last, a long polish of each picked level's par build (local search from three seeds), so par is near
// what a clever player finds (playtests beat the surveyor's wall-lantern par by a third).
const levels = order.map((c, i) => {
  let l = c.l;
  const start = replayBuild(l, l.ref!).members;
  const best = [11, 12, 13].map((sd) => polish(l, start, POLISH, sd)).sort((a, b) => costOf(a) - costOf(b) || a.length - b.length)[0];
  if (costOf(best) < l.par || (costOf(best) === l.par && best.length < l.parParts)) {
    const a = toActions(l, best);
    const b = replayBuild(l, a).members;
    if (b.length === best.length && WON.has(runSim(l, b).outcome)) {
      const cost = costOf(b);
      l = { ...l, par: cost, parParts: b.length, ref: a, budget: Math.ceil((cost * (1.4 - 0.25 * c.d)) / 10) * 10 };
    }
  }
  return { ...l, id: `p${i + 1}`, name: trailName(i, isLantern(c.type)) };
});
let jump = 0;
let drop = 0;
const lines = levels.map((l, i) => {
  const dd = l.diff ?? 0;
  if (i) jump = Math.max(jump, dd - (levels[i - 1].diff ?? 0));
  if (i) drop = Math.max(drop, (levels[i - 1].diff ?? 0) - dd);
  return `${String(i + 7).padStart(3)} ${String(l.type).padEnd(7)} diff ${dd.toFixed(2)} par ${l.par}/${l.parParts} budget ${l.budget}${l.wind ? ' wind' : ''}  ${l.name}`;
});
console.log(lines.join('\n'));
const thirds = [0, 1, 2].map((k) => levels.slice((k * SLOTS) / 3, ((k + 1) * SLOTS) / 3).reduce((a, l) => a + (l.diff ?? 0), 0) / (SLOTS / 3));
console.log(`difficulty by thirds ${thirds.map((x) => x.toFixed(2)).join(' → ')}; biggest rise between neighbours ${jump.toFixed(2)}, biggest drop ${drop.toFixed(2)}; types ${JSON.stringify(Object.fromEntries(ROT.map((t) => [t, levels.filter((l) => l.type === t).length])))}`);
writeFileSync(
  'src/trestle/core/pool.ts',
  `// Generated by scripts/trestle/pool.ts: the trail's picked levels after the tutorials\n// (types in rotation, difficulty rising steadily, par from a hard survey). Do not edit by hand.\nimport type { Level } from './level';\n\nexport const POOL: Level[] = ${JSON.stringify(levels)};\n`,
);
