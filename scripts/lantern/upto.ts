// The completion bot's actions up to its first arrival on a map (plus N more actions), for
// `lantern/?seed=<seed>&a=<actions>` (screenshots, reproducing a spot).
// Run: npx vite-node scripts/lantern/upto.ts <seed> <village|forest|cave1|cave2> [extra]
import { applyAction, decodeAction, newGame } from '../../src/lantern/core';
import { playCompletion } from './bot';

const seed = Number(process.argv[2] ?? 1);
const map = process.argv[3] ?? 'cave2';
const extra = Number(process.argv[4] ?? 0);
const { actions } = playCompletion(seed);
let s = newGame(seed);
let n = 0;
for (; n < actions.length && s.player.map !== map; n++) s = applyAction(s, decodeAction(actions[n])).state;
const a = actions.slice(0, Math.min(actions.length, n + extra));
console.log(`turn ${s.turn} L${s.player.level} hp ${s.player.hp}/${s.player.maxHp} on ${s.player.map} after ${n} actions`);
console.log(`?seed=${seed}&a=${a}`);
