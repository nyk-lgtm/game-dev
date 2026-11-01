// npx vite-node scripts/rewild/probe.ts [games] — what kills each species, and how often it's played.
import { apply, newGame, type SimEvent } from '../../src/rewild/core';
import { greedyMove } from './bot';

const n = +(process.argv[2] ?? 10);
const deaths = new Map<string, number>();
const plays = new Map<string, number>();
for (let k = 0; k < n; k++) {
  const s = newGame(5000 + k);
  while (!s.over) {
    const a = greedyMove(s, 1);
    if (a.type === 'place') plays.set(s.hand[a.card], (plays.get(s.hand[a.card]) ?? 0) + 1);
    const ev = apply(s, a) as SimEvent[];
    for (const e of ev) if (e.type === 'die') deaths.set(`${e.id}:${e.why}`, (deaths.get(`${e.id}:${e.why}`) ?? 0) + 1);
  }
}
console.log('plays', [...plays].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
console.log('deaths', [...deaths].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', '));
