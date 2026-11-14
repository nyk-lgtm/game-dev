// Warden fights in detail: per run that reaches depth 10, waves dodged/landed, melee hits, minion damage,
// turns, potions on arrival. Run: npx vite-node scripts/delve/wardenprobe.ts [runs] [firstSeed]
import { MAX_DEPTH, applyAction, decodeAction, newGame } from '../../src/delve/core';
import { playDescent } from './bot';

const runs = Number(process.argv[2] ?? 40);
const first = Number(process.argv[3] ?? 1);
const sum = { fights: 0, won: 0, blastHit: 0, blastMiss: 0, blastDmg: 0, melee: 0, meleeDmg: 0, minions: 0, turns: 0, pots: 0, potsLeft: 0, charges: 0 };
for (let seed = first; seed < first + runs; seed++) {
  const r = playDescent(seed);
  if (r.state.depth < MAX_DEPTH) continue;
  let s = newGame(seed);
  let t0 = -1;
  for (const c of r.actions) {
    const res = applyAction(s, decodeAction(c));
    s = res.state;
    if (s.depth < MAX_DEPTH) continue;
    if (t0 < 0) {
      t0 = s.turn;
      sum.pots += s.player.potions;
    }
    const shot = res.events.some((e) => e.type === 'shot' && e.by === 'warden');
    for (const e of res.events) {
      if (e.type === 'charge') sum.charges++;
      if (e.type === 'hurt' && e.by === 'warden') {
        if (shot) {
          sum.blastHit++;
          sum.blastDmg += e.dmg;
        } else {
          sum.melee++;
          sum.meleeDmg += e.dmg;
        }
      } else if (e.type === 'hurt') sum.minions += e.dmg;
    }
    if (shot && !res.events.some((e) => e.type === 'hurt' && e.by === 'warden')) sum.blastMiss++;
  }
  sum.fights++;
  sum.turns += s.turn - t0;
  if (s.status === 'won') {
    sum.won++;
    sum.potsLeft += s.player.potions;
  }
}
const f = sum.fights;
const n = (x: number, d = 1) => (x / f).toFixed(d);
console.log(`fights ${f}, won ${sum.won} (${((100 * sum.won) / f).toFixed(0)}%), turns ${n(sum.turns)}, potions on arrival ${n(sum.pots)}, left after a win ${(sum.potsLeft / Math.max(1, sum.won)).toFixed(1)}`);
console.log(`per fight: waves ${n(sum.charges)} (landed ${n(sum.blastHit, 2)} for ${n(sum.blastDmg, 0)}, dodged ${n(sum.blastMiss, 2)}), melee hits ${n(sum.melee)} for ${n(sum.meleeDmg, 0)}, minions ${n(sum.minions, 0)}`);
