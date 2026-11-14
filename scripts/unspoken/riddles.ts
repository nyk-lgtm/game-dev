// Riddle difficulty per place, normal play vs today's language: `npx vite-node scripts/unspoken/riddles.ts [seeds]`.
// Columns: riddles a place, grammar features per riddle sentence, signs over 6 glyphs, decoy tiles a compose,
// share of wrong scenes that keep every word (they differ only by a mark or a little word).
import { features, makeLanguage, makeWorld } from '../../src/unspoken/core';

const N = Number(process.argv[2] ?? 200);
for (const daily of [false, true]) {
  console.log(daily ? "today's language" : 'normal play');
  const rows: { n: number; f: number; long: number; dec: number; comp: number; same: number; wrong: number }[] = [];
  for (let seed = 0; seed < N; seed++) {
    const w = makeWorld(makeLanguage(seed), { daily });
    w.chapters.forEach((ch, i) => {
      const r = (rows[i] ??= { n: 0, f: 0, long: 0, dec: 0, comp: 0, same: 0, wrong: 0 });
      for (const c of ch.challenges) {
        if (c.question) continue;
        r.n++;
        r.f += features(c.frame);
        if (c.tokens.length > 6) r.long++;
        if (c.kind === 'compose') {
          r.comp++;
          r.dec += c.tiles.length - c.tokens.length;
        } else
          c.options.forEach((o, k) => {
            if (k === c.answer) return;
            r.wrong++;
            if (o.v === c.frame.v && o.s.n === c.frame.s.n && o.o?.n === c.frame.o?.n && o.d?.n === c.frame.d?.n) r.same++;
          });
      }
    });
  }
  const titles = makeWorld(makeLanguage(0)).chapters.map((c) => c.title);
  rows.forEach((r, i) =>
    console.log(
      `  ${titles[i].padEnd(18)} riddles ${(r.n / N).toFixed(2)}  features ${(r.f / r.n).toFixed(2)}  >6 glyphs ${Math.round((100 * r.long) / r.n)}%  decoys ${(r.dec / Math.max(1, r.comp)).toFixed(1)}  mark-only wrong ${Math.round((100 * r.same) / Math.max(1, r.wrong))}%`,
    ),
  );
}
