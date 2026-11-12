// Puzzle stats per mode, level and size: `npx vite-node scripts/triad/stats.ts 30 [numbers|links]`.
import { CLUE_MODES, LEVELS, SIZES, depth, generate, initialDomains, makeBoard, propagateDeep, type ClueMode, type Level, type Trial } from '../../src/triad/core/puzzle';

const n = Number(process.argv[2] ?? 30);
const modes = process.argv[3] ? [process.argv[3] as ClueMode] : (Object.keys(CLUE_MODES) as ClueMode[]);
for (const mode of modes) {
  console.log(`-- ${CLUE_MODES[mode].name}`);
  for (const level of Object.keys(LEVELS) as Level[])
    for (const [name, { radius }] of Object.entries(SIZES)) {
      const N = makeBoard(radius).cells.length;
      const t0 = performance.now();
      const rows = [...Array(n).keys()].map((k) => generate(1000 + k, radius, level, mode));
      const ms = (performance.now() - t0) / n;
      const avg = (f: (p: (typeof rows)[0]) => number) => (rows.reduce((a, p) => a + f(p), 0) / n).toFixed(1);
      const links = mode === 'links' ? `, links ${avg((p) => p.clue.slice(N).filter((c) => c >= 0).length)}` : '';
      console.log(
        `${level} ${name} (${N} cells): numbers ${avg((p) => p.clue.slice(0, N).filter((c) => c >= 0).length)}${links}, givens ${avg((p) => p.given.filter((g) => g >= 0).length)}, rounds ${avg(depth)}, ${ms.toFixed(1)} ms each`,
      );
    }
  // How many "what if" steps Hard puzzles need.
  for (const radius of [2, 3, 4]) {
    const counts: number[] = [];
    for (let k = 0; k < n; k++) {
      const p = generate(1000 + k, radius, 'hard', mode);
      const trials: Trial[] = [];
      propagateDeep(makeBoard(radius), p.clue, initialDomains(p), trials, false);
      counts.push(trials.length);
    }
    console.log(`hard r${radius}: what-ifs per puzzle`, counts.sort((a, b) => a - b).join(' '));
  }
}
