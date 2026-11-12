// npx vite-node scripts/unspoken/inspect.ts [seed] [village] — print a language, its world, and word coverage.
// village 2 is the mountain village (case particles, free order, verb agreement).
import { english, morphemes, newGame, tokenKey, writtenGrammar } from '../../src/unspoken/core';

const seed = +(process.argv[2] ?? 7);
const village = +(process.argv[3] ?? 1);
const s = newGame(seed, village);
const L = s.lang;
console.log(`village ${village} · ${L.name}: ${JSON.stringify(L.grammar)} style curvy=${L.style.curvy} radical=${L.style.radical}`);
console.log('grammar written:', writtenGrammar(L).join(' '));
const gl = (ks: string[]) => ks.join(' ');
const count = new Map<string, number>();
s.world.chapters.forEach((ch, i) => {
  console.log(`\n== ${i + 1}. ${ch.title}`);
  for (const p of ch.panels) {
    console.log(`  ${english(p.frame).padEnd(52)} | ${gl(p.tokens.map(tokenKey))}`);
    for (const m of morphemes(p.tokens)) count.set(m, (count.get(m) ?? 0) + 1);
  }
  for (const c of ch.challenges) {
    if (c.question) console.log(`  [question] ${gl(c.question.map(tokenKey))}`);
    console.log(`  [${c.kind}${c.tests ? ' ' + c.tests : ''}] ${english(c.frame)} | ${gl(c.tokens.map(tokenKey))}${c.kind === 'pick' ? ' | wrong: ' + c.options.filter((_, k) => k !== c.answer).map((f) => english(f)).join(' / ') : ' | tiles: ' + c.tiles.map(tokenKey).join(' ')}`);
  }
  if (ch.challenges.length < 3) console.log('  !! only', ch.challenges.length, 'challenges');
});
const single = [...count].filter(([, n]) => n < 2).map(([k]) => k);
console.log('\nwords:', count.size, 'appearing once:', single.join(' ') || 'none');
