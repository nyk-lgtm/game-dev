// Surveys the hand-made levels: `npx vite-node scripts/trestle/tutorials.ts`
// Prints the surveyor's cost and parts per tutorial (par and budget are set by hand from these).

import { TUTORIALS, survey, toActions, judge } from '../../src/trestle/core';

for (const l of TUTORIALS) {
  const s = survey(l, 3);
  if (!s) {
    console.log(`${l.id} ${l.name}: NO SOLUTION`);
    continue;
  }
  const a = toActions(l, s.members);
  const v = judge(l, a);
  console.log(`${l.id} ${l.name}: surveyor cost ${s.cost}, ${s.parts} parts (${v.outcome}); set par ${l.par}/${l.parParts}, budget ${l.budget}  a=${a}`);
}
