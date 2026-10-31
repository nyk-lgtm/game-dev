// Glyphwright balance probe. Run: npx vite-node scripts/glyph/balance.ts [runs]
import { play } from './bot';

const runs = Number(process.argv[2] ?? 20);
const waves: number[] = [];
let wins = 0;
for (let i = 1; i <= runs; i++) {
  const { s, dps } = play(i);
  waves.push(s.wave);
  if (s.phase === 'won') wins++;
  if (i <= 8) console.log(`seed ${i}: ${s.phase} wave ${s.wave} hp ${s.hp} kills ${s.totalKills} dps ${dps.join('/')} loom ${s.loom.map((r) => r.map((x) => (x ? x.id + x.tier : '-')).join(',')).join(' | ')}`);
}
waves.sort((a, b) => a - b);
console.log(`median wave ${waves[runs >> 1]}, wins ${wins}/${runs}, dist ${waves.join(' ')}`);
