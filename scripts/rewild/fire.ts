// npx vite-node scripts/rewild/fire.ts [games] [lookahead] [greedy|random] — how much wildfire matters to the greedy bot.
// Per lightning summer: did it strike, cells burnt, what was dry and full grown (at risk) when the
// season began, what would burn if you played nothing, whether the bot plays differently than in a
// plain drought, and the whole game's score with every lightning summer turned into a drought.
import { apply, canBurn, clone, encode, moisture, newGame, starsFor, type Action, type GameState } from '../../src/rewild/core';
import { Rng, mixSeed } from '../../src/shared/rng';
import { greedyMove, legal } from './bot';

const n = +(process.argv[2] ?? 16);
const look = +(process.argv[3] ?? 1);
const who = process.argv[4] ?? 'greedy';

/** Burns in this season's forecast if the season ended now. */
const burnsIfEnded = (s: GameState) => apply(clone(s), { type: 'end' })!.filter((e) => e.type === 'burn').length;
const atRisk = (s: GameState) => {
  const wet = moisture(s.cells, s.weather);
  return s.cells.filter((c, i) => canBurn(c, wet[i])).length;
};

const kinds = new Map<string, number>();

function play(seed: number, fire: boolean, log?: (row: number[]) => void) {
  const s = newGame(seed);
  const rng = new Rng(mixSeed(seed, 77));
  const move = (t: GameState): Action => {
    if (who !== 'random') return greedyMove(t, look);
    const l = legal(t);
    return l.length && t.plays > 0 ? rng.pick(l) : { type: 'end' };
  };
  while (!s.over) {
    if (!fire && s.weather === 'fire') {
      s.weather = 'drought';
      s.fireAt = -1;
    }
    const isFire = s.weather === 'fire';
    const risk = isFire ? atRisk(s) : 0;
    const idle = isFire ? burnsIfEnded(s) : 0;
    let changed = 0;
    if (isFire && who !== 'random') {
      // Same state, same hand, but a drought: does the bot pick differently?
      const d = clone(s);
      d.weather = 'drought';
      d.fireAt = -1;
      const seq = (t: GameState) => {
        const out: string[] = [];
        for (let a = greedyMove(t, look); ; a = greedyMove(t, look)) {
          out.push(encode(a));
          if (a.type === 'end') break;
          apply(t, a);
        }
        return out.join(',');
      };
      changed = seq(clone(s)) !== seq(d) ? 1 : 0;
    }
    let a: Action = move(s);
    while (a.type !== 'end') {
      apply(s, a);
      a = move(s);
    }
    const before = isFire ? burnsIfEnded(s) : 0;
    const ev = apply(s, a)!;
    if (isFire) {
      const burnt = ev.filter((e) => e.type === 'burn').length;
      const deaths = ev.filter((e) => e.type === 'die' && e.why === 'burnt').length;
      for (const e of ev) if ((e.type === 'die' || e.type === 'shrink') && e.why === 'burnt') kinds.set(`${e.id}${e.type === 'shrink' ? '-' : ''}`, (kinds.get(`${e.id}${e.type === 'shrink' ? '-' : ''}`) ?? 0) + 1);
      log?.([s.season - 1, risk, idle, burnt, deaths, changed, before]);
    }
  }
  return s;
}

const rows: number[][] = [];
const deltas: number[] = [];
let fireGames = 0;
const sc: number[] = [];
const stars = [0, 0, 0, 0];
for (let k = 0; k < n; k++) {
  const seed = 1000 + k * 7;
  let fires = 0;
  const s = play(seed, true, (r) => {
    rows.push(r);
    fires++;
  });
  if (fires) fireGames++;
  const d = play(seed, false);
  sc.push(s.score);
  stars[starsFor(s.score)]++;
  deltas.push(s.score - d.score);
  if (process.env.V) console.log(`seed ${seed}: score ${s.score} (no fire ${d.score}), lightning summers ${fires}`);
}
const med = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const col = (i: number) => rows.map((r) => r[i]);
const avg = (i: number) => (sum(col(i)) / Math.max(1, rows.length)).toFixed(2);
console.log(`${who}(look ${look}) x${n}: score median ${med(sc)}, stars 0-3 ${stars.join('/')}`);
console.log(`lightning summers: ${rows.length} (${(rows.length / n).toFixed(2)} a game, ${fireGames}/${n} games have one)`);
console.log(`  strikes that burnt anything: ${col(3).filter((x) => x > 0).length}; cells burnt total ${sum(col(3))} (avg ${avg(3)}, max ${Math.max(0, ...col(3))}); burnt deaths ${sum(col(4))}`);
console.log(`  burnt (id- = animal hurt, not killed): ${[...kinds].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}`);
console.log(`  burnable when the summer opens (canBurn, before grazing): avg ${avg(1)}`);
console.log(`  burn plan if you play nothing: avg ${avg(2)} (something burns in ${col(2).filter((x) => x > 0).length}); after the bot's plays ${avg(6)}`);
console.log(`  bot plays differently than in a plain drought: ${sum(col(5))}/${rows.length}`);
console.log(`score minus the same game with every lightning summer a drought: median ${med(deltas)}, mean ${(sum(deltas) / n).toFixed(1)}, min ${Math.min(...deltas)}, nonzero ${deltas.filter((x) => x !== 0).length}/${n}`);
if (process.env.ROWS) for (const r of rows) console.log('  S' + r[0], 'risk', r[1], 'idle', r[2], 'burnt', r[3], 'deaths', r[4], 'changed', r[5]);
