// Balance probe: the completion bot plays N seeds start to finish.
// Run: npx vite-node scripts/lantern/balance.ts [runs]
import { playCompletion } from './bot';

const runs = Number(process.argv[2] ?? 50);
const median = (xs: number[]) => {
  if (!xs.length) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[a.length >> 1] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const tally = (xs: (string | number)[]) => {
  const m = new Map<string | number, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k}:${n}`).join(' ');
};

let won = 0;
const turns: number[] = [];
const actions: number[] = [];
const deaths: number[] = [];
const kings: NonNullable<ReturnType<typeof playCompletion>['king']>[] = [];
const endPotions: number[] = [];
const failed: number[] = [];
const kos: string[] = [];
for (let seed = 1; seed <= runs; seed++) {
  const r = playCompletion(seed);
  if (r.state.quest === 'won') won++;
  else failed.push(seed);
  turns.push(r.state.turn);
  actions.push(r.actions.length);
  deaths.push(r.state.deaths);
  endPotions.push(r.state.player.potions);
  if (r.king) kings.push(r.king);
  for (const k of r.knockouts) kos.push(`${k.map}/L${k.level}/${k.by}`);
}

console.log(`runs=${runs} completed=${won} (${((100 * won) / runs).toFixed(0)}%)${failed.length ? ` failed seeds: ${failed.join(',')}` : ''}`);
console.log(`median turns=${median(turns)} actions=${median(actions)} deaths=${median(deaths)} (max ${Math.max(...deaths)}; ${tally(deaths)})`);
console.log(`king killed in ${kings.length} runs, at turn median ${median(kings.map((k) => k.turn))}`);
console.log(`  level: ${tally(kings.map((k) => k.level))}  (median ${median(kings.map((k) => k.level))})`);
console.log(`  weapon: ${tally(kings.map((k) => k.weapon))}   armor: ${tally(kings.map((k) => k.armor))}`);
console.log(`  hp after kill: median ${median(kings.map((k) => k.hp))}/${median(kings.map((k) => k.maxHp))}   deaths before kill: median ${median(kings.map((k) => k.deaths))}`);
console.log(`  potions at kill: ${tally(kings.map((k) => k.potions))}   potions at end: median ${median(endPotions)}`);
console.log(`knock-outs (map/level/last hit by): ${tally(kos) || 'none'}`);
