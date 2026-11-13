// Kitbag trace: `npx vite-node scripts/kitbag/trace.ts <seed> [maxActions]`
// Plays one bot run and prints every fight turn: the roll, the intent, what the
// bot placed and what happened, plus map picks and rewards. Ends with the
// action list for `kitbag/?seed=&a=`.

import { act, attackOf, enemyDef, gearName, intentOf, newRun, slotsOf, fxText, type Intent } from '../../src/kitbag/core';
import { botAction } from './bot';

const seed = Number(process.argv[2] ?? 1);
const max = Number(process.argv[3] ?? 5000);
const r = newRun(seed);
const intentText = (it: Intent) =>
  Object.entries(it)
    .map(([k, v]) => `${k}${v === true ? '' : ` ${v}`}`)
    .join(', ');
let line = '';
for (let i = 0; i < max && r.phase !== 'over'; i++) {
  const a = botAction(r);
  const before = r.phase;
  if (before === 'fight' && !line) {
    const f = r.fight!;
    const e = f.enemy;
    line = `  t${f.turn} hp ${r.hp}/${r.maxHp} vs ${enemyDef(e.id).name} ${e.hp}/${e.max}${e.block ? ` [${e.block}]` : ''}${e.poison ? ` ☠${e.poison}` : ''} | roll ${f.pool.map((p) => (p.locked ? `(${p.v})` : p.v)).join(' ')} | intent ${intentText(intentOf(e))} (${attackOf(e, intentOf(e))}) |`;
  }
  if (a[0] === 'P') {
    const [d, c, s] = a.slice(1).split('.').map(Number);
    line += ` ${r.fight!.pool[d].v}→${gearName(r.gear[c])}(${fxText(slotsOf(r.gear[c])[s])})`;
  }
  if (before === 'map') {
    const n = r.map[r.floor][Number(a[1])];
    console.log(`floor ${r.floor + 1}: ${n.kind}${n.foe ? ` ${enemyDef(n.foe).name}` : ''}`);
  }
  if (before === 'choice') {
    const c = r.choice!;
    const k = a[0] === 'S' ? -1 : Number(a.slice(1).split('.')[0]);
    console.log(`  ${c.kind}: ${c.options.map((o, j) => `${j === k ? '*' : ''}${o.cost ? `-${o.cost}hp ` : ''}${o.gifts.map((g) => JSON.stringify(g)).join('+')}`).join(' | ')}${k < 0 ? ' (skip)' : ''}`);
  }
  const o = act(r, a);
  if (!o) {
    console.log('illegal', a);
    break;
  }
  if (line && (a[0] === 'E' || r.phase !== 'fight')) {
    if (o.kind === 'end') line += ` | took ${o.hurt}`;
    console.log(line);
    line = '';
  }
}
if (line) console.log(line);
console.log(`${r.phase} ${r.won ? 'WON' : `floor ${r.floor + 1}`} score ${r.score} killedBy ${r.killedBy} · gear ${r.gear.map(gearName).join(', ')} · dice ${r.dice.map((d) => d.faces.join('')).join(' ')}`);
console.log(`a=${r.actions.join(',')}`);
