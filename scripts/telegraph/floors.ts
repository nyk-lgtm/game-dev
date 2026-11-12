// Floor census: enemies per depth over many seeds (average, range, kinds,
// brute range). Run: npx vite-node scripts/telegraph/floors.ts [seeds]
import { generateFloor } from '../../src/telegraph/core/levelgen';

const seeds = Number(process.argv[2] ?? 200);
for (let d = 1; d <= 14; d++) {
  const kinds: Record<string, number> = {};
  let n = 0;
  let lo = Infinity;
  let hi = 0;
  let bruteHi = 0;
  let bruteHeavy = 0;
  for (let s = 1; s <= seeds; s++) {
    const es = generateFloor(s, d).enemies;
    for (const e of es) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    n += es.length;
    lo = Math.min(lo, es.length);
    hi = Math.max(hi, es.length);
    const b = es.filter((e) => e.kind === 'brute').length;
    bruteHi = Math.max(bruteHi, b);
    if (b >= 6) bruteHeavy++;
  }
  const per = Object.entries(kinds)
    .map(([k, c]) => `${k} ${(c / seeds).toFixed(1)}`)
    .join(', ');
  console.log(
    `d${d}: ${(n / seeds).toFixed(1)} enemies [${lo}-${hi}], brutes ≤${bruteHi} (6+ on ${Math.round((100 * bruteHeavy) / seeds)}%) (${per})`,
  );
}
