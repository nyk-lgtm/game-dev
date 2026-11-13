// Surveys the hand-made levels: `npx vite-node scripts/trestle/tutorials.ts`
// Each tutorial's par is its `ref`: the obvious good build a learner would make
// (the lesson's shape, all twigs), not the surveyor's cleverest. This prints
// the ref's run (with its peak stress: it should hold with room to spare) and
// what the surveyor finds, which must not cost more than par.

import { TUTORIALS, judge, replayBuild, runSim, survey, toActions } from '../../src/trestle/core';

for (const l of TUTORIALS) {
  const ref = replayBuild(l, l.ref!).members;
  const r = runSim(l, ref);
  const v = judge(l, l.ref!);
  const s = survey(l, 3);
  const sa = s ? toActions(l, s.members) : '';
  console.log(
    `${l.id} ${l.name}: ref ${v.cost}/${v.parts} ${v.outcome} peak ${Math.max(...r.peak).toFixed(2)} (par ${l.par}/${l.parParts}, budget ${l.budget}); surveyor ${s ? `${s.cost}/${s.parts} a=${sa}` : 'NONE'}`,
  );
}
