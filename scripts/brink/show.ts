// Brink puzzle viewer: `npx vite-node scripts/brink/show.ts <pool index | lesson id | record>`
// Prints the position, which tiles fall next, the winning first moves and a main
// line (the solver's move, then the longest defence).

import { POOL } from '../../src/brink/core/pool';
import { LESSONS, bestDefence, decodeRecord, lessonPuzzles, stateOf, winningMoves } from '../../src/brink/core/puzzle';
import { encodeMove, fallsIn, picture, play, type State } from '../../src/brink/core/rules';
import { N } from '../../src/brink/core/board';

const arg = process.argv[2] ?? '0';
let s: State;
let n: number;
const lesson = lessonPuzzles().find((p) => p.id === arg);
if (lesson) {
  s = lesson.state;
  n = lesson.n;
} else {
  const rec = decodeRecord(/^\d+$/.test(arg) ? POOL[Number(arg)] : arg);
  s = stateOf(rec);
  n = rec.n;
}
console.log(picture(s));
const soon = [...Array(N).keys()].filter((c) => fallsIn(s, c) <= 4).map((c) => `${c}:${fallsIn(s, c)}`);
console.log(`ply ${s.ply}, lost L${s.lost[1]} D${s.lost[2]}, win in ${n}; falling soon (cell:plies) ${soon.join(' ')}`);
const w = winningMoves(s, n) ?? [];
console.log(`winning first moves: ${w.map(encodeMove).join(' ')}; faster: ${n > 1 ? (winningMoves(s, n - 1) ?? []).length : 0}`);
const line: string[] = [];
for (let k = n; k >= 1 && !s.winner; k--) {
  const m = (winningMoves(s, k) ?? [])[0];
  if (m === undefined) break;
  play(s, m);
  line.push(encodeMove(m));
  if (s.winner) break;
  const r = bestDefence(s, k - 1);
  play(s, r);
  line.push(`(${encodeMove(r)})`);
}
console.log(`line: ${line.join(' ')} → winner ${'?LD'[s.winner]}`);
console.log(picture(s));
void LESSONS;
