// Puzzle stats per size: `npx vite-node scripts/triad/stats.ts 30`.
import { LEVELS, SIZES, depth, generate, makeBoard, type Level } from '../../src/triad/core/puzzle';

const n = Number(process.argv[2] ?? 30);
for (const level of Object.keys(LEVELS) as Level[])
for (const [name, { radius }] of Object.entries(SIZES)) {
  const N = makeBoard(radius).cells.length;
  const t0 = performance.now();
  const rows = [...Array(n).keys()].map((k) => generate(1000 + k, radius, level));
  const ms = (performance.now() - t0) / n;
  const avg = (f: (p: (typeof rows)[0]) => number) => (rows.reduce((a, p) => a + f(p), 0) / n).toFixed(1);
  console.log(
    `${level} ${name} (${N} cells): clues ${avg((p) => p.clue.filter((c) => c >= 0).length)}, givens ${avg((p) => p.given.filter((g) => g >= 0).length)}, rounds ${avg(depth)}, ${ms.toFixed(1)} ms each`,
  );
}

// How many "what if" steps Hard puzzles need.
import { initialDomains, propagateDeep, type Trial } from '../../src/triad/core/puzzle';
for (const radius of [2, 3, 4]) {
  const counts: number[] = [];
  for (let k = 0; k < n; k++) {
    const p = generate(1000 + k, radius, 'hard');
    const trials: Trial[] = [];
    propagateDeep(makeBoard(radius), p.clue, initialDomains(p), trials);
    counts.push(trials.length);
  }
  console.log(`hard r${radius}: what-ifs per puzzle`, counts.sort((a, b) => a - b).join(' '));
}
