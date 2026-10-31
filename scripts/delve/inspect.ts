// Debug helper: print a bot run's final floor. npx vite-node scripts/delve/inspect.ts seed...
import { idx, replay, SIZE } from '../../src/delve/core';
import { playDescent } from './bot';

for (const seed of process.argv.slice(2).map(Number)) {
  let t0 = performance.now();
  const r = playDescent(seed);
  const tBot = performance.now() - t0;
  t0 = performance.now();
  replay(seed, r.actions);
  const tRep = performance.now() - t0;
  const s = r.state;
  console.log(`seed ${seed} ${s.status} depth ${s.depth} turn ${s.turn} actions ${r.actions.length} hp ${s.player.hp}/${s.player.maxHp} L${s.player.level} killer ${r.killer} bot ${tBot.toFixed(0)}ms replay ${tRep.toFixed(0)}ms`);
  console.log('tail', r.actions.slice(-40));
  const rows: string[] = [];
  for (let y = 0; y < SIZE; y++) {
    let row = '';
    for (let x = 0; x < SIZE; x++) {
      const m = s.monsters.find((m) => m.x === x && m.y === y);
      const t = s.level.tiles[idx(x, y)];
      const c = x === s.player.x && y === s.player.y ? '@' : m ? m.kind[0].toUpperCase() : { wall: '#', floor: '.', door: '+', open: "'", stairs: '>', pillar: 'O' }[t];
      row += s.level.seen[idx(x, y)] || c === '@' || m ? c : ' ';
    }
    rows.push(row);
  }
  console.log(rows.join('\n'));
  console.log(s.monsters.map((m) => `${m.kind}@${m.x},${m.y} hp${m.hp}${m.awake ? ' awake' : ''}`).join(' '));
  console.log(s.log.slice(-8).join('\n'));
}
