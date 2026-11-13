// Wave shapes over many seeds: `npx vite-node scripts/hexhold/waves.ts [seeds]`.
// Average size and the biggest pile of one kind a wave can bring (the spikes players feel).
import { wavePlan, type EnemyId } from '../../src/hexhold/core';

const n = Number(process.argv[2] ?? 200);
const kinds: EnemyId[] = ['brute', 'swarm', 'flyer', 'splitter'];
for (const w of [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 21, 24, 27, 28, 29, 30]) {
  const max: Record<string, number> = {};
  const avg: Record<string, number> = {};
  let size = 0;
  for (let seed = 0; seed < n; seed++) {
    const p = wavePlan(seed, w);
    size += p.length;
    for (const k of kinds) {
      const c = p.filter((x) => x === k).length;
      max[k] = Math.max(max[k] ?? 0, c);
      avg[k] = (avg[k] ?? 0) + c / n;
    }
  }
  console.log(`wave ${w}: ${Math.round(size / n)} enemies; ` + kinds.map((k) => `${k} avg ${avg[k].toFixed(1)} max ${max[k]}`).join(', '));
}
