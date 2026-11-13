// Brink self-play: `npx vite-node scripts/brink/selfplay.ts 40 [hard,hard] [normal,easy …]`
// Plays N seeded games for each pairing (A moves first in half the games, B in
// the other half), and prints wins per level, first-mover wins, game length,
// how games end, and time per move. Pairings default to every level vs itself
// plus hard-normal, normal-easy, hard-easy.
// TUNE=target:3,crumbleStart:6 tries other rules; W=threat:60 other weights; SETUP=1 another start.

import { LEVELS, W, chooseMove, type Level } from '../../src/brink/core/ai';
import { DARK, LIGHT, TUNE, newGame, play, useSetup, type Side } from '../../src/brink/core/rules';

const n = Number(process.argv[2] ?? 20);
const seed0 = Number(process.env.SEED ?? 1);
for (const kv of (process.env.TUNE ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  (TUNE as Record<string, number>)[k] = Number(v);
}
for (const kv of (process.env.W ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  (W as unknown as Record<string, number>)[k] = Number(v);
}
// LV=normal.depth:3,easy.noise:200 tries other level settings.
for (const kv of (process.env.LV ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  const [l, f] = k.split('.');
  (LEVELS[l as Level] as unknown as Record<string, number>)[f] = Number(v);
}
if (process.env.SETUP) useSetup(Number(process.env.SETUP));
const pairs: [Level, Level][] = process.argv.slice(3).length
  ? process.argv.slice(3).map((p) => p.split(',') as [Level, Level])
  : [['easy', 'easy'], ['normal', 'normal'], ['hard', 'hard'], ['normal', 'easy'], ['hard', 'normal'], ['hard', 'easy']];

const times: Record<string, number[]> = { easy: [], normal: [], hard: [] };
const pct = (a: number, b: number) => `${Math.round((100 * a) / Math.max(1, b))}%`;
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

console.log(`rules: target ${TUNE.target}, crumble from ply ${TUNE.crumbleStart}`);
for (const [A, B] of pairs) {
  let winsA = 0;
  let firstWins = 0;
  let crumbleEnds = 0;
  const plies: number[] = [];
  for (let k = 0; k < n; k++) {
    const seed = seed0 + k;
    // A plays light in even games, dark in odd; light always moves first here.
    const aSide: Side = k % 2 === 0 ? LIGHT : DARK;
    const s = newGame(seed, LIGHT);
    let lastCrumble = false;
    while (!s.winner && s.ply < 200) {
      const lvl = s.turn === aSide ? A : B;
      const t0 = performance.now();
      const ch = chooseMove(s, lvl);
      times[lvl].push(performance.now() - t0);
      if (ch.move < 0) throw new Error(`no move on seed ${seed} ply ${s.ply}`);
      const ev = play(s, ch.move);
      lastCrumble = !!ev.crumbleTook;
    }
    if (s.winner === aSide) winsA++;
    if (s.winner === LIGHT) firstWins++;
    if (lastCrumble) crumbleEnds++;
    plies.push(s.ply);
  }
  console.log(
    `${A.padEnd(6)} vs ${B.padEnd(6)}: ${A} wins ${pct(winsA, n)}, first mover wins ${pct(firstWins, n)}, ` +
      `median ${median(plies)} plies (min ${Math.min(...plies)}, max ${Math.max(...plies)}), last stone to a crumble ${pct(crumbleEnds, n)}`,
  );
}
for (const l of Object.keys(LEVELS) as Level[]) {
  const t = times[l];
  if (!t.length) continue;
  t.sort((a, b) => a - b);
  console.log(`${l}: ms per move median ${t[t.length >> 1].toFixed(1)}, p90 ${t[Math.floor(t.length * 0.9)].toFixed(1)}, max ${t[t.length - 1].toFixed(1)}`);
}
