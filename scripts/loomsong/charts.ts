// Loomsong chart probe: `npx vite-node scripts/loomsong/charts.ts 40`
// Builds N songs (from SEED, default 1) and prints, per level: notes a second (range and median, and the
// busiest 4 s), holds, flicks, chords, lane balance, the longest same-lane run, plus song lengths and tempos.
// V=1 lists every song.

import { LEVELS, chartStats, keyName, makeChart, makeSong, type Level } from '../../src/loomsong/core';

const n = Number(process.argv[2] ?? 30);
const first = Number(process.env.SEED ?? 1);
const t0 = performance.now();
const per = LEVELS.map(() => ({ nps: [] as number[], peak: [] as number[], holds: 0, flicks: 0, chords: 0, notes: 0, lanes: [0, 0, 0, 0], maxJack: 0, ms: 0 }));
const lens: number[] = [], bpms: number[] = [];
let songMs = 0;
for (let k = 0; k < n; k++) {
  const seed = first + k;
  const s0 = performance.now();
  const song = makeSong(seed);
  songMs += performance.now() - s0;
  lens.push(song.durationMs / 1000);
  bpms.push(song.bpm);
  const line: string[] = [];
  for (let lv = 0; lv < LEVELS.length; lv++) {
    const c0 = performance.now();
    const ch = makeChart(song, lv as Level);
    per[lv].ms += performance.now() - c0;
    const s = chartStats(ch, song);
    const p = per[lv];
    p.nps.push(s.nps);
    p.peak.push(s.peak);
    p.holds += s.holds;
    p.flicks += s.flicks;
    p.chords += s.chords;
    p.notes += s.notes;
    s.lanes.forEach((x, i) => (p.lanes[i] += x));
    p.maxJack = Math.max(p.maxJack, s.maxJack);
    line.push(`${LEVELS[lv].name[0]} ${s.notes} (${s.nps.toFixed(2)}/s, ${s.holds}h ${s.flicks}f ${s.chords}c)`);
  }
  if (process.env.V) console.log(`#${seed} ${song.name} · ${keyName(song)} · ${song.bpm} BPM · ${(song.durationMs / 1000).toFixed(0)} s · ${song.sections.map((x) => x.kind[0] + x.bars).join(' ')} · ${line.join(' · ')}`);
}
const med = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
const fmt = (a: number[]) => `${Math.min(...a).toFixed(2)}-${Math.max(...a).toFixed(2)} (median ${med(a).toFixed(2)})`;
console.log(`${n} songs: length ${Math.min(...lens).toFixed(0)}-${Math.max(...lens).toFixed(0)} s (median ${med(lens).toFixed(0)}), tempo ${Math.min(...bpms)}-${Math.max(...bpms)} BPM, ${(songMs / n).toFixed(1)} ms/song`);
for (let lv = 0; lv < LEVELS.length; lv++) {
  const p = per[lv];
  const tot = p.lanes.reduce((a, b) => a + b, 0);
  console.log(
    `${LEVELS[lv].name.padEnd(6)} notes/s ${fmt(p.nps)} · busiest 4 s ${fmt(p.peak)} · per song ${(p.notes / n).toFixed(0)} notes, ${(p.holds / n).toFixed(1)} holds, ${(p.flicks / n).toFixed(1)} flicks, ${(p.chords / n).toFixed(1)} chords · lanes ${p.lanes.map((x) => ((100 * x) / tot).toFixed(0) + '%').join('/')} · max same-lane run ${p.maxJack} · ${(p.ms / n).toFixed(1)} ms/chart`,
  );
}
console.log(`${((performance.now() - t0) / 1000).toFixed(1)} s`);
