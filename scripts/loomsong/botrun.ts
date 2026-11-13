// Loomsong bot play: `npx vite-node scripts/loomsong/botrun.ts <seed> [level 0-2] [jitter ms] [skip 0-1]`
// Plays a song's chart with a bot (timing jitter, skipped notes, a few dropped holds), prints the result and a
// `?seed=&lv=&a=` query that opens the rescored play in the game (for checking a report or the results card).
// N=200 instead plays N songs at that jitter and prints the grade spread (how forgiving the windows are).

import { LEVELS, botEvents, chartFor, encodeEvents, isLevel, replay, type Level } from '../../src/loomsong/core';

const seed = Number(process.argv[2] ?? 1) >>> 0;
const lvArg = Number(process.argv[3] ?? 1);
const level: Level = isLevel(lvArg) ? lvArg : 1;
const jitter = Number(process.argv[4] ?? 35);
const skip = Number(process.argv[5] ?? 0.02);
const n = Number(process.env.N ?? 0);

if (n > 0) {
  const grades: Record<string, number> = {};
  const scores: number[] = [];
  for (let k = 0; k < n; k++) {
    const ch = chartFor(seed + k, level);
    const r = replay(seed + k, level, botEvents(ch, { jitter, skip, drop: skip * 2, seed: seed + k }));
    grades[r.grade] = (grades[r.grade] ?? 0) + 1;
    scores.push(r.score);
  }
  scores.sort((a, b) => a - b);
  console.log(`${LEVELS[level].name}, jitter ${jitter} ms, skip ${skip}: median ${scores[n >> 1]} · grades ${Object.entries(grades).sort().map(([g, c]) => `${g} ${c}`).join(', ')}`);
} else {
  const ch = chartFor(seed, level);
  const evs = botEvents(ch, { jitter, skip, drop: skip * 2, seed });
  const r = replay(seed, level, evs);
  console.log(`${LEVELS[level].name}: ${r.grade} ${r.score} · acc ${r.acc.toFixed(1)}% · combo ${r.maxCombo}/${r.objects} · P${r.perfect} G${r.good} M${r.miss} · mean ${r.meanDt.toFixed(1)} ms`);
  console.log(`?seed=${seed}&lv=${level}&a=${encodeEvents(evs)}`);
}
