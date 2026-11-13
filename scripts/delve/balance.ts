// Balance probe: the descent bot plays N seeds.
// Run: npx vite-node scripts/delve/balance.ts [runs] [firstSeed]
import { ARMORS, MAX_DEPTH, WEAPONS, generateFloor } from '../../src/delve/core';
import { playDescent } from './bot';

const runs = Number(process.argv[2] ?? 50);
const first = Number(process.argv[3] ?? 1);
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
const pct = (n: number) => `${((100 * n) / runs).toFixed(0)}%`;

const maxDepth: number[] = [];
const deaths: string[] = [];
const killers: string[] = [];
const turns: number[] = [];
const stuck: number[] = [];
const byDepth = new Map<number, { level: number[]; weapon: number[]; armor: number[]; hp: number[]; potions: number[]; turns: number[]; xp: number[]; heals: number[]; hurt: number[] }>();
const hurtBy = new Map<string, number>();
// Per depth: damage by kind (summed over floors played), killers, and how deaths happened.
const hurtAt = new Map<number, Map<string, number>>();
const killedAt = new Map<number, string[]>();
const deathAt = new Map<number, string[]>();
let won = 0;
for (let seed = first; seed < first + runs; seed++) {
  const r = playDescent(seed);
  const s = r.state;
  maxDepth.push(s.depth);
  turns.push(s.turn);
  if (s.status === 'won') won++;
  else if (s.status === 'dead') {
    deaths.push(`d${s.depth}`);
    killers.push(r.killer ?? '?');
    killedAt.set(s.depth, [...(killedAt.get(s.depth) ?? []), r.killer ?? '?']);
    const dc = r.death;
    if (dc)
      deathAt.set(s.depth, [
        ...(deathAt.get(s.depth) ?? []),
        `#${seed} ${r.killer} L${s.player.level} burst ${dc.burst}/${dc.maxHp} pot${dc.potions} mp${dc.mp} foes[${dc.foes.join(',')}]`,
      ]);
  } else stuck.push(seed);
  for (const f of r.floors) {
    const b = byDepth.get(f.depth) ?? { level: [], weapon: [], armor: [], hp: [], potions: [], turns: [], xp: [], heals: [], hurt: [] };
    b.level.push(f.level);
    b.weapon.push(f.weapon);
    b.armor.push(f.armor);
    b.hp.push(f.hp / f.maxHp);
    b.potions.push(f.potions);
    b.turns.push(f.turns);
    b.xp.push(f.xp);
    b.heals.push(f.heals);
    b.hurt.push(Object.values(f.hurt).reduce((a, x) => a + x, 0));
    const ha = hurtAt.get(f.depth) ?? new Map<string, number>();
    for (const [k, v] of Object.entries(f.hurt)) {
      hurtBy.set(k, (hurtBy.get(k) ?? 0) + v);
      ha.set(k, (ha.get(k) ?? 0) + v);
    }
    hurtAt.set(f.depth, ha);
    byDepth.set(f.depth, b);
  }
}

console.log(`runs=${runs} won=${won} (${pct(won)})  died=${deaths.length}  stuck/timeout=${stuck.length}${stuck.length ? ` (${stuck.join(',')})` : ''}`);
const reach = (d: number) => maxDepth.filter((x) => x >= d).length;
console.log(`reached: ${Array.from({ length: MAX_DEPTH }, (_, i) => `d${i + 1}:${pct(reach(i + 1))}`).join(' ')}`);
console.log(`deaths by depth: ${tally(deaths) || 'none'}`);
console.log(`killers: ${tally(killers) || 'none'}`);
console.log(`turns per run: median ${median(turns)} (min ${Math.min(...turns)}, max ${Math.max(...turns)})`);
console.log(`damage taken by kind (all runs): ${[...hurtBy].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`);
console.log('on arrival at depth: level xp / weapon / armor / hp% / potions; then on the floor: turns, damage taken, heals (medians)');
for (const [d, b] of [...byDepth].sort((x, y) => x[0] - y[0]))
  console.log(
    `  d${d} n=${b.level.length}: L${median(b.level)} ${WEAPONS[median(b.weapon) | 0]} ${ARMORS[median(b.armor) | 0]} hp${(100 * median(b.hp)).toFixed(0)}% pot${median(b.potions)} xp${median(b.xp)} | turns${median(b.turns)} hurt${median(b.hurt)} heals${median(b.heals)}`,
  );

console.log('damage by depth (mean per floor played, by kind) and killers there:');
for (const [d, b] of [...byDepth].sort((x, y) => x[0] - y[0])) {
  const n = b.level.length;
  const ha = [...(hurtAt.get(d) ?? [])].sort((a, c) => c[1] - a[1]);
  const tot = ha.reduce((a, x) => a + x[1], 0);
  console.log(`  d${d} ${(tot / n).toFixed(0)}: ${ha.map(([k, v]) => `${k}:${(v / n).toFixed(0)}`).join(' ')}${killedAt.has(d) ? `  | died ${killedAt.get(d)!.length}: ${tally(killedAt.get(d)!)}` : ''}`);
}
if (process.env.DEATHS) for (const [d, xs] of [...deathAt].sort((x, y) => x[0] - y[0])) for (const x of xs) console.log(`  d${d} ${x}`);
// What each floor holds (straight from the generator, same seeds).
console.log('floor contents (mean per floor over the same seeds): monsters by kind');
for (let d = 1; d < MAX_DEPTH; d++) {
  const c = new Map<string, number>();
  for (let seed = first; seed < first + runs; seed++) for (const m of generateFloor(seed, d).monsters) c.set(m.kind, (c.get(m.kind) ?? 0) + 1);
  const tot = [...c.values()].reduce((a, x) => a + x, 0);
  console.log(`  d${d} ${(tot / runs).toFixed(1)}: ${[...c].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${(v / runs).toFixed(1)}`).join(' ')}`);
}
