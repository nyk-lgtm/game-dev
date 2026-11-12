// Summit calibration: `npx vite-node scripts/summit/curve.ts 300`
// For each floor (no charms) and a range of draw counts, the share of deals the
// bot clears. Used to set DEAL_DRAWS.

import { DEAL_DRAWS, FLOORS, act, startAt } from '../../src/summit/core';
import { botAction } from './bot';

const n = Number(process.argv[2] ?? 200);
for (let f = 0; f < FLOORS; f++) {
  const row: string[] = [];
  for (let draws = 14; draws <= 34; draws += 2) {
    DEAL_DRAWS[f] = draws;
    let ok = 0;
    for (let k = 0; k < n; k++) {
      const r = startAt(5000 + k, f);
      while (r.phase === 'play') act(r, botAction(r));
      if (r.cleared) ok++;
    }
    row.push(`${draws}:${Math.round((ok / n) * 100)}`);
  }
  console.log(`floor ${f + 1}: ${row.join(' ')}`);
}

