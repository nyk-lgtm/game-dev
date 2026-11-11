// Puzzle stats per size: `npx vite-node scripts/triad/stats.ts 30`.
import { SIZES, depth, generate, makeBoard } from '../../src/triad/core/puzzle';

const n = Number(process.argv[2] ?? 30);
for (const [name, { radius }] of Object.entries(SIZES)) {
  const N = makeBoard(radius).cells.length;
  const t0 = performance.now();
  const rows = [...Array(n).keys()].map((k) => generate(1000 + k, radius));
  const ms = (performance.now() - t0) / n;
  const avg = (f: (p: (typeof rows)[0]) => number) => (rows.reduce((a, p) => a + f(p), 0) / n).toFixed(1);
  console.log(
    `${name} (${N} cells): clues ${avg((p) => p.clue.filter((c) => c >= 0).length)}, givens ${avg((p) => p.given.filter((g) => g >= 0).length)}, rounds ${avg(depth)}, ${ms.toFixed(1)} ms each`,
  );
}
