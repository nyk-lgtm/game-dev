// Hint walk-throughs: `npx vite-node scripts/triad/hints.ts [seeds] [examples]`. Follows hints alone to the end on
// Medium and Large per level and clue mode and prints how many named several clues, the "what if" chains, ms per hint.
import { generate, nextHint, solved, type ClueMode, type Level } from '../../src/triad/core';

const seeds = Number(process.argv[2] ?? 6);
const show = Number(process.argv[3] ?? 2);
const sizes: Record<number, string> = { 2: 'small', 3: 'medium', 4: 'large' };
for (const level of ['easy', 'normal', 'hard'] as Level[])
  for (const mode of ['numbers', 'links'] as ClueMode[])
    for (const r of [3, 4]) {
      let n = 0, multi = 0, trials = 0, chainSum = 0, maxChain = 0, maxMs = 0, total = 0;
      const examples: string[] = [];
      for (let seed = 1; seed <= seeds; seed++) {
        const p = generate(seed, r, level, mode);
        const vals = p.given.map(() => -1);
        const notes = p.given.map(() => 0);
        for (let k = 0; k < 400 && !solved(p, vals); k++) {
          const t0 = performance.now();
          const h = nextHint(p, vals, notes);
          const ms = performance.now() - t0;
          total += ms;
          maxMs = Math.max(maxMs, ms);
          n++;
          if (h.kind === 'step' || h.kind === 'not') {
            if (h.trial) {
              trials++;
              chainSum += h.trial.chain.length;
              maxChain = Math.max(maxChain, h.trial.chain.length);
              if (examples.length < show) examples.push(`${h.text} [chain ${h.trial.chain.length}, clues ${h.clues?.length}]`);
            } else if ((h.clues?.length ?? 0) > 1) {
              multi++;
              if (examples.length < show) examples.push(h.text);
            }
          }
          if (h.kind === 'step') vals[h.cell] = h.value;
          else if (h.kind === 'not') notes[h.cell] = (notes[h.cell] || 7) & ~(1 << h.not);
        }
      }
      const chains = trials ? `, what-ifs ${trials} (chain mean ${(chainSum / trials).toFixed(1)}, max ${maxChain})` : '';
      console.log(`${level} ${mode} ${sizes[r]}: ${n} hints, ${multi} name several clues${chains}; ${(total / n).toFixed(1)} ms a hint, max ${maxMs.toFixed(0)}`);
      for (const e of examples) console.log(`    ${e.replace(/<\/?b>/g, '')}`);
    }
