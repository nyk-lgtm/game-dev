// Trace one bot run: periodic state lines from a start time.
// npx vite-node scripts/afterglow/trace.ts [seed] [from s] [to s] [every s]
import { playBot } from './bot';
import type { World } from '../../src/afterglow/core';
const [seed, from, to, every] = [Number(process.argv[2] ?? 1), Number(process.argv[3] ?? 0), Number(process.argv[4] ?? 900), Number(process.argv[5] ?? 5)];
playBot(seed, process.argv[6] ?? 'spark', to, {
  onStep: (w: World) => {
    if (w.time < from || w.tick % Math.round(every * 60) !== 0) return;
    const boss = w.enemies.find((e) => e.kind === 'eclipse' || e.kind === 'prism');
    console.log(`${w.time.toFixed(0)}s hp ${w.player.hp.toFixed(0)}/${w.stats.maxHp} lvl ${w.player.level} alive ${w.enemies.length} bullets ${w.bullets.length} ${boss ? `${boss.kind} ${Math.round((100 * boss.hp) / boss.maxHp)}%` : ''} [${w.weapons.map((x) => x.id + x.level)}]`);
  },
});
