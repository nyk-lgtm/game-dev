// How often the look-alike glyph fix redraws glyphs: `npx vite-node scripts/unspoken/alike.ts [seeds] [seed to show]`.
import { ALL_CONCEPTS, CONCEPTS, makeLanguage } from '../../src/unspoken/core';

const N = Number(process.argv[2] ?? 500);
const show = process.argv[3];
if (show) {
  for (const v of [1, 2]) {
    const raw = makeLanguage(+show, v, false);
    const L = makeLanguage(+show, v);
    for (const c of v === 2 ? ALL_CONCEPTS : CONCEPTS) {
      const a = JSON.stringify(raw.glyphs[c.id]?.strokes);
      const b = JSON.stringify(L.glyphs[c.id]?.strokes);
      if (a !== b) console.log(`v${v} ${c.id}: ${a}\n      -> ${b}`);
    }
  }
}
for (const v of [1, 2]) {
  let n = 0;
  let langs = 0;
  const by = new Map<string, number>();
  for (let seed = 0; seed < N; seed++) {
    const raw = makeLanguage(seed, v, false);
    const L = makeLanguage(seed, v);
    let any = false;
    for (const c of v === 2 ? ALL_CONCEPTS : CONCEPTS) {
      if (JSON.stringify(raw.glyphs[c.id]) === JSON.stringify(L.glyphs[c.id])) continue;
      n++;
      any = true;
      by.set(c.cat, (by.get(c.cat) ?? 0) + 1);
    }
    if (any) langs++;
  }
  console.log(`village ${v}: ${n} glyphs redrawn over ${N} languages (${Math.round((100 * langs) / N)}% touched); by kind ${[...by].map(([k, x]) => `${k} ${x}`).join(', ')}`);
}
