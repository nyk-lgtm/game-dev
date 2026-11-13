// Lists the trail: `npx vite-node scripts/trestle/trail.ts [from] [to]`
// One line per level: goal, span or rings, cart/lantern weight, wind, pegs, par and budget.

import { trailLevel, px, py, ringsOf } from '../../src/trestle/core';

const from = Number(process.argv[2] ?? 1);
const to = Number(process.argv[3] ?? 30);
for (let n = from; n <= to; n++) {
  const l = trailLevel(n);
  const g = l.goal;
  const what = g.kind === 'cross' ? `cross span ${px(g.to) - px(g.from)}${py(g.to) !== py(g.from) ? ' tilted' : ''} cart ${g.cart}` : `reach ${ringsOf(l).length} ring${ringsOf(l).length > 1 ? 's' : ''} lantern ${g.weight}`;
  console.log(`${String(n).padStart(3)} ${l.name.padEnd(18)} ${what.padEnd(28)}${l.wind ? ` wind ${l.wind}` : ''} pegs ${l.anchors.length} · par ${l.par}/${l.parParts} budget ${l.budget}${l.tip && n > 6 ? ` — ${l.tip.replace(/^(Get|Hold)[^.]*\. /, "")}` : ""}`);
}
