// Simmer: print a bot season night by night.
// `npx vite-node scripts/simmer/trace.ts <seed> [strategy]` (prints the `?seed=&a=` too).

import { DISHES, INGS, SPECIES, WEATHER, newRun, scoreOf, starsOf } from '../../src/simmer/core';
import { STRATS, planDay } from './bot';

const seed = Number(process.argv[2] ?? 1);
const s = STRATS[process.argv[3] ?? 'clever'];
const r = newRun(seed);
while (!r.over) {
  const day = r.day;
  const coins0 = r.coins;
  const acts = planDay(r, s);
  const l = r.ledgers[r.ledgers.length - 1];
  const menu = l.menu.map((m, i) => `${DISHES[m.dish].icon}${m.price}¢×${l.sold[i]}`).join(' ');
  const left = Object.entries(l.left).map(([k, v]) => `${k} ${v}`).join(', ');
  const kinds: Record<string, number> = {};
  for (const g of r.night!.guests) kinds[SPECIES[g.sp].icon] = (kinds[SPECIES[g.sp].icon] ?? 0) + 1;
  console.log(
    `N${day + 1} ${WEATHER[l.ctx.weather].icon}${l.ctx.festival ? '🏮' : ''}${l.ctx.payday ? '💰' : ''} coins ${coins0}→${r.coins} rep ${r.rep} (${l.rep >= 0 ? '+' : ''}${l.rep})` +
      ` | ${acts.filter((a) => a[0] !== 'o').join(' ')} | ${menu}${l.helper ? ' +helper' : ''} | guests ${l.guests} (${Object.entries(kinds).map(([k, v]) => k + v).join(' ')}) served ${l.served} delighted ${l.delighted}` +
      ` | left: ${left || '-'} | waste ${l.wasted.map((w, i) => (w ? `${INGS[i].icon}${w}` : '')).join('')} ${l.wasteCost}¢`,
  );
}
console.log(`score ${scoreOf(r)} (${starsOf(scoreOf(r))}★) coins ${r.coins} rep ${r.rep}`);
console.log(`?seed=${seed}&a=${r.actions.join(',')}`);
