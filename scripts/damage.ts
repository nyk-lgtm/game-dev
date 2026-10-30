// Where does the player get hurt? Greedy bot plays 150 runs and tallies
// damage by source and depth. Run: npx vite-node scripts/damage.ts
import { applyAction, newRun, PLAYER_ID } from '../src/core';
import { greedyAction } from './bot';
const src: Record<string, number> = {};
const byDepth: Record<number, number> = {};
for (let seed = 1; seed <= 150; seed++) {
  let s = newRun(seed);
  while (s.status === 'playing' && s.turn < 600) {
    const a = greedyAction(s);
    const r = applyAction(s, a);
    let last = '';
    for (const ev of r.events) {
      if (ev.type === 'attack') last = ev.by === PLAYER_ID ? 'player' : `${s.enemies.find(e => e.id === ev.by)?.kind}:${ev.kind}`;
      if (ev.type === 'shot') last = 'archer:shot';
      if (ev.type === 'explode') last = 'bomb';
      if (ev.type === 'slam') last = 'slam';
      if (ev.type === 'damage' && ev.target === PLAYER_ID) { src[last] = (src[last] ?? 0) + 1; byDepth[s.depth] = (byDepth[s.depth] ?? 0) + 1; }
    }
    s = r.state;
  }
}
console.log(src, byDepth);
