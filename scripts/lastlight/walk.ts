// Prints a Last Light run as text: npx vite-node scripts/lastlight/walk.ts <night> <id,id,...>
// (the ids from a bug report's a=). Ends with the choices left, or the ending.

import { NIGHTS } from '../../src/lastlight/core/nights';

const story = NIGHTS[Number(process.argv[2] ?? 1) - 1];
const ids = (process.argv[3] ?? '').split(',').filter(Boolean);
const s = story.newGame();
console.log(story.intro.join('\n'), '\n');
console.log(story.describe(s).join('\n'));
for (const id of ids) {
  const out = story.act(s, id);
  console.log(`\n>> ${id}  [${story.clock(s)}, t=${s.t}]`);
  if (!out) {
    console.log('ILLEGAL here');
    break;
  }
  console.log(out.join('\n'));
}
if (s.over) console.log(`\n${s.over.title} ${'★'.repeat(s.over.stars)}\n${s.over.text.join('\n')}`);
else console.log('\nChoices:', story.choices(s).map((c) => c.id).join(' '));
