// Sungrazer bot run as a link: `npx vite-node scripts/sungrazer/botrun.ts <seed> [skill] [--json]`
// Prints `?seed=&m=n&a=` for the page (it plays the run back) and the ticks of close shaves,
// sungrazes and zone changes (handy for screenshots: the page's __game.seek(tick)).

import { encodeInputs, finalScore, heldAt, newRun, step, type Ev } from '../../src/sungrazer/core';
import { SKILLS, playBot } from './bot';

const seed = Number(process.argv[2] ?? 1);
const sk = SKILLS[process.argv[3] ?? 'good'];
const { run, inputs } = playBot(seed, 'n', sk, seed * 7 + 1);
const r = newRun(seed, 'n');
const marks: { t: number; k: string; mult?: number }[] = [];
while (r.alive && r.tick <= run.tick) {
  const evs: Ev[] = [];
  const t = r.tick;
  step(r, heldAt(inputs, t), evs);
  for (const e of evs) if (e.k === 'near' || e.k === 'sungraze' || e.k === 'zone' || e.k === 'die') marks.push({ t, k: e.k === 'die' ? `die:${e.cause}` : e.k, mult: e.mult });
}
if (process.argv.includes('--json')) console.log(JSON.stringify({ seed, a: encodeInputs(inputs), tick: run.tick, marks }));
else {
  console.log(`score ${finalScore(run)} in ${(run.tick / 240).toFixed(1)} s`);
  console.log(marks.map((m) => `${m.t}:${m.k}${m.mult ? `×${m.mult}` : ''}`).join(' '));
  console.log(`?seed=${seed}&m=n&a=${encodeInputs(inputs)}`);
}
