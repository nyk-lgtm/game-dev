// A perfect run's actions, for `?seed=&a=` (screenshots, reports): `npx vite-node scripts/unspoken/solve.ts <seed> [places] [village] [daily]`.
// Stops after `places` places are done (default: all of them).
import { apply, encode, morphemes, newGame, tokenKey, type Action } from '../../src/unspoken/core';

const seed = Number(process.argv[2] ?? 1);
const places = Number(process.argv[3] ?? 99);
const village = Number(process.argv[4] ?? 1);
const daily = process.argv[5] === 'daily';
const s = newGame(seed, village, daily);
const acts: string[] = [];
const act = (a: Action) => {
  if (apply(s, a)) acts.push(encode(a));
};
while (!s.over && s.chapter < places) {
  const ch = s.world.chapters[s.chapter];
  const at = s.chapter;
  for (const p of ch.panels) for (const m of morphemes(p.tokens)) if (!s.confirmed.includes(m) && s.notebook[m] !== m) act({ t: 'guess', glyph: m, meaning: m });
  for (const c of ch.challenges) {
    if (c.kind === 'pick') act({ t: 'answer', challenge: c.id, pick: c.answer });
    else {
      const used = new Set<number>();
      const tiles = c.tokens.map((t) => {
        const i = c.tiles.findIndex((x, k) => !used.has(k) && tokenKey(x) === tokenKey(t));
        used.add(i);
        return i;
      });
      act({ t: 'answer', challenge: c.id, tiles });
    }
  }
  if (s.chapter === at && !s.over) break;
}
console.log(acts.join(','));
