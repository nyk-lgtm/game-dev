// Summit trace: `npx vite-node scripts/summit/trace.ts <seed> [floors]`
// Prints the bot's run move by move: the board before each draw, plays and charms.
// Prints the action list at the end, for `summit/?seed=&a=`.

import { FLOORS, RANKS, SUITS, act, cardsLeft, isCovered, newRun, top, type Card, type Run } from '../../src/summit/core';
import { botAction } from './bot';

const seed = Number(process.argv[2] ?? 1);
const upTo = Number(process.argv[3] ?? FLOORS);
const name = (c: Card) => (c.r === 0 ? '★' : `${RANKS[c.r]}${SUITS[c.s]}`);

function board(r: Run): string {
  const d = r.deal;
  const lines: string[] = [];
  for (let row = 0; row < d.rows; row++) {
    // Three characters per half-card column; a card takes six.
    let line = '';
    d.slots.forEach((s, i) => {
      if (s.row !== row) return;
      line = line.padEnd(s.x * 3);
      const c = isCovered(d, i);
      line += s.gone ? '  ..  ' : s.down ? ' [##] ' : `${c ? '(' : '['}${name(s.card).padStart(3)}${c ? ')' : ']'} `;
    });
    lines.push(line);
  }
  return lines.join('\n');
}

const r = newRun(seed);
let lastFloor = -1;
while (r.phase !== 'over' && r.floor < upTo) {
  if (r.floor !== lastFloor && r.phase === 'play') {
    lastFloor = r.floor;
    console.log(`\n=== floor ${r.floor + 1} (${r.deal.layout}), ${r.deal.stock.length} draws, charms: ${r.charms.join(' ') || '-'}`);
    console.log(board(r));
  }
  const a = botAction(r);
  const before = r.phase === 'play' ? name(top(r.deal)) : '';
  const o = act(r, a)!;
  if (o.kind === 'play') console.log(`  ${before} → ${name(r.deal.waste[r.deal.waste.length - 1] ?? top(r.deal))} +${o.points}${o.refund ? ` (+${o.refund} draw)` : ''}`);
  else if (o.kind === 'draw') console.log(`draw → ${name(top(r.deal))} (${r.deal.stock.length} left, ${cardsLeft(r.deal)} cards up)`);
  else console.log(a, JSON.stringify(o));
}
console.log(`\nfloor ${r.floor + 1}, score ${r.score}, ${r.won ? 'won' : r.phase}`);
console.log(`a=${r.actions.join(',')}`);
