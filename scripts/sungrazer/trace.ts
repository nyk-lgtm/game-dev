// Sungrazer trace: `npx vite-node scripts/sungrazer/trace.ts <seed> [skill]`
// Plays a bot run and prints every event (grabs, releases, links, deaths) with its tick
// (BOTLOG=1 adds the bot's release plans; A=1 prints the inputs for ?seed=&a=).

import { altitude, encodeInputs, finalScore, heldAt, newRun, step, type Ev } from '../../src/sungrazer/core';
import { SKILLS, playBot } from './bot';

const seed = Number(process.argv[2] ?? 1);
const sk = SKILLS[process.argv[3] ?? 'human'];
const { run, inputs } = playBot(seed, 'n', sk, seed * 7 + 1);
const r = newRun(seed, 'n');
while (r.alive && r.tick <= run.tick) {
  const evs: Ev[] = [];
  const t = r.tick;
  step(r, heldAt(inputs, t), evs);
  for (const ev of evs) {
    const s = ev.k === 'grab' ? r.world.stars.find((x) => x.id === ev.n)! : null;
    const extra = s ? ` star#${s.id} (${s.x.toFixed(1)},${s.y.toFixed(1)}) r${s.r.toFixed(1)} ${s.kind} d=${Math.hypot(s.x - ev.x, s.y - ev.y).toFixed(1)}` : '';
    console.log(`${String(t).padStart(6)} ${ev.k.padEnd(8)} at (${ev.x.toFixed(1)}, ${ev.y.toFixed(1)})${ev.pts ? ` +${Math.round(ev.pts)}` : ''}${ev.mult ? ` ×${ev.mult}` : ''}${ev.cause ? ` ${ev.cause}` : ''}${extra}`);
  }
}
console.log(`${(run.tick / 240).toFixed(1)} s, alt ${Math.round(altitude(run))}, score ${finalScore(run)}, cam ${run.camY.toFixed(1)}`);
console.log(`inputs: ${inputs.slice(-12).join(' ')}`);
if (process.env.A) console.log(`?seed=${seed}&a=${encodeInputs(inputs)}`);
