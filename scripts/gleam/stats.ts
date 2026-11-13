// Generator stats per size: `npx vite-node scripts/gleam/stats.ts 100 [small|medium|large]`.
// Time to generate (median / p90 / max), attempts, board contents, uniqueness re-checked
// with the exact solver (must be 100%), and the deduction depth the human model needs
// (1 = every step is "if this went here, something breaks at once"; 2 = a step needs one
// more look ahead), plus how many depth-2 steps a puzzle has, and what a Hint costs.
import { SIZES, blankBoard, deduce, generate, lastAttempts, nextHint, rejects, setCode, solveAll, status, type Size } from '../../src/gleam/core';

const n = Number(process.argv[2] ?? 100);
const sizes = process.argv[3] ? [process.argv[3] as Size] : (Object.keys(SIZES) as Size[]);
const q = (xs: number[], f: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(f * xs.length))];
const avg = (xs: number[]) => (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1);

for (const size of sizes) {
  for (const k of Object.keys(rejects)) delete rejects[k];
  const ms: number[] = [];
  const att: number[] = [];
  const rows: { sockets: number; pieces: number; lit: number; dark: number; mixed: number; givens: number; depth: number; deep: number; elim: number; types: number }[] = [];
  const hintMs: number[] = [];
  let unique = 0;
  let valid = 0;
  for (let k = 0; k < n; k++) {
    const seed = 1000 + k;
    const t0 = performance.now();
    const p = generate(seed, size);
    ms.push(performance.now() - t0);
    att.push(lastAttempts);
    if (solveAll(p, 2).length === 1) unique++;
    if (status(p, p.solution).solved) valid++;
    const d = deduce(p, SIZES[size].maxDepth);
    // Follow hints from a blank board (what the Hint button costs).
    let board = blankBoard(p);
    for (let s = 0; s < 20; s++) {
      const t1 = performance.now();
      const h = nextHint(p, board);
      hintMs.push(performance.now() - t1);
      if (h.kind !== 'place') break;
      board = setCode(p, board, h.socket, h.code)!;
    }
    const deepest = deduce(p, 4);
    rows.push({
      sockets: p.sockets.length,
      pieces: p.stock.reduce((a, b) => a + b, 0),
      lit: p.target.filter((t) => t > 0).length,
      dark: p.target.filter((t) => t === 0).length,
      mixed: p.target.filter((t) => t === 3 || t === 5 || t === 6 || t === 7).length,
      givens: p.given.filter((g) => g >= 0).length,
      depth: d.solved ? d.depth : 99,
      deep: d.log.filter((e) => e.depth >= 2).length,
      elim: deepest.log.length,
      types: p.stock.filter((x) => x > 0).length,
    });
  }
  const col = (f: (r: (typeof rows)[0]) => number) => rows.map(f);
  const hist = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b).map((v) => `${v}:${xs.filter((x) => x === v).length}`).join(' ');
  console.log(`${SIZES[size].name} ${SIZES[size].n}x${SIZES[size].n} (${n} puzzles)`);
  console.log(`  generate ms: median ${q(ms, 0.5).toFixed(1)}, p90 ${q(ms, 0.9).toFixed(1)}, max ${Math.max(...ms).toFixed(1)}; attempts median ${q(att, 0.5)}, max ${Math.max(...att)}`);
  console.log(`  failed attempts: ${Object.entries(rejects).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  console.log(`  unique ${((100 * unique) / n).toFixed(0)}%, answer valid ${((100 * valid) / n).toFixed(0)}%`);
  console.log(`  sockets ${avg(col((r) => r.sockets))}, pieces ${avg(col((r) => r.pieces))} (${hist(col((r) => r.pieces))}), piece kinds ${avg(col((r) => r.types))}, givens ${avg(col((r) => r.givens))}`);
  console.log(`  crystals lit ${avg(col((r) => r.lit))} (mixed colour ${avg(col((r) => r.mixed))}), dark ${avg(col((r) => r.dark))}`);
  console.log(`  hint ms: median ${q(hintMs, 0.5).toFixed(1)}, p90 ${q(hintMs, 0.9).toFixed(1)}, max ${Math.max(...hintMs).toFixed(1)}`);
  console.log(`  deduction depth ${hist(col((r) => r.depth))}; depth-2 steps per puzzle ${hist(col((r) => r.deep))}; eliminations ${avg(col((r) => r.elim))}`);
}
