// Tidings variety probe: `npx vite-node scripts/tidings/variety.ts 1000 [card ids…]`
// Plays casual journeys (resources topped up so every run walks the whole road) and
// prints how often each card is dealt per run (top 12), the named cards, how
// varied stop 10's hands are, and, with RECENT=1, the same with each run leaning
// away from the cards of the 3 runs before it (as the page does).
import { CARD, act, newRun } from '../../src/tidings/core';
import { casual, mulberry } from './bot';

const n = Number(process.argv[2] ?? 1000);
const ids = process.argv.slice(3);
const seen: Record<string, number> = {};
const last: Record<string, number> = {};
const prev: string[][] = [];
for (let s = 0; s < n; s++) {
  const recent = process.env.RECENT ? [...new Set(prev.flat())] : [];
  const r = newRun(s, recent);
  const rng = mulberry(s);
  const got = new Set<string>();
  while (r.phase !== 'over') {
    for (const h of r.hand) got.add(h.id);
    if (r.stop === 10 && r.phase === 'cards' && r.faced === 0) for (const h of r.hand) last[h.id] = (last[h.id] ?? 0) + 1;
    r.res.f = r.res.o = r.res.h = r.res.t = 8;
    act(r, casual(r, rng));
  }
  for (const id of got) seen[id] = (seen[id] ?? 0) + 1;
  prev.push([...r.used]);
  if (prev.length > 3) prev.shift();
}
const pc = (v: number) => `${Math.round((100 * v) / n)}%`;
const top = (o: Record<string, number>, k: number) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k).map(([id, v]) => `${CARD[id].title} ${pc(v)}`).join(', ');
console.log(`dealt per run, top: ${top(seen, 12)}`);
if (ids.length) console.log(ids.map((id) => `${id} ${pc(seen[id] ?? 0)}`).join(', '));
console.log(`stop 10 hands: ${top(last, 8)}`);
