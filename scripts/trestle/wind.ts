// Does wind change the build? `npx vite-node scripts/trestle/wind.ts 20 [wind]`
// Takes calm levels of several types, adds wind, and checks whether the calm
// level's par build still survives the wind, and how much the windy par costs.

import { LEVEL_TYPES, SURVEY_EFFORT, WON, costOf, makeLevel, replayBuild, runSim, survey, type LevelType } from '../../src/trestle/core';

const n = Number(process.argv[2] ?? 20);
const wind = Number(process.argv[3] ?? 2.2);
let broke = 0;
let solved = 0;
const rise: number[] = [];
for (let i = 0; i < n; i++) {
  const type = LEVEL_TYPES[i % LEVEL_TYPES.length] as LevelType;
  const calm = { ...makeLevel(5000 + i, 0.6, undefined, type), wind: undefined };
  const windy = { ...calm, wind: i % 2 ? wind : -wind };
  const calmBuild = replayBuild(calm, calm.ref!).members;
  const still = WON.has(runSim(windy, calmBuild).outcome);
  if (!still) broke++;
  const s = survey(windy, SURVEY_EFFORT);
  if (s) {
    solved++;
    rise.push(s.cost / costOf(calmBuild) - 1);
  }
  console.log(`${type.padEnd(7)} calm par ${calm.par}: ${still ? 'still holds in wind' : 'FAILS in wind'}; windy par ${s ? s.cost : 'none'}`);
}
const q = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.floor(a.length * p)] ?? 0;
console.log(`wind ${wind}: the calm par build fails in ${broke}/${n}; windy levels solvable ${solved}/${n}; windy par vs calm median +${(q(rise, 0.5) * 100).toFixed(0)}%`);
