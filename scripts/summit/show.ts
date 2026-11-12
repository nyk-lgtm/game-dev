// `npx vite-node scripts/summit/show.ts <seed> <actions>`: the board after a replay,
// one line per card still on the table (row, column, face, covered).

import { RANKS, SUITS, isCovered, replay } from '../../src/summit/core';

const r = replay(Number(process.argv[2] ?? 1), (process.argv[3] ?? '').split(',').filter(Boolean));
const d = r.deal;
console.log(`floor ${r.floor + 1} ${d.layout} phase ${r.phase} stock ${d.stock.length} waste ${RANKS[d.waste[d.waste.length - 1].r]}`);
d.slots.forEach((s, i) => {
  if (!s.gone) console.log(`#${i} row ${s.row} x ${s.x} ${RANKS[s.card.r]}${SUITS[s.card.s] ?? ''}${s.down ? ' down' : ''}${isCovered(d, i) ? ' covered' : ''}`);
});
