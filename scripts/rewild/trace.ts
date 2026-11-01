// npx vite-node scripts/rewild/trace.ts <seed> — season by season for the greedy bot.
import { HEXES, RADIUS, apply, census, encode, moisture, newGame, SEASON_NAMES, seasonOf, type GameState } from '../../src/rewild/core';
import { greedyMove } from './bot';

const seed = +(process.argv[2] ?? 1014);
const s = newGame(seed);
const T: Record<string, string> = { shallows: '~', sand: '.', rock: '^', soil: ',', marsh: '"', pond: 'o', sea: ' ' };
const P: Record<string, string> = { lichen: 'l', grass: 'g', reeds: 'r', flowers: 'f', shrub: 's', tree: 'T', fungi: 'm' };
const A: Record<string, string> = { bees: 'B', rabbit: 'R', songbird: 'S', frog: 'F', deer: 'D', fox: 'X', wolf: 'W', beaver: 'V' };
function show(s: GameState) {
  const wet = moisture(s.cells, s.weather);
  const rows: string[] = [];
  for (let r = -RADIUS; r <= RADIUS; r++) {
    let line = '';
    for (let q = -RADIUS; q <= RADIUS; q++) {
      const i = HEXES.findIndex((h) => h.q === q && h.r === r);
      if (i < 0) { line += '     '; continue; }
      const c = s.cells[i];
      line += T[c.t] + c.fert + wet[i] + (c.plant ? P[c.plant.id] : ' ') + (c.animal ? A[c.animal.id] : ' ');
    }
    rows.push(line);
  }
  console.log(rows.join('\n'));
}
show(s);
while (!s.over) {
  const hand = s.hand.join('/');
  const w = s.weather;
  const played: string[] = [];
  let a = greedyMove(s, 1);
  while (a.type !== 'end') {
    played.push(encode(a) + '=' + s.hand[(a as any).card]);
    apply(s, a);
    a = greedyMove(s, 1);
  }
  const ev = apply(s, a)!;
  const c = census(s.cells);
  const deaths = ev.filter((e) => e.type === 'die').map((e) => (e as any).id + ':' + (e as any).why);
  console.log(`S${s.season - 1} ${SEASON_NAMES[seasonOf(s.season - 1)]} ${w} hand ${hand} -> ${played.join(' ') || '-'} | species ${c.species.size} life ${c.life} score ${s.score} | ${[...c.count].map(([k, v]) => k + v).join(' ')} | died ${deaths.join(' ')}`);
}
show(s);
