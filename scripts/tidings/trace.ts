// Tidings trace: `npx vite-node scripts/tidings/trace.ts <seed> [policy]`
// Prints a bot journey stop by stop (hand, choices, rolls, legs, resources) and
// the `?seed=&a=` link that replays it.

import { CARD, KIND_INFO, LAST, RES, RES_INFO, act, newRun, nodeOf, telling, type Fx, type Run } from '../../src/tidings/core';
import { POLICIES, careful, mulberry } from './bot';

const seed = Number(process.argv[2] ?? 1);
const name = process.argv[3] ?? 'careful';
const pol = name === 'careful' ? careful() : POLICIES[name];
const fxs = (fx: Fx) => RES.filter((k) => fx[k]).map((k) => `${fx[k]! > 0 ? '+' : ''}${fx[k]}${k}`).join(' ') || '-';
const res = (r: Run) => RES.map((k) => `${RES_INFO[k].icon}${r.res[k]}`).join(' ');
const r = newRun(seed);
const rng = mulberry(seed ^ 0x5bd1e995);
let stop = -1;
while (r.phase !== 'over') {
  if (r.stop !== stop) {
    stop = r.stop;
    const node = nodeOf(r);
    console.log(`\n#${stop} ${KIND_INFO[node.kind].icon} ${node.name}  ${res(r)}  band ${r.band.map((b) => b.id).join(',') || '-'}  leg ${fxs(r.legs[stop])}`);
    console.log(`  hand: ${r.hand.map((h) => `${telling(h).title}${CARD[h.id].must ? '⚑' : ''}${CARD[h.id].cb ? '✦' : ''}`).join(' | ')}`);
    if (stop < LAST - 1) console.log(`  roads: ${r.map[stop + 1].map((n) => `${KIND_INFO[n.kind].icon}${n.name}`).join(' / ')}`);
  }
  const a = pol(r, rng);
  if (a[0] === 'P') {
    const hc = r.hand[Number(a[1])];
    const ch = CARD[hc.id].choices[Number(a[3])];
    act(r, a);
    console.log(`  ${telling(hc).title}: “${ch.t}”${hc.won === undefined ? '' : hc.won ? ' (won)' : ' (lost)'} → ${fxs(hc.got!)}   ${res(r)}`);
  } else act(r, a);
}
console.log(`\nEND ${r.end!.ending} at stop ${r.stop}${r.end!.cause ? ` (out of ${r.end!.cause})` : ''} score ${r.end!.score} ★${r.end!.stars}  ${res(r)}`);
console.log(`?seed=${seed}&a=${r.actions.join(',')}`);
