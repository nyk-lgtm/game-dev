// Soundness stress: from many seeded part-filled boards, the deduction model must never
// rule out an answer piece and hints must lead to the answer.
// `npx vite-node scripts/gleam/stress.ts 300`
import { Ctx, SIZES, deduce, generate, nextHint, setCode, status, type Size } from '../../src/gleam/core';
import { Rng } from '../../src/shared/rng';

const n = Number(process.argv[2] ?? 100);
let bad = 0;
for (const size of Object.keys(SIZES) as Size[]) {
  for (let seed = 1; seed <= n; seed++) {
    const p = generate(seed * 31 + 7, size);
    const rng = new Rng(seed);
    for (let trial = 0; trial < 3; trial++) {
      const keep = rng.next();
      const board = p.solution.map((c, i) => (p.given[i] >= 0 || (c > 0 && rng.next() < keep) ? c : 0));
      const ctx = new Ctx(p);
      const dom0 = ctx.initial();
      board.forEach((c, i) => c > 0 && (dom0[i] = 1 << c));
      const d = deduce(p, 2, dom0, ctx);
      if (d.log.some((e) => e.code === p.solution[e.socket])) {
        bad++;
        console.log('UNSOUND', size, seed, board.join(''));
      }
      let b = board;
      for (let s = 0; s < 20 && !status(p, b).solved; s++) {
        const h = nextHint(p, b);
        const next = h.kind === 'place' && h.code === p.solution[h.socket] ? setCode(p, b, h.socket, h.code) : null;
        if (!next) {
          bad++;
          console.log('HINT', size, seed, board.join(''), JSON.stringify(h));
          break;
        }
        b = next;
      }
    }
  }
}
console.log(bad ? `${bad} problems` : 'all sound');
