// Brink trace: `npx vite-node scripts/brink/trace.ts <seed> [light level] [dark level]`
// Plays one AI game and prints every position, the move, the search depth and
// score, and what fell. Prints the move list for `brink/?seed=&a=` at the end.

import { chooseMove, stoneKey, type Level } from '../../src/brink/core/ai';
import { encodeMove, newGame, picture, play, LIGHT, TUNE, useSetup } from '../../src/brink/core/rules';

for (const kv of (process.env.TUNE ?? '').split(',').filter(Boolean)) {
  const [k, v] = kv.split(':');
  (TUNE as Record<string, number>)[k] = Number(v);
}
if (process.env.SETUP) useSetup(Number(process.env.SETUP));

const seed = Number(process.argv[2] ?? 1);
const lv = [process.argv[3] ?? 'normal', process.argv[4] ?? process.argv[3] ?? 'normal'] as Level[];
const s = newGame(seed);
const moves: string[] = [];
const played: number[] = [];
const seen: number[] = [stoneKey(s)];
while (!s.winner && s.ply < 200) {
  const who = s.turn === LIGHT ? 'L' : 'D';
  const ch = chooseMove(s, lv[s.turn - 1], played, seen);
  played.push(ch.move);
  const ev = play(s, ch.move);
  seen.push(stoneKey(s));
  moves.push(encodeMove(ch.move));
  console.log(
    `ply ${s.ply} ${who} ${encodeMove(ch.move)} depth ${ch.depth} score ${ch.score} nodes ${ch.nodes}` +
      `${ev.shovedOff ? ` · shoved off ${'?LD'[ev.shovedOff.side]}` : ''}${ev.crumbleTook ? ` · crumble took ${'?LD'[ev.crumbleTook]}` : ''} · lost L${s.lost[1]} D${s.lost[2]}`,
  );
  console.log(picture(s));
}
console.log(`winner ${'?LD'[s.winner]} after ${s.ply} plies\na=${moves.join(',')}`);
